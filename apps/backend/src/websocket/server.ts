import uWS from 'uWebSockets.js';
import { createLogger } from '@axeos-vpn/shared-utils';
import type {
  WebSocketMessage,
  AuthenticateMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  MetricsUpdateMessage,
  HeartbeatMessage,
} from '@axeos-vpn/shared-types';
import { authService } from '../services/auth.service';
import { deviceService } from '../services/device.service';
import { metricsService } from '../services/metrics.service';
import { config } from '../config';

const logger = createLogger('WebSocketServer');

interface ClientData {
  id: string;
  userId?: string;
  deviceId?: string;
  clientType?: 'agent' | 'desktop' | 'mobile';
  authenticated: boolean;
  subscribedDevices: Set<string>;
  lastHeartbeat: number;
}

type WebSocketWithData = uWS.WebSocket<ClientData>;

class RelayServer {
  private app: uWS.TemplatedApp;
  private clients: Map<string, WebSocketWithData> = new Map();
  private agentsByDeviceId: Map<string, string> = new Map(); // deviceId -> clientId
  private subscribersByDeviceId: Map<string, Set<string>> = new Map(); // deviceId -> Set<clientId>
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.app = uWS.App();
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.app.ws<ClientData>('/ws', {
      compression: uWS.SHARED_COMPRESSOR,
      maxPayloadLength: 1024 * 1024, // 1MB
      idleTimeout: 120,

      open: (ws) => {
        const clientId = this.generateClientId();
        ws.getUserData().id = clientId;
        ws.getUserData().authenticated = false;
        ws.getUserData().subscribedDevices = new Set();
        ws.getUserData().lastHeartbeat = Date.now();

        this.clients.set(clientId, ws);
        logger.info(`Client connected: ${clientId}`);
      },

      message: (ws, message, isBinary) => {
        try {
          const text = Buffer.from(message).toString('utf-8');
          const parsed = JSON.parse(text) as WebSocketMessage;
          this.handleMessage(ws, parsed);
        } catch (error) {
          logger.error('Failed to parse message', error);
          this.sendError(ws, 'PARSE_ERROR', 'Invalid message format');
        }
      },

      close: (ws, code, message) => {
        const data = ws.getUserData();
        logger.info(`Client disconnected: ${data.id}, code: ${code}`);
        this.handleDisconnect(ws);
      },
    });
  }

  private handleMessage(ws: WebSocketWithData, message: WebSocketMessage): void {
    const data = ws.getUserData();
    data.lastHeartbeat = Date.now();

    switch (message.type) {
      case 'authenticate':
        this.handleAuthenticate(ws, message as AuthenticateMessage);
        break;

      case 'subscribe':
        if (!data.authenticated) {
          this.sendError(ws, 'UNAUTHORIZED', 'Not authenticated');
          return;
        }
        this.handleSubscribe(ws, message as SubscribeMessage);
        break;

      case 'unsubscribe':
        if (!data.authenticated) {
          this.sendError(ws, 'UNAUTHORIZED', 'Not authenticated');
          return;
        }
        this.handleUnsubscribe(ws, message as UnsubscribeMessage);
        break;

      case 'metrics_update':
        if (!data.authenticated || data.clientType !== 'agent') {
          this.sendError(ws, 'UNAUTHORIZED', 'Only agents can send metrics');
          return;
        }
        this.handleMetricsUpdate(ws, message as MetricsUpdateMessage);
        break;

      case 'heartbeat':
        this.handleHeartbeat(ws, message as HeartbeatMessage);
        break;

      default:
        logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async handleAuthenticate(
    ws: WebSocketWithData,
    message: AuthenticateMessage
  ): Promise<void> {
    const data = ws.getUserData();
    const { token, clientType, deviceId } = message.payload;

    try {
      if (clientType === 'agent') {
        // Agent authentication - verify device token
        if (!deviceId) {
          this.sendAuthenticated(ws, false, undefined, 'Device ID required for agents');
          return;
        }

        const device = await deviceService.getDeviceByToken(token);
        if (!device || device.id !== deviceId) {
          this.sendAuthenticated(ws, false, undefined, 'Invalid device token');
          return;
        }

        data.userId = device.userId;
        data.deviceId = deviceId;
        data.clientType = 'agent';
        data.authenticated = true;

        // Track agent connection
        this.agentsByDeviceId.set(deviceId, data.id);

        // Update device status
        await deviceService.updateDeviceStatus(deviceId, true);

        // Notify subscribers that device is online
        this.broadcastDeviceStatus(deviceId, true);

        logger.info(`Agent authenticated: device ${deviceId}`);
      } else {
        // Client authentication - verify JWT
        const payload = authService.verifyAccessToken(token);

        data.userId = payload.userId;
        data.clientType = clientType;
        data.authenticated = true;

        logger.info(`Client authenticated: user ${payload.userId}, type ${clientType}`);
      }

      this.sendAuthenticated(ws, true, data.userId);
    } catch (error) {
      logger.error('Authentication failed', error);
      this.sendAuthenticated(ws, false, undefined, 'Authentication failed');
    }
  }

  private async handleSubscribe(ws: WebSocketWithData, message: SubscribeMessage): Promise<void> {
    const data = ws.getUserData();
    const { deviceIds } = message.payload;

    // Verify user owns all devices
    const subscribedDevices: string[] = [];

    for (const deviceId of deviceIds) {
      const device = await deviceService.getDeviceById(deviceId, data.userId!);
      if (device) {
        // Add to subscriptions
        data.subscribedDevices.add(deviceId);

        if (!this.subscribersByDeviceId.has(deviceId)) {
          this.subscribersByDeviceId.set(deviceId, new Set());
        }
        this.subscribersByDeviceId.get(deviceId)!.add(data.id);

        subscribedDevices.push(deviceId);

        // Send current device status
        const isOnline = this.agentsByDeviceId.has(deviceId);
        this.sendToClient(ws, {
          type: 'device_status',
          timestamp: Date.now(),
          messageId: this.generateMessageId(),
          payload: {
            deviceId,
            isOnline,
            lastSeen: Date.now(),
          },
        });
      }
    }

    // Send subscription confirmation
    this.sendToClient(ws, {
      type: 'subscription_confirm',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { subscribedDevices },
    });

    logger.info(`Client ${data.id} subscribed to devices: ${subscribedDevices.join(', ')}`);
  }

  private handleUnsubscribe(ws: WebSocketWithData, message: UnsubscribeMessage): void {
    const data = ws.getUserData();
    const { deviceIds } = message.payload;

    for (const deviceId of deviceIds) {
      data.subscribedDevices.delete(deviceId);
      this.subscribersByDeviceId.get(deviceId)?.delete(data.id);
    }

    logger.info(`Client ${data.id} unsubscribed from devices: ${deviceIds.join(', ')}`);
  }

  private async handleMetricsUpdate(
    ws: WebSocketWithData,
    message: MetricsUpdateMessage
  ): Promise<void> {
    const data = ws.getUserData();
    const { deviceId, metrics } = message.payload;

    // Verify this is the correct agent for this device
    if (data.deviceId !== deviceId) {
      this.sendError(ws, 'FORBIDDEN', 'Not authorized for this device');
      return;
    }

    // Save metrics to database
    try {
      await metricsService.saveMetrics(deviceId, metrics);
    } catch (error) {
      logger.error('Failed to save metrics', error);
    }

    // Forward metrics to all subscribers
    const subscribers = this.subscribersByDeviceId.get(deviceId);
    if (subscribers) {
      for (const subscriberId of subscribers) {
        const subscriber = this.clients.get(subscriberId);
        if (subscriber) {
          this.sendToClient(subscriber, message);
        }
      }
    }
  }

  private handleHeartbeat(ws: WebSocketWithData, message: HeartbeatMessage): void {
    this.sendToClient(ws, {
      type: 'heartbeat_ack',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { serverTime: Date.now() },
    });
  }

  private async handleDisconnect(ws: WebSocketWithData): Promise<void> {
    const data = ws.getUserData();

    // Remove from clients
    this.clients.delete(data.id);

    // If agent, update device status and notify subscribers
    if (data.clientType === 'agent' && data.deviceId) {
      this.agentsByDeviceId.delete(data.deviceId);

      try {
        await deviceService.updateDeviceStatus(data.deviceId, false);
      } catch (error) {
        logger.error('Failed to update device status', error);
      }

      this.broadcastDeviceStatus(data.deviceId, false);
    }

    // Remove from all subscriptions
    for (const deviceId of data.subscribedDevices) {
      this.subscribersByDeviceId.get(deviceId)?.delete(data.id);
    }
  }

  private broadcastDeviceStatus(deviceId: string, isOnline: boolean): void {
    const subscribers = this.subscribersByDeviceId.get(deviceId);
    if (!subscribers) return;

    const message: WebSocketMessage = {
      type: 'device_status',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: {
        deviceId,
        isOnline,
        lastSeen: Date.now(),
      },
    };

    for (const subscriberId of subscribers) {
      const subscriber = this.clients.get(subscriberId);
      if (subscriber) {
        this.sendToClient(subscriber, message);
      }
    }
  }

  private sendToClient(ws: WebSocketWithData, message: WebSocketMessage): void {
    try {
      ws.send(JSON.stringify(message), false);
    } catch (error) {
      logger.error('Failed to send message', error);
    }
  }

  private sendAuthenticated(
    ws: WebSocketWithData,
    success: boolean,
    userId?: string,
    error?: string
  ): void {
    this.sendToClient(ws, {
      type: 'authenticated',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { success, userId, error },
    });
  }

  private sendError(ws: WebSocketWithData, code: string, message: string): void {
    this.sendToClient(ws, {
      type: 'error',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { code, message },
    });
  }

  private generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private startHeartbeatCheck(): void {
    const HEARTBEAT_TIMEOUT = 90000; // 90 seconds

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [clientId, ws] of this.clients) {
        const data = ws.getUserData();
        if (now - data.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          logger.warn(`Client ${clientId} timed out`);
          ws.close();
        }
      }
    }, 30000);
  }

  public start(port: number): void {
    this.app.listen(port, (listenSocket) => {
      if (listenSocket) {
        logger.info(`WebSocket server listening on port ${port}`);
        this.startHeartbeatCheck();
      } else {
        logger.error(`Failed to start WebSocket server on port ${port}`);
      }
    });
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const [_, ws] of this.clients) {
      ws.close();
    }

    this.clients.clear();
    this.agentsByDeviceId.clear();
    this.subscribersByDeviceId.clear();
  }

  public getStats(): {
    totalClients: number;
    agents: number;
    desktopClients: number;
    mobileClients: number;
  } {
    let agents = 0;
    let desktopClients = 0;
    let mobileClients = 0;

    for (const [_, ws] of this.clients) {
      const data = ws.getUserData();
      if (data.authenticated) {
        switch (data.clientType) {
          case 'agent':
            agents++;
            break;
          case 'desktop':
            desktopClients++;
            break;
          case 'mobile':
            mobileClients++;
            break;
        }
      }
    }

    return {
      totalClients: this.clients.size,
      agents,
      desktopClients,
      mobileClients,
    };
  }
}

export const relayServer = new RelayServer();
