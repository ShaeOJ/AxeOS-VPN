/**
 * API Request/Response Types
 */

// Authentication
export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Devices
export interface DeviceResponse {
  id: string;
  name: string;
  lastSeen: string | null;
  isOnline: boolean;
  createdAt: string;
}

export interface DeviceListResponse {
  devices: DeviceResponse[];
}

export interface PairDeviceRequest {
  // Empty - server generates code
}

export interface PairDeviceResponse {
  pairingCode: string;
  expiresAt: string;
}

export interface VerifyPairingRequest {
  pairingCode: string;
  deviceName: string;
}

export interface VerifyPairingResponse {
  deviceId: string;
  deviceToken: string;
}

// Metrics
export interface MetricsQueryParams {
  startTime?: string;
  endTime?: string;
  interval?: 'minute' | 'hour' | 'day';
  limit?: number;
}

export interface MetricDataPoint {
  timestamp: string;
  hashrate: number;
  temperature: number;
  power: number;
}

export interface MetricsResponse {
  deviceId: string;
  metrics: MetricDataPoint[];
  aggregations?: {
    avgHashrate: number;
    maxTemperature: number;
    avgPower: number;
  };
}

// Alerts
export interface AlertResponse {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface AlertListResponse {
  alerts: AlertResponse[];
}

export interface AlertConfigRequest {
  alertType: string;
  enabled: boolean;
  threshold: number;
}

export interface AlertConfigResponse {
  id: string;
  deviceId: string;
  alertType: string;
  enabled: boolean;
  threshold: number;
}

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Error codes
export const ApiErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  PAIRING_CODE_EXPIRED: 'PAIRING_CODE_EXPIRED',
  PAIRING_CODE_INVALID: 'PAIRING_CODE_INVALID',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];
