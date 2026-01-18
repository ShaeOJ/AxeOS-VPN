import { create } from 'zustand';
import type { DeviceResponse, MetricsSnapshot } from '@axeos-vpn/shared-types';

interface DeviceWithMetrics extends DeviceResponse {
  latestMetrics?: MetricsSnapshot;
}

interface DeviceState {
  devices: DeviceWithMetrics[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setDevices: (devices: DeviceResponse[]) => void;
  updateDeviceStatus: (deviceId: string, isOnline: boolean) => void;
  updateDeviceMetrics: (deviceId: string, metrics: MetricsSnapshot) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceState>()((set) => ({
  devices: [],
  isLoading: false,
  error: null,

  setDevices: (devices) => {
    set({ devices, error: null, isLoading: false });
  },

  updateDeviceStatus: (deviceId, isOnline) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, isOnline, lastSeen: new Date().toISOString() } : d
      ),
    }));
  },

  updateDeviceMetrics: (deviceId, metrics) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, latestMetrics: metrics } : d
      ),
    }));
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error, isLoading: false });
  },
}));
