/**
 * Core domain models used across the application
 */

// User model
export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithDevices extends User {
  devices: Device[];
}

// Device model
export interface Device {
  id: string;
  name: string;
  deviceToken: string;
  lastSeen: Date | null;
  isOnline: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceWithMetrics extends Device {
  latestMetrics: MetricSnapshotRecord | null;
}

// Metric snapshot stored in database
export interface MetricSnapshotRecord {
  id: string;
  deviceId: string;
  timestamp: Date;
  hashrate: number;
  temperature: number;
  power: number;
  data: Record<string, unknown>; // Full metrics JSON
  createdAt: Date;
}

// Alert model
export interface Alert {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

// Pairing code model
export interface PairingCode {
  id: string;
  code: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  deviceId: string | null;
  createdAt: Date;
}

// Alert configuration model
export interface AlertConfig {
  id: string;
  deviceId: string;
  alertType: string;
  enabled: boolean;
  threshold: number;
  createdAt: Date;
  updatedAt: Date;
}

// Session/token model
export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}
