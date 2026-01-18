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
  // ClusterAxe fields - added when cluster is detected
  isClusterMaster?: boolean;
  clusterInfo?: ClusterStatus;
  // Additional fields we might use
  [key: string]: unknown;
}

// ClusterAxe slave device info
export interface ClusterSlave {
  slot: number;
  slaveId: number;
  hostname: string;
  ipAddr: string;
  state: number;
  hashrate: number;
  temperature: number;
  fanRpm: number;
  sharesSubmitted: number;
  sharesAccepted: number;
  lastSeen: number;
  frequency: number;
  coreVoltage: number;
  power: number;
  voltageIn: number;
}

// ClusterAxe transport info
export interface ClusterTransport {
  type: string;
  channel: number;
  encrypted: boolean;
  discoveryActive: boolean;
  peerCount: number;
}

// ClusterAxe cluster status API response
export interface ClusterStatus {
  enabled: boolean;
  mode: number;
  modeString: string;
  activeSlaves: number;
  totalHashrate: number;
  totalShares: number;
  totalSharesAccepted: number;
  totalSharesRejected: number;
  primarySharesAccepted: number;
  primarySharesRejected: number;
  secondarySharesAccepted: number;
  secondarySharesRejected: number;
  totalPower: number;
  totalEfficiency: number;
  transport: ClusterTransport;
  currentTime: number;
  slaves: ClusterSlave[];
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

// Check if firmware is ClusterAxe
function isClusterAxeFirmware(version: string): boolean {
  return version?.toLowerCase().includes('clusteraxe') || version?.toLowerCase().includes('cluster');
}

// Fetch cluster status from ClusterAxe API
export async function fetchClusterStatus(ipAddress: string): Promise<ClusterStatus | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${ipAddress}/api/cluster/status`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch cluster status from ${ipAddress}: ${response.status}`);
      return null;
    }

    const data = await response.json() as ClusterStatus;
    return data;
  } catch (error) {
    console.error(`Error fetching cluster status from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
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

    // Calculate efficiency if not provided or invalid from the API
    // Efficiency (J/TH) = Power (W) / Hashrate (TH/s)
    if ((!data.efficiency || data.efficiency <= 0) && data.power && data.hashRate) {
      const hashrateTH = data.hashRate / 1000; // Convert GH/s to TH/s
      if (hashrateTH > 0) {
        data.efficiency = data.power / hashrateTH;
      }
    }

    // Check if this is a ClusterAxe device and fetch cluster info
    if (isClusterAxeFirmware(data.version)) {
      const clusterStatus = await fetchClusterStatus(ipAddress);
      if (clusterStatus && clusterStatus.enabled && clusterStatus.modeString === 'master') {
        data.isClusterMaster = true;
        data.clusterInfo = clusterStatus;
        // Override metrics with cluster totals for master display
        // ClusterAxe API returns totalHashrate in 10MH/s units, divide by 100 to get GH/s
        data.hashRate = clusterStatus.totalHashrate / 100;
        data.sharesAccepted = clusterStatus.totalSharesAccepted;
        data.sharesRejected = clusterStatus.totalSharesRejected;
        data.power = clusterStatus.totalPower;
        data.efficiency = clusterStatus.totalEfficiency;
        console.log(`[ClusterAxe] ${data.hostname}: ${clusterStatus.activeSlaves} slaves, total hashrate=${(clusterStatus.totalHashrate / 100).toFixed(2)} GH/s`);
      }
    }

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
    console.log(`[Poller] ${device.name}: hashRate=${data.hashRate}, temp=${data.temp}, power=${data.power}, bestDiff=${data.bestDiff}`);

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
