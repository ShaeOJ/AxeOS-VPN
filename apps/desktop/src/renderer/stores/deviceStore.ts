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
  stratumPort: number;
  stratumUser: string;
  wifiStatus: string;
  freeHeap: number;
  smallCoreCount: number;
  [key: string]: unknown;
}

interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
}

interface Device {
  id: string;
  name: string;
  ipAddress: string;
  deviceType?: 'bitaxe' | 'bitmain' | 'canaan';
  isOnline: boolean;
  lastSeen: number | null;
  createdAt: number;
  groupId: string | null;
  allTimeBestDiff: number | null;
  allTimeBestDiffAt: number | null;
  latestMetrics?: AxeOSSystemInfo | null;
}

interface DeviceState {
  devices: Device[];
  groups: DeviceGroup[];
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
  addDeviceByIp: (ipAddress: string, name?: string, username?: string, password?: string) => Promise<{ success: boolean; device?: Device; error?: string; requiresAuth?: boolean }>;
  deleteDevice: (deviceId: string) => Promise<void>;
  updateDeviceName: (deviceId: string, name: string) => Promise<void>;
  updateDeviceIp: (deviceId: string, ipAddress: string) => Promise<void>;
  refreshDevice: (deviceId: string) => Promise<void>;
  testConnection: (ipAddress: string, username?: string, password?: string) => Promise<{ success: boolean; data?: AxeOSSystemInfo; error?: string; deviceType?: string; requiresAuth?: boolean }>;
  setupMetricsListener: () => void;

  // Group actions
  fetchGroups: () => Promise<void>;
  createGroup: (name: string, color: string) => Promise<DeviceGroup>;
  updateGroup: (id: string, name: string, color: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setDeviceGroup: (deviceId: string, groupId: string | null) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  groups: [],
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
      devices: state.devices.map((d) => {
        if (d.id !== deviceId) return d;
        // Sync allTimeBestDiff from incoming metrics - if bestDiff is higher, update the store
        const incomingBestDiff = Number(metrics.bestDiff) || 0;
        const currentAllTimeBest = d.allTimeBestDiff || 0;
        const newAllTimeBest = incomingBestDiff > currentAllTimeBest ? incomingBestDiff : currentAllTimeBest;
        return {
          ...d,
          latestMetrics: metrics,
          isOnline: true,
          lastSeen: Date.now(),
          allTimeBestDiff: newAllTimeBest,
        };
      }),
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

  addDeviceByIp: async (ipAddress: string, name?: string, username?: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.addDevice(ipAddress, name, username, password);
      if (result.requiresAuth) {
        set({ isLoading: false });
        return { success: false, requiresAuth: true, error: result.error };
      }
      if (!result.success || !result.device) {
        set({ isLoading: false, error: result.error || 'Failed to add device' });
        return { success: false, error: result.error || 'Failed to add device' };
      }
      set((state) => ({
        devices: [...state.devices, result.device!],
        isLoading: false,
      }));
      return { success: true, device: result.device };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to add device';
      set({ error, isLoading: false });
      return { success: false, error };
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

  testConnection: async (ipAddress: string, username?: string, password?: string) => {
    return window.electronAPI.testDeviceConnection(ipAddress, username, password);
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

  // Group actions
  fetchGroups: async () => {
    try {
      const groups = await window.electronAPI.getGroups();
      set({ groups });
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  },

  createGroup: async (name: string, color: string) => {
    const group = await window.electronAPI.createGroup(name, color);
    set((state) => ({
      groups: [...state.groups, group],
    }));
    return group;
  },

  updateGroup: async (id: string, name: string, color: string) => {
    await window.electronAPI.updateGroup(id, name, color);
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === id ? { ...g, name, color } : g
      ),
    }));
  },

  deleteGroup: async (id: string) => {
    await window.electronAPI.deleteGroup(id);
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      // Move devices from deleted group to ungrouped
      devices: state.devices.map((d) =>
        d.groupId === id ? { ...d, groupId: null } : d
      ),
    }));
  },

  setDeviceGroup: async (deviceId: string, groupId: string | null) => {
    await window.electronAPI.setDeviceGroup(deviceId, groupId);
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, groupId } : d
      ),
    }));
  },
}));
