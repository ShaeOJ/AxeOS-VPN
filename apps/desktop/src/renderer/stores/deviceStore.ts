import { create } from 'zustand';

// AxeOS system info from the device
interface AxeOSSystemInfo {
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

interface Device {
  id: string;
  name: string;
  ipAddress: string;
  isOnline: boolean;
  lastSeen: number | null;
  createdAt: number;
  latestMetrics?: AxeOSSystemInfo | null;
}

interface DeviceState {
  devices: Device[];
  selectedDeviceId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  updateDeviceStatus: (deviceId: string, isOnline: boolean) => void;
  updateDeviceMetrics: (deviceId: string, metrics: AxeOSSystemInfo) => void;
  selectDevice: (deviceId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // IPC-based actions
  fetchDevices: () => Promise<void>;
  addDeviceByIp: (ipAddress: string, name?: string) => Promise<Device>;
  deleteDevice: (deviceId: string) => Promise<void>;
  updateDeviceName: (deviceId: string, name: string) => Promise<void>;
  updateDeviceIp: (deviceId: string, ipAddress: string) => Promise<void>;
  refreshDevice: (deviceId: string) => Promise<void>;
  testConnection: (ipAddress: string) => Promise<{ success: boolean; data?: AxeOSSystemInfo; error?: string }>;
  setupMetricsListener: () => void;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  selectedDeviceId: null,
  isLoading: false,
  error: null,

  setDevices: (devices) => {
    set({ devices, error: null });
  },

  addDevice: (device) => {
    set((state) => ({
      devices: [...state.devices, device],
    }));
  },

  removeDevice: (deviceId) => {
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== deviceId),
      selectedDeviceId: state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
    }));
  },

  updateDeviceStatus: (deviceId, isOnline) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, isOnline, lastSeen: isOnline ? Date.now() : d.lastSeen } : d
      ),
    }));
  },

  updateDeviceMetrics: (deviceId, metrics) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, latestMetrics: metrics, isOnline: true, lastSeen: Date.now() } : d
      ),
    }));
  },

  selectDevice: (deviceId) => {
    set({ selectedDeviceId: deviceId });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error, isLoading: false });
  },

  // IPC-based actions
  fetchDevices: async () => {
    set({ isLoading: true });
    try {
      const devices = await window.electronAPI.getDevices();
      set({ devices, isLoading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch devices',
        isLoading: false,
      });
    }
  },

  addDeviceByIp: async (ipAddress: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.addDevice(ipAddress, name);
      if (!result.success || !result.device) {
        throw new Error(result.error || 'Failed to add device');
      }
      set((state) => ({
        devices: [...state.devices, result.device!],
        isLoading: false,
      }));
      return result.device;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to add device';
      set({ error, isLoading: false });
      throw new Error(error);
    }
  },

  deleteDevice: async (deviceId: string) => {
    try {
      await window.electronAPI.deleteDevice(deviceId);
      set((state) => ({
        devices: state.devices.filter((d) => d.id !== deviceId),
        selectedDeviceId: state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to delete device';
      set({ error });
      throw new Error(error);
    }
  },

  updateDeviceName: async (deviceId: string, name: string) => {
    try {
      await window.electronAPI.updateDeviceName(deviceId, name);
      set((state) => ({
        devices: state.devices.map((d) =>
          d.id === deviceId ? { ...d, name } : d
        ),
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to update device name';
      set({ error });
      throw new Error(error);
    }
  },

  updateDeviceIp: async (deviceId: string, ipAddress: string) => {
    try {
      await window.electronAPI.updateDeviceIp(deviceId, ipAddress);
      set((state) => ({
        devices: state.devices.map((d) =>
          d.id === deviceId ? { ...d, ipAddress } : d
        ),
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to update device IP';
      set({ error });
      throw new Error(error);
    }
  },

  refreshDevice: async (deviceId: string) => {
    try {
      const result = await window.electronAPI.refreshDevice(deviceId);
      if (result.success && result.data) {
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, latestMetrics: result.data, isOnline: true, lastSeen: Date.now() } : d
          ),
        }));
      } else {
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, isOnline: false } : d
          ),
        }));
      }
    } catch (err) {
      console.error('Failed to refresh device:', err);
    }
  },

  testConnection: async (ipAddress: string) => {
    return window.electronAPI.testDeviceConnection(ipAddress);
  },

  setupMetricsListener: () => {
    window.electronAPI.onDeviceMetrics(({ deviceId, data, isOnline }) => {
      if (isOnline && data) {
        get().updateDeviceMetrics(deviceId, data);
      } else {
        get().updateDeviceStatus(deviceId, false);
      }
    });
  },
}));
