/**
 * Device Control Module
 * Provides remote control capabilities for BitAxe devices
 */

export interface DeviceSettings {
  frequency?: number;      // ASIC frequency in MHz
  coreVoltage?: number;    // Core voltage in mV
  fanSpeed?: number;       // Fan speed percentage (0-100)
  stratumURL?: string;     // Pool stratum URL
  stratumUser?: string;    // Pool username/worker
  stratumPassword?: string; // Pool password
}

interface ApiResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

const TIMEOUT_MS = 10000;

/**
 * Restart a BitAxe device
 */
export async function restartDevice(ipAddress: string): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`http://${ipAddress}/api/system/restart`, {
      method: 'POST',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return { success: true };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }
}

/**
 * Update device settings
 */
export async function updateDeviceSettings(
  ipAddress: string,
  settings: DeviceSettings
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`http://${ipAddress}/api/system`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${text || response.statusText}`
      };
    }

    const data = await response.json().catch(() => null);
    return { success: true, data };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }
}

/**
 * Set fan speed
 */
export async function setFanSpeed(ipAddress: string, speed: number): Promise<ApiResponse> {
  // Clamp speed to valid range
  const clampedSpeed = Math.max(0, Math.min(100, speed));
  return updateDeviceSettings(ipAddress, { fanSpeed: clampedSpeed });
}

/**
 * Set ASIC frequency
 */
export async function setFrequency(ipAddress: string, frequency: number): Promise<ApiResponse> {
  return updateDeviceSettings(ipAddress, { frequency });
}

/**
 * Set core voltage
 */
export async function setCoreVoltage(ipAddress: string, voltage: number): Promise<ApiResponse> {
  return updateDeviceSettings(ipAddress, { coreVoltage: voltage });
}

/**
 * Update mining pool settings
 */
export async function updatePoolSettings(
  ipAddress: string,
  stratumURL: string,
  stratumUser: string,
  stratumPassword?: string
): Promise<ApiResponse> {
  const settings: DeviceSettings = {
    stratumURL,
    stratumUser
  };

  if (stratumPassword !== undefined) {
    settings.stratumPassword = stratumPassword;
  }

  return updateDeviceSettings(ipAddress, settings);
}

/**
 * Get device info (for displaying current settings)
 */
export async function getDeviceInfo(ipAddress: string): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`http://${ipAddress}/api/system/info`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: err.message };
    }

    return { success: false, error: 'Unknown error' };
  }
}
