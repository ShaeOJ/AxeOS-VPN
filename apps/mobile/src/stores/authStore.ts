import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse } from '@axeos-vpn/shared-types';

const AUTH_STORAGE_KEY = 'axeos_auth';

interface AuthState {
  user: { id: string; email: string } | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (auth: AuthResponse) => Promise<void>;
  updateTokens: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (auth) => {
    const state = {
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: Date.now() + auth.expiresIn * 1000,
      isAuthenticated: true,
      isLoading: false,
    };

    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(state));
    set(state);
  },

  updateTokens: async (accessToken, refreshToken, expiresIn) => {
    const newState = {
      ...get(),
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(newState));
    set({ accessToken, refreshToken, expiresAt: newState.expiresAt });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  loadStoredAuth: async () => {
    try {
      const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        // Check if token is still valid
        if (state.expiresAt && state.expiresAt > Date.now()) {
          set({ ...state, isLoading: false });
        } else {
          // Token expired, clear storage
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
      set({ isLoading: false });
    }
  },
}));
