import { create } from 'zustand';

interface ServerStatus {
  running: boolean;
  port: number;
  addresses: string[];
  setupRequired: boolean;
}

interface ServerState {
  status: ServerStatus | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setStatus: (status: ServerStatus) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchStatus: () => Promise<void>;
  restartServer: () => Promise<void>;
}

export const useServerStore = create<ServerState>()((set) => ({
  status: null,
  isLoading: true,
  error: null,

  setStatus: (status) => {
    set({ status, error: null });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error, isLoading: false });
  },

  fetchStatus: async () => {
    set({ isLoading: true });
    try {
      const status = await window.electronAPI.getServerStatus();
      set({ status, isLoading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to get server status',
        isLoading: false,
      });
    }
  },

  restartServer: async () => {
    try {
      const result = await window.electronAPI.restartServer();
      set((state) => ({
        status: state.status
          ? { ...state.status, port: result.port, addresses: result.addresses, running: true }
          : null,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to restart server' });
      throw err;
    }
  },
}));
