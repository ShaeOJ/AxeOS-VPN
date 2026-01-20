import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),

  // Server (for remote web access)
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  restartServer: () => ipcRenderer.invoke('restart-server'),

  // Devices (IP-based BitAxe devices)
  getDevices: () => ipcRenderer.invoke('get-devices'),
  addDevice: (ipAddress: string, name?: string) => ipcRenderer.invoke('add-device', ipAddress, name),
  testDeviceConnection: (ipAddress: string) => ipcRenderer.invoke('test-device-connection', ipAddress),
  deleteDevice: (id: string) => ipcRenderer.invoke('delete-device', id),
  updateDeviceName: (id: string, name: string) => ipcRenderer.invoke('update-device-name', id, name),
  updateDeviceIp: (id: string, ipAddress: string) => ipcRenderer.invoke('update-device-ip', id, ipAddress),
  refreshDevice: (id: string) => ipcRenderer.invoke('refresh-device', id),

  // Metrics
  getMetrics: (deviceId: string, options?: { startTime?: number; endTime?: number; limit?: number }) =>
    ipcRenderer.invoke('get-metrics', deviceId, options),
  getLatestMetrics: (deviceId: string) => ipcRenderer.invoke('get-latest-metrics', deviceId),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),

  // Cloudflare Tunnel (Remote Access)
  getTunnelStatus: () => ipcRenderer.invoke('get-tunnel-status'),
  startTunnel: () => ipcRenderer.invoke('start-tunnel'),
  stopTunnel: () => ipcRenderer.invoke('stop-tunnel'),

  // Utility
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Crypto Prices
  getBitcoinPrice: () => ipcRenderer.invoke('get-bitcoin-price'),
  getCryptoPrice: (coinId: string, currency?: string) => ipcRenderer.invoke('get-crypto-price', coinId, currency),
  getSupportedCoins: () => ipcRenderer.invoke('get-supported-coins'),
  getSupportedCurrencies: () => ipcRenderer.invoke('get-supported-currencies'),
  getPriceHistory: (coinId: string, currency?: string, days?: number) => ipcRenderer.invoke('get-price-history', coinId, currency, days),

  // Profitability Calculator
  getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),
  calculateProfitability: (hashrateGH: number, powerWatts: number, btcPriceUsd: number, electricityCost?: number) =>
    ipcRenderer.invoke('calculate-profitability', hashrateGH, powerWatts, btcPriceUsd, electricityCost),

  // Password Management
  isPasswordSet: () => ipcRenderer.invoke('is-password-set'),
  changePassword: (currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke('change-password', currentPassword, newPassword),
  resetPassword: () => ipcRenderer.invoke('reset-password'),

  // Events
  onDeviceMetrics: (callback: (data: { deviceId: string; data: AxeOSSystemInfo; isOnline: boolean }) => void) => {
    ipcRenderer.on('device-metrics', (_, data) => callback(data));
  },
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// AxeOS API response type
export interface AxeOSSystemInfo {
  power: number;
  voltage: number;
  current: number;
  efficiency: number;
  temp: number;
  temp2: number;
  vrTemp: number;
  hashRate: number;
  hashRate_1m: number;
  hashRate_10m: number;
  hashRate_1h: number;
  expectedHashrate: number;
  bestDiff: number;
  bestSessionDiff: number;
  sharesAccepted: number;
  sharesRejected: number;
  uptimeSeconds: number;
  hostname: string;
  ipv4: string;
  ASICModel: string;
  version: string;
  fanspeed: number;
  fanrpm: number;
  frequency: number;
  coreVoltage: number;
  poolDifficulty: number;
  stratumURL: string;
  stratumUser: string;
  wifiStatus: string;
  freeHeap: number;
  smallCoreCount: number;
  [key: string]: unknown;
}

// Type declaration for the exposed API
export interface ServerStatus {
  running: boolean;
  port: number;
  addresses: string[];
  setupRequired: boolean;
}

export interface Device {
  id: string;
  name: string;
  ipAddress: string;
  isOnline: boolean;
  lastSeen: number | null;
  createdAt: number;
  latestMetrics?: AxeOSSystemInfo | null;
}

export interface MetricData {
  timestamp: number;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: AxeOSSystemInfo | null;
}

export interface AddDeviceResult {
  success: boolean;
  device?: Device;
  error?: string;
}

export interface TestConnectionResult {
  success: boolean;
  data?: AxeOSSystemInfo;
  error?: string;
}

export interface TunnelStatus {
  enabled: boolean;
  url: string | null;
  isStarting: boolean;
}

export interface TunnelResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface CryptoPrice {
  price: number;
  change_24h: number;
  vol_24h: number;
  currency: string;
  last_updated: number;
}

export interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

// Legacy alias
export type BitcoinPrice = CryptoPrice;

export interface NetworkStats {
  difficulty: number;
  blockReward: number;
  blockHeight: number;
  lastUpdated: number;
}

export interface ProfitabilityResult {
  dailyBtc: number;
  weeklyBtc: number;
  monthlyBtc: number;
  yearlyBtc: number;
  dailyUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
  yearlyUsd: number;
  dailyPowerCost: number;
  weeklyPowerCost: number;
  monthlyPowerCost: number;
  yearlyPowerCost: number;
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  yearlyProfit: number;
  hashrate: number;
  power: number;
  difficulty: number;
  btcPrice: number;
  electricityCost: number;
}

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      isMaximized: () => Promise<boolean>;

      getServerStatus: () => Promise<ServerStatus>;
      restartServer: () => Promise<{ port: number; addresses: string[] }>;

      getDevices: () => Promise<Device[]>;
      addDevice: (ipAddress: string, name?: string) => Promise<AddDeviceResult>;
      testDeviceConnection: (ipAddress: string) => Promise<TestConnectionResult>;
      deleteDevice: (id: string) => Promise<{ success: boolean }>;
      updateDeviceName: (id: string, name: string) => Promise<{ success: boolean }>;
      updateDeviceIp: (id: string, ipAddress: string) => Promise<{ success: boolean }>;
      refreshDevice: (id: string) => Promise<{ success: boolean; data?: AxeOSSystemInfo; error?: string }>;

      getMetrics: (deviceId: string, options?: { startTime?: number; endTime?: number; limit?: number }) => Promise<MetricData[]>;
      getLatestMetrics: (deviceId: string) => Promise<{ timestamp: number; data: AxeOSSystemInfo } | null>;

      getSettings: () => Promise<Record<string, string>>;
      setSetting: (key: string, value: string) => Promise<{ success: boolean }>;

      getTunnelStatus: () => Promise<TunnelStatus>;
      startTunnel: () => Promise<TunnelResult>;
      stopTunnel: () => Promise<{ success: boolean }>;

      openExternal: (url: string) => Promise<{ success: boolean }>;

      getBitcoinPrice: () => Promise<CryptoPrice | null>;
      getCryptoPrice: (coinId: string, currency?: string) => Promise<CryptoPrice | null>;
      getSupportedCoins: () => Promise<CoinInfo[]>;
      getSupportedCurrencies: () => Promise<CurrencyInfo[]>;
      getPriceHistory: (coinId: string, currency?: string, days?: number) => Promise<PriceHistoryPoint[]>;

      getNetworkStats: () => Promise<NetworkStats | null>;
      calculateProfitability: (hashrateGH: number, powerWatts: number, btcPriceUsd: number, electricityCost?: number) => Promise<ProfitabilityResult | null>;

      isPasswordSet: () => Promise<boolean>;
      changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
      resetPassword: () => Promise<{ success: boolean }>;

      onDeviceMetrics: (callback: (data: { deviceId: string; data: AxeOSSystemInfo; isOnline: boolean }) => void) => void;
      onWindowMaximized: (callback: (isMaximized: boolean) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
