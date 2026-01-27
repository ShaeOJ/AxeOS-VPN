/**
 * Device Control Module
 * Provides remote control capabilities for BitAxe devices
 */

export interface DeviceSettings {
  frequency?: number;      // ASIC frequency in MHz
  coreVoltage?: number;    // Core voltage in mV
  fanSpeed?: number;       // Fan speed percentage (0-100)
  stratumURL?: string;     // Pool stratum URL (hostname only, no port)
  stratumPort?: number;    // Pool stratum port
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
 * Transforms camelCase field names to AxeOS API format
 * Tries PATCH first, falls back to POST if needed
 */
export async function updateDeviceSettings(
  ipAddress: string,
  settings: DeviceSettings
): Promise<ApiResponse> {
  // Transform settings to AxeOS API field names
  const apiSettings: Record<string, unknown> = {};
  if (settings.fanSpeed !== undefined) apiSettings.fanspeed = settings.fanSpeed;
  if (settings.frequency !== undefined) apiSettings.frequency = settings.frequency;
  if (settings.coreVoltage !== undefined) apiSettings.coreVoltage = settings.coreVoltage;
  if (settings.stratumURL !== undefined) apiSettings.stratumURL = settings.stratumURL;
  if (settings.stratumPort !== undefined) apiSettings.stratumPort = settings.stratumPort;
  if (settings.stratumUser !== undefined) apiSettings.stratumUser = settings.stratumUser;
  if (settings.stratumPassword !== undefined) apiSettings.stratumPassword = settings.stratumPassword;

  console.log(`[DeviceControl] Updating ${ipAddress} with:`, JSON.stringify(apiSettings));

  // Try PATCH /api/system first (standard AxeOS)
  const patchResult = await tryRequest(ipAddress, '/api/system', 'PATCH', apiSettings);
  if (patchResult.success) {
    console.log(`[DeviceControl] PATCH /api/system succeeded for ${ipAddress}`);
    return patchResult;
  }

  console.log(`[DeviceControl] PATCH failed (${patchResult.error}), trying POST...`);

  // Fallback: Try POST /api/system
  const postResult = await tryRequest(ipAddress, '/api/system', 'POST', apiSettings);
  if (postResult.success) {
    console.log(`[DeviceControl] POST /api/system succeeded for ${ipAddress}`);
    return postResult;
  }

  console.log(`[DeviceControl] POST also failed (${postResult.error})`);
  return postResult;
}

async function tryRequest(
  ipAddress: string,
  endpoint: string,
  method: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`http://${ipAddress}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
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
  stratumPort: number,
  stratumUser: string,
  stratumPassword?: string
): Promise<ApiResponse> {
  const settings: DeviceSettings = {
    stratumURL,
    stratumPort,
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
