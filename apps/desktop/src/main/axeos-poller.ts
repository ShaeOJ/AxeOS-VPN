import * as crypto from 'crypto';
import * as devices from './database/devices';
import * as metrics from './database/metrics';
import { DeviceType } from './database/devices';

// Digest Authentication Helper
interface DigestAuthParams {
  realm: string;
  nonce: string;
  qop?: string;
  algorithm?: string;
}

function parseDigestChallenge(wwwAuthenticate: string): DigestAuthParams | null {
  const params: Partial<DigestAuthParams> = {};
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(wwwAuthenticate)) !== null) {
    const key = match[1].toLowerCase();
    if (key === 'realm') params.realm = match[2];
    else if (key === 'nonce') params.nonce = match[2];
    else if (key === 'qop') params.qop = match[2];
    else if (key === 'algorithm') params.algorithm = match[2];
  }
  if (params.realm && params.nonce) {
    return params as DigestAuthParams;
  }
  return null;
}

function createDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  params: DigestAuthParams
): string {
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const algorithm = params.algorithm || 'MD5';

  // Calculate HA1 = MD5(username:realm:password)
  const ha1 = crypto.createHash('md5')
    .update(`${username}:${params.realm}:${password}`)
    .digest('hex');

  // Calculate HA2 = MD5(method:uri)
  const ha2 = crypto.createHash('md5')
    .update(`${method}:${uri}`)
    .digest('hex');

  // Calculate response
  let response: string;
  if (params.qop) {
    response = crypto.createHash('md5')
      .update(`${ha1}:${params.nonce}:${nc}:${cnonce}:${params.qop}:${ha2}`)
      .digest('hex');
  } else {
    response = crypto.createHash('md5')
      .update(`${ha1}:${params.nonce}:${ha2}`)
      .digest('hex');
  }

  let header = `Digest username="${username}", realm="${params.realm}", nonce="${params.nonce}", uri="${uri}", algorithm=${algorithm}, response="${response}"`;

  if (params.qop) {
    header += `, qop=${params.qop}, nc=${nc}, cnonce="${cnonce}"`;
  }

  return header;
}

// Bitmain S9 API response type (BETA)
export interface BitmainMinerStatus {
  summary: {
    elapsed: number;
    stale: number;
    ghs5s: string;
    ghsav: number;
    foundblocks: number;
    accepted: number;
    rejected: number;
    hw: number;
    utility: number;
    bestshare: number;
  };
  pools: Array<{
    index: number;
    url: string;
    user: string;
    status: string;
    priority: number;
    accepted: number;
    rejected: number;
    diff: string;
  }>;
  devs: Array<{
    index: string;
    chain_acn: string;
    freq: string;
    freqavg: string;
    fan1?: string;
    fan2?: string;
    fan3?: string;
    fan4?: string;
    fan5?: string;
    fan6?: string;
    fan7?: string;
    fan8?: string;
    temp: string;
    temp2: string;
    hw: string;
    rate: string;
    chain_vol: string;
    chain_consumption: string;
    chain_acs: string;
  }>;
}

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

// Callback for new best diff records
type NewBestDiffCallback = (deviceId: string, deviceName: string, newBestDiff: number, previousBest: number) => void;
let newBestDiffCallback: NewBestDiffCallback | null = null;

export function setMetricsCallback(callback: MetricsCallback): void {
  metricsCallback = callback;
}

export function setNewBestDiffCallback(callback: NewBestDiffCallback): void {
  newBestDiffCallback = callback;
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
  // Fetch metrics based on device type
  const data = device.device_type === 'bitmain'
    ? await fetchBitmainMetrics(device.ip_address, device.auth_user || undefined, device.auth_pass || undefined)
    : await fetchDeviceMetrics(device.ip_address);

  if (data) {
    // Update device status to online
    devices.updateDeviceStatus(device.id, true);

    // Check for new all-time best difficulty
    if (data.bestDiff && data.bestDiff > 0) {
      const previousBest = device.all_time_best_diff || 0;
      const isNewRecord = devices.updateAllTimeBestDiff(device.id, data.bestDiff);
      if (isNewRecord) {
        console.log(`[Poller] 🏆 NEW RECORD! ${device.name}: bestDiff=${data.bestDiff} (previous: ${previousBest})`);
        newBestDiffCallback?.(device.id, device.name, data.bestDiff, previousBest);
      }
    }

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

// ============================================
// BITMAIN S9 SUPPORT (BETA)
// ============================================

// Fetch metrics from Bitmain S9/Antminer with Digest Authentication
export async function fetchBitmainMetrics(ipAddress: string, username?: string, password?: string): Promise<AxeOSSystemInfo | null> {
  const url = `http://${ipAddress}/cgi-bin/get_miner_status.cgi`;
  const uri = '/cgi-bin/get_miner_status.cgi';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // First request to get the challenge
    const initialResponse = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // If we get 401, we need to authenticate
    if (initialResponse.status === 401) {
      if (!username || !password) {
        console.error(`[Bitmain] ${ipAddress} requires authentication but no credentials provided`);
        return null;
      }

      const wwwAuth = initialResponse.headers.get('www-authenticate');
      if (!wwwAuth) {
        console.error(`[Bitmain] ${ipAddress} returned 401 but no WWW-Authenticate header`);
        return null;
      }

      const digestParams = parseDigestChallenge(wwwAuth);
      if (!digestParams) {
        console.error(`[Bitmain] ${ipAddress} failed to parse digest challenge`);
        return null;
      }

      // Create digest authorization header
      const authHeader = createDigestHeader('GET', uri, username, password, digestParams);

      // Second request with authentication
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 8000);

      const authResponse = await fetch(url, {
        signal: controller2.signal,
        headers: {
          'Authorization': authHeader,
        },
      });

      clearTimeout(timeoutId2);

      if (!authResponse.ok) {
        console.error(`[Bitmain] Authentication failed for ${ipAddress}: ${authResponse.status}`);
        return null;
      }

      const data = await authResponse.json() as BitmainMinerStatus;
      return transformBitmainToAxeOS(data, ipAddress);
    }

    // If no auth required (shouldn't happen with S9)
    if (!initialResponse.ok) {
      console.error(`[Bitmain] Failed to fetch from ${ipAddress}: ${initialResponse.status}`);
      return null;
    }

    const data = await initialResponse.json() as BitmainMinerStatus;
    return transformBitmainToAxeOS(data, ipAddress);
  } catch (error) {
    console.error(`[Bitmain] Error fetching from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Transform Bitmain S9 data to AxeOSSystemInfo format
function transformBitmainToAxeOS(data: BitmainMinerStatus, ipAddress: string): AxeOSSystemInfo {
  // Calculate totals from all chains
  let totalPower = 0;
  let maxTemp = 0;
  let maxTemp2 = 0;
  let totalFreq = 0;
  let totalVoltage = 0;
  let maxFanRpm = 0;
  let chainCount = 0;

  for (const dev of data.devs) {
    totalPower += parseFloat(dev.chain_consumption) || 0;
    maxTemp = Math.max(maxTemp, parseFloat(dev.temp) || 0);
    maxTemp2 = Math.max(maxTemp2, parseFloat(dev.temp2) || 0);
    totalFreq += parseFloat(dev.freq) || 0;
    totalVoltage += parseFloat(dev.chain_vol) || 0;
    chainCount++;

    // Find max fan RPM from any fan slot
    for (let i = 1; i <= 8; i++) {
      const fanKey = `fan${i}` as keyof typeof dev;
      const fanVal = parseFloat(dev[fanKey] as string) || 0;
      if (fanVal > maxFanRpm) maxFanRpm = fanVal;
    }
  }

  const avgFreq = chainCount > 0 ? totalFreq / chainCount : 0;
  const avgVoltage = chainCount > 0 ? totalVoltage / chainCount : 0;
  const hashRateGH = parseFloat(data.summary.ghs5s) || 0;

  // Calculate efficiency (J/TH)
  const hashrateTH = hashRateGH / 1000;
  const efficiency = hashrateTH > 0 ? totalPower / hashrateTH : 0;

  // Get active pool info
  const activePool = data.pools.find(p => p.status === 'Alive' && p.priority === 0) || data.pools[0];

  return {
    // Core metrics
    power: totalPower,
    voltage: avgVoltage / 1000, // Convert mV to V
    current: avgVoltage > 0 ? (totalPower / (avgVoltage / 1000)) : 0, // Calculate amps
    efficiency: efficiency,
    temp: maxTemp,
    temp2: maxTemp2,
    vrTemp: 0, // S9 doesn't report VR temp

    // Hashrate
    hashRate: hashRateGH,
    hashRate_1m: hashRateGH,
    hashRate_10m: hashRateGH,
    hashRate_1h: data.summary.ghsav,
    expectedHashrate: hashRateGH,

    // Shares and difficulty
    bestDiff: data.summary.bestshare,
    bestSessionDiff: data.summary.bestshare,
    sharesAccepted: data.summary.accepted,
    sharesRejected: data.summary.rejected,

    // System info
    uptimeSeconds: data.summary.elapsed,
    hostname: `S9-${ipAddress.split('.').pop()}`,
    ipv4: ipAddress,
    ASICModel: 'Bitmain Antminer S9',
    version: 'Bitmain (BETA)',

    // Fan and frequency
    fanspeed: 100, // S9 reports RPM, not percentage
    fanrpm: maxFanRpm,
    frequency: avgFreq,
    coreVoltage: avgVoltage,

    // Pool info
    poolDifficulty: parseFloat(activePool?.diff?.replace('K', '000').replace('M', '000000') || '0'),
    stratumURL: activePool?.url || '',
    stratumUser: activePool?.user || '',

    // System
    wifiStatus: 'Ethernet',
    freeHeap: 0,
    smallCoreCount: chainCount * 63, // S9 has 63 chips per chain

    // Extra S9-specific fields
    hwErrors: data.summary.hw,
    chainCount: chainCount,
    isBitmain: true,
  };
}

// Check if a Bitmain device requires authentication
export async function checkBitmainAuth(ipAddress: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${ipAddress}/cgi-bin/get_miner_status.cgi`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.status === 401;
  } catch {
    return false;
  }
}

// Detect device type by trying both APIs
export async function detectDeviceType(ipAddress: string, username?: string, password?: string): Promise<{ type: DeviceType; data: AxeOSSystemInfo; requiresAuth?: boolean } | null> {
  // Try BitAxe/AxeOS first (more common in this app)
  const axeosData = await fetchDeviceMetrics(ipAddress);
  if (axeosData && axeosData.ASICModel) {
    console.log(`[Detection] ${ipAddress} is BitAxe: ${axeosData.ASICModel}`);
    return { type: 'bitaxe', data: axeosData };
  }

  // Try Bitmain/CGMiner
  const bitmainData = await fetchBitmainMetrics(ipAddress, username, password);
  if (bitmainData) {
    console.log(`[Detection] ${ipAddress} is Bitmain: ${bitmainData.ASICModel}`);
    return { type: 'bitmain', data: bitmainData };
  }

  // Check if it's a Bitmain that needs auth
  const needsAuth = await checkBitmainAuth(ipAddress);
  if (needsAuth) {
    console.log(`[Detection] ${ipAddress} appears to be Bitmain requiring authentication`);
    return { type: 'bitmain', data: {} as AxeOSSystemInfo, requiresAuth: true };
  }

  console.log(`[Detection] ${ipAddress} - no compatible device found`);
  return null;
}

// Test connection with auto-detection
export async function testConnectionWithDetection(ipAddress: string, username?: string, password?: string): Promise<{ success: boolean; data?: AxeOSSystemInfo; deviceType?: DeviceType; requiresAuth?: boolean; error?: string }> {
  try {
    const result = await detectDeviceType(ipAddress, username, password);
    if (result) {
      if (result.requiresAuth) {
        return { success: false, deviceType: 'bitmain', requiresAuth: true, error: 'Authentication required' };
      }
      return { success: true, data: result.data, deviceType: result.type };
    }
    return { success: false, error: 'No compatible device found at this address' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}
