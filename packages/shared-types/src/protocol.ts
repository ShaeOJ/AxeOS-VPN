/**
 * WebSocket Protocol Message Types
 * Defines the contract between agents, relay server, and clients
 */

// Base message structure
export interface BaseMessage {
  type: string;
  timestamp: number;
  messageId: string;
}

// Authentication messages
export interface AuthenticateMessage extends BaseMessage {
  type: 'authenticate';
  payload: {
    token: string;
    clientType: 'agent' | 'desktop' | 'mobile';
    deviceId?: string; // Required for agents
  };
}

export interface AuthenticatedMessage extends BaseMessage {
  type: 'authenticated';
  payload: {
    success: boolean;
    userId?: string;
    error?: string;
  };
}

// Device pairing messages
export interface PairRequestMessage extends BaseMessage {
  type: 'pair_request';
  payload: {
    pairingCode: string;
    deviceName: string;
  };
}

export interface PairResponseMessage extends BaseMessage {
  type: 'pair_response';
  payload: {
    success: boolean;
    deviceId?: string;
    deviceToken?: string;
    error?: string;
  };
}

// Subscription messages (client subscribes to device updates)
export interface SubscribeMessage extends BaseMessage {
  type: 'subscribe';
  payload: {
    deviceIds: string[];
  };
}

export interface UnsubscribeMessage extends BaseMessage {
  type: 'unsubscribe';
  payload: {
    deviceIds: string[];
  };
}

export interface SubscriptionConfirmMessage extends BaseMessage {
  type: 'subscription_confirm';
  payload: {
    subscribedDevices: string[];
  };
}

// Metrics messages
export interface MetricsUpdateMessage extends BaseMessage {
  type: 'metrics_update';
  payload: {
    deviceId: string;
    metrics: MetricsSnapshot;
  };
}

export interface MetricsRequestMessage extends BaseMessage {
  type: 'metrics_request';
  payload: {
    deviceId: string;
  };
}

// Device status messages
export interface DeviceStatusMessage extends BaseMessage {
  type: 'device_status';
  payload: {
    deviceId: string;
    isOnline: boolean;
    lastSeen: number;
  };
}

// Alert messages
export interface AlertMessage extends BaseMessage {
  type: 'alert';
  payload: {
    alertId: string;
    deviceId: string;
    alertType: AlertType;
    severity: AlertSeverity;
    message: string;
    value: number;
    threshold: number;
  };
}

export interface AlertAcknowledgeMessage extends BaseMessage {
  type: 'alert_acknowledge';
  payload: {
    alertId: string;
  };
}

// Heartbeat messages
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  payload: {
    clientType: 'agent' | 'desktop' | 'mobile';
  };
}

export interface HeartbeatAckMessage extends BaseMessage {
  type: 'heartbeat_ack';
  payload: {
    serverTime: number;
  };
}

// Error messages
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Union type for all messages
export type WebSocketMessage =
  | AuthenticateMessage
  | AuthenticatedMessage
  | PairRequestMessage
  | PairResponseMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | SubscriptionConfirmMessage
  | MetricsUpdateMessage
  | MetricsRequestMessage
  | DeviceStatusMessage
  | AlertMessage
  | AlertAcknowledgeMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | ErrorMessage;

// Message type constants
export const MessageTypes = {
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  PAIR_REQUEST: 'pair_request',
  PAIR_RESPONSE: 'pair_response',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  SUBSCRIPTION_CONFIRM: 'subscription_confirm',
  METRICS_UPDATE: 'metrics_update',
  METRICS_REQUEST: 'metrics_request',
  DEVICE_STATUS: 'device_status',
  ALERT: 'alert',
  ALERT_ACKNOWLEDGE: 'alert_acknowledge',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat_ack',
  ERROR: 'error',
} as const;

// Metrics data structures
export interface MetricsSnapshot {
  timestamp: number;
  hashrate: HashrateMetrics;
  temperature: TemperatureMetrics;
  power: PowerMetrics;
  fans: FanMetrics[];
  gpus: GpuMetrics[];
  system: SystemMetrics;
}

export interface HashrateMetrics {
  current: number; // H/s
  average: number; // 15 min average
  accepted: number; // Accepted shares
  rejected: number; // Rejected shares
  stale: number; // Stale shares
}

export interface TemperatureMetrics {
  average: number; // Celsius
  max: number;
  hotspots: { location: string; temp: number }[];
}

export interface PowerMetrics {
  total: number; // Watts
  efficiency: number; // H/W
  perGpu: number[];
}

export interface FanMetrics {
  id: number;
  speed: number; // RPM
  percentage: number; // 0-100
}

export interface GpuMetrics {
  id: number;
  name: string;
  hashrate: number;
  temperature: number;
  fanSpeed: number;
  power: number;
  memoryUsed: number; // MB
  memoryTotal: number; // MB
  coreClockMhz: number;
  memoryClockMhz: number;
}

export interface SystemMetrics {
  uptime: number; // seconds
  cpuUsage: number; // percentage
  memoryUsed: number; // MB
  memoryTotal: number; // MB
  networkRx: number; // bytes/s
  networkTx: number; // bytes/s
}

// Alert types
export type AlertType =
  | 'high_temperature'
  | 'low_hashrate'
  | 'hashrate_drop'
  | 'gpu_error'
  | 'device_offline'
  | 'high_power'
  | 'fan_failure'
  | 'memory_error';

export type AlertSeverity = 'info' | 'warning' | 'critical';

// Helper function to create a message ID
export function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Helper function to create a base message
export function createBaseMessage(type: string): BaseMessage {
  return {
    type,
    timestamp: Date.now(),
    messageId: createMessageId(),
  };
}
