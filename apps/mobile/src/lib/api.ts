import type {
  ApiResponse,
  AuthResponse,
  RefreshTokenResponse,
  DeviceListResponse,
  PairDeviceResponse,
} from '@axeos-vpn/shared-types';
import { Config } from '../constants/config';
import { useAuthStore } from '../stores/authStore';

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { accessToken, refreshToken, expiresAt, updateTokens, logout } =
      useAuthStore.getState();

    // Check if token needs refresh
    if (accessToken && expiresAt && Date.now() > expiresAt - 60000 && refreshToken) {
      try {
        const refreshResponse = await this.refreshTokens(refreshToken);
        await updateTokens(
          refreshResponse.accessToken,
          refreshResponse.refreshToken,
          refreshResponse.expiresIn
        );
      } catch {
        await logout();
        throw new Error('Session expired');
      }
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const currentToken = useAuthStore.getState().accessToken;
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const response = await fetch(`${Config.apiUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = (await response.json()) as ApiResponse<T>;

    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data.data as T;
  }

  private async refreshTokens(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await fetch(`${Config.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = (await response.json()) as ApiResponse<RefreshTokenResponse>;

    if (!data.success) {
      throw new Error('Token refresh failed');
    }

    return data.data as RefreshTokenResponse;
  }

  // Auth endpoints
  async register(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(refreshToken: string): Promise<void> {
    return this.request<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  // Device endpoints
  async getDevices(): Promise<DeviceListResponse> {
    return this.request<DeviceListResponse>('/devices');
  }

  async createPairingCode(): Promise<PairDeviceResponse> {
    return this.request<PairDeviceResponse>('/devices/pair', {
      method: 'POST',
    });
  }

  async deleteDevice(deviceId: string): Promise<void> {
    return this.request<void>(`/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
