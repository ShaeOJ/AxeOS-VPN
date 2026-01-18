import type {
  WebSocketMessage,
  MetricsUpdateMessage,
  DeviceStatusMessage,
  AlertMessage,
  SubscriptionConfirmMessage,
} from '@axeos-vpn/shared-types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface TunnelClientOptions {
  serverUrl: string;
  token: string;
  clientType: 'agent' | 'desktop' | 'mobile';
  deviceId?: string;
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  heartbeatIntervalMs?: number;
  connectionTimeoutMs?: number;
}

export interface TunnelClientEvents {
  // Connection events
  stateChange: (state: ConnectionState) => void;
  authenticated: (userId: string) => void;
  authError: (error: string) => void;
  disconnected: (code: number, reason: string) => void;
  error: (error: Error) => void;

  // Data events
  message: (message: WebSocketMessage) => void;
  metricsUpdate: (message: MetricsUpdateMessage) => void;
  deviceStatus: (message: DeviceStatusMessage) => void;
  alert: (message: AlertMessage) => void;
  subscriptionConfirm: (message: SubscriptionConfirmMessage) => void;
}
