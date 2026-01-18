import * as devices from './database/devices';
import * as metrics from './database/metrics';

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
  // Additional fields we might use
  [key: string]: unknown;
}

// Store for latest metrics by device ID
const latestMetrics = new Map<string, { data: AxeOSSystemInfo; timestamp: number }>();
const pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Event callback for UI updates
type MetricsCallback = (deviceId: string, data: AxeOSSystemInfo, isOnline: boolean) => void;
let metricsCallback: MetricsCallback | null = null;

export function setMetricsCallback(callback: MetricsCallback): void {
  metricsCallback = callback;
}

export async function fetchDeviceMetrics(ipAddress: string): Promise<AxeOSSystemInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${ipAddress}/api/system/info`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch from ${ipAddress}: ${response.status}`);
      return null;
    }

    const data = await response.json() as AxeOSSystemInfo;
    return data;
  } catch (error) {
    console.error(`Error fetching from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function pollDevice(device: devices.Device): Promise<void> {
  const data = await fetchDeviceMetrics(device.ip_address);

  if (data) {
    // Update device status to online
    devices.updateDeviceStatus(device.id, true);

    // Store latest metrics
    latestMetrics.set(device.id, { data, timestamp: Date.now() });

    // Save to database
    metrics.saveMetrics(device.id, {
      hashrate: data.hashRate * 1e9, // Convert GH/s to H/s
      temperature: data.temp,
      power: data.power,
      data: JSON.stringify(data),
    });

    // Notify callback
    metricsCallback?.(device.id, data, true);
  } else {
    // Update device status to offline
    devices.updateDeviceStatus(device.id, false);
    metricsCallback?.(device.id, {} as AxeOSSystemInfo, false);
  }
}

export function startPolling(device: devices.Device): void {
  // Stop existing polling if any
  stopPolling(device.id);

  // Poll immediately
  pollDevice(device);

  // Set up interval
  const intervalId = setInterval(() => {
    pollDevice(device);
  }, device.poll_interval || 5000);

  pollIntervals.set(device.id, intervalId);
  console.log(`Started polling ${device.name} (${device.ip_address}) every ${device.poll_interval}ms`);
}

export function stopPolling(deviceId: string): void {
  const intervalId = pollIntervals.get(deviceId);
  if (intervalId) {
    clearInterval(intervalId);
    pollIntervals.delete(deviceId);
    console.log(`Stopped polling device ${deviceId}`);
  }
}

export function stopAllPolling(): void {
  for (const [deviceId] of pollIntervals) {
    stopPolling(deviceId);
  }
}

export function startPollingAllDevices(): void {
  const allDevices = devices.getAllDevices();
  for (const device of allDevices) {
    startPolling(device);
  }
  console.log(`Started polling ${allDevices.length} devices`);
}

export function getLatestMetrics(deviceId: string): { data: AxeOSSystemInfo; timestamp: number } | null {
  return latestMetrics.get(deviceId) || null;
}

export function getAllLatestMetrics(): Map<string, { data: AxeOSSystemInfo; timestamp: number }> {
  return latestMetrics;
}

// Test connection to a device
export async function testConnection(ipAddress: string): Promise<{ success: boolean; data?: AxeOSSystemInfo; error?: string }> {
  try {
    const data = await fetchDeviceMetrics(ipAddress);
    if (data) {
      return { success: true, data };
    }
    return { success: false, error: 'No response from device' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}
