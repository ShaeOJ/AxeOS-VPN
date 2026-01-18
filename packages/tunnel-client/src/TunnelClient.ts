import { EventEmitter } from 'eventemitter3';
import type {
  WebSocketMessage,
  AuthenticateMessage,
  AuthenticatedMessage,
  SubscribeMessage,
  MetricsUpdateMessage,
  DeviceStatusMessage,
  AlertMessage,
  HeartbeatMessage,
  HeartbeatAckMessage,
  ErrorMessage,
  MetricsSnapshot,
} from '@axeos-vpn/shared-types';
import { createLogger, type Logger } from '@axeos-vpn/shared-utils';
import type { ConnectionState, TunnelClientEvents, TunnelClientOptions } from './types';

// Import ws for Node.js environments, use native WebSocket in browser
const WebSocketImpl =
  typeof WebSocket !== 'undefined'
    ? WebSocket
    : (require('ws') as typeof WebSocket);

export class TunnelClient extends EventEmitter<TunnelClientEvents> {
  private ws: WebSocket | null = null;
  private options: Required<TunnelClientOptions>;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private authenticated = false;
  private messageQueue: WebSocketMessage[] = [];
  private logger: Logger;

  constructor(options: TunnelClientOptions) {
    super();
    this.options = {
      serverUrl: options.serverUrl,
      token: options.token,
      clientType: options.clientType,
      deviceId: options.deviceId ?? '',
      autoReconnect: options.autoReconnect ?? true,
      reconnectIntervalMs: options.reconnectIntervalMs ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30000,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 10000,
    };
    this.logger = createLogger(`TunnelClient:${options.clientType}`);
  }

  public get connectionState(): ConnectionState {
    return this.state;
  }

  public get isConnected(): boolean {
    return this.state === 'connected' && this.authenticated;
  }

  public async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      this.logger.warn('Already connecting or connected');
      return;
    }

    this.setState('connecting');
    this.logger.info('Connecting to', this.options.serverUrl);

    try {
      await this.createConnection();
    } catch (error) {
      this.logger.error('Connection failed', error);
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  public disconnect(): void {
    this.logger.info('Disconnecting');
    this.cleanup();
    this.setState('disconnected');
  }

  public send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocketImpl.OPEN) {
      if (this.options.autoReconnect) {
        this.logger.debug('Queueing message while disconnected');
        this.messageQueue.push(message);
      } else {
        throw new Error('WebSocket not connected');
      }
      return;
    }

    const data = JSON.stringify(message);
    this.ws.send(data);
    this.logger.debug('Sent message', message.type);
  }

  public subscribe(deviceIds: string[]): void {
    const message: SubscribeMessage = {
      type: 'subscribe',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { deviceIds },
    };
    this.send(message);
  }

  public unsubscribe(deviceIds: string[]): void {
    const message: WebSocketMessage = {
      type: 'unsubscribe',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { deviceIds },
    };
    this.send(message);
  }

  public sendMetrics(deviceId: string, metrics: MetricsSnapshot): void {
    const message: MetricsUpdateMessage = {
      type: 'metrics_update',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: { deviceId, metrics },
    };
    this.send(message);
  }

  public updateToken(token: string): void {
    this.options.token = token;
    if (this.isConnected) {
      this.authenticate();
    }
  }

  private async createConnection(): Promise<void> {
    return new Promise((_resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeoutMs);

      try {
        this.ws = new WebSocketImpl(this.options.serverUrl);

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          this.logger.info('WebSocket connected');
          this.authenticate();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeoutId);
          this.logger.error('WebSocket error', error);
          this.emit('error', new Error('WebSocket error'));
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          this.logger.info('WebSocket closed', event.code, event.reason);
          this.handleClose(event.code, event.reason);
        };
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private authenticate(): void {
    const message: AuthenticateMessage = {
      type: 'authenticate',
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      payload: {
        token: this.options.token,
        clientType: this.options.clientType,
        deviceId: this.options.deviceId,
      },
    };
    this.send(message);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;
      this.logger.debug('Received message', message.type);

      switch (message.type) {
        case 'authenticated':
          this.handleAuthenticated(message as AuthenticatedMessage);
          break;
        case 'metrics_update':
          this.emit('metricsUpdate', message as MetricsUpdateMessage);
          break;
        case 'device_status':
          this.emit('deviceStatus', message as DeviceStatusMessage);
          break;
        case 'alert':
          this.emit('alert', message as AlertMessage);
          break;
        case 'heartbeat_ack':
          this.handleHeartbeatAck(message as HeartbeatAckMessage);
          break;
        case 'error':
          this.handleError(message as ErrorMessage);
          break;
        case 'subscription_confirm':
          this.emit('subscriptionConfirm', message);
          break;
        default:
          this.emit('message', message);
      }
    } catch (error) {
      this.logger.error('Failed to parse message', error);
    }
  }

  private handleAuthenticated(message: AuthenticatedMessage): void {
    if (message.payload.success) {
      this.authenticated = true;
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startHeartbeat();
      this.flushMessageQueue();
      this.emit('authenticated', message.payload.userId!);
      this.logger.info('Authenticated successfully');
    } else {
      this.logger.error('Authentication failed', message.payload.error);
      this.emit('authError', message.payload.error || 'Authentication failed');
      this.disconnect();
    }
  }

  private handleHeartbeatAck(message: HeartbeatAckMessage): void {
    const latency = Date.now() - message.payload.serverTime;
    this.logger.debug('Heartbeat latency', latency, 'ms');
  }

  private handleError(message: ErrorMessage): void {
    this.logger.error('Server error', message.payload.code, message.payload.message);
    this.emit('error', new Error(`${message.payload.code}: ${message.payload.message}`));
  }

  private handleClose(code: number, reason: string): void {
    this.authenticated = false;
    this.stopHeartbeat();

    if (this.state === 'disconnected') {
      return; // Intentional disconnect
    }

    this.setState('disconnected');
    this.emit('disconnected', code, reason);

    if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleConnectionError(error: Error): void {
    this.emit('error', error);

    if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts - 1),
      60000
    );

    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.setState('reconnecting');

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Error handled in connect()
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        const message: HeartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now(),
          messageId: this.generateMessageId(),
          payload: { clientType: this.options.clientType },
        };
        this.send(message);
      }
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (this.ws.readyState === WebSocketImpl.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }

      this.ws = null;
    }

    this.authenticated = false;
    this.messageQueue = [];
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
