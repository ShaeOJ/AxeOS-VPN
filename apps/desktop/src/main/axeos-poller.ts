import * as crypto from 'crypto';
import * as net from 'net';
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
  stratumPort: number;
  stratumUser: string;
  wifiStatus: string;
  freeHeap: number;
  smallCoreCount: number;
  // Algorithm identifier
  algorithm?: 'sha256' | 'scrypt';
  // Canaan-specific
  isCanaan?: boolean;
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

// Track consecutive failures per device - only go offline after multiple failures
const consecutiveFailures = new Map<string, number>();
const OFFLINE_THRESHOLD = 3; // Require 3 consecutive failures before marking offline

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
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for slower devices like NerdMiner

    const response = await fetch(`http://${ipAddress}/api/system/info`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch from ${ipAddress}: ${response.status}`);
      return null;
    }

    const data = await response.json() as AxeOSSystemInfo;

    // Normalize field names - different firmware versions use different names
    const raw = data as Record<string, unknown>;

    // Pool difficulty - check various field names
    if (data.poolDifficulty === undefined || data.poolDifficulty === null) {
      data.poolDifficulty = (raw.pool_difficulty ?? raw.poolDiff ?? raw.stratum_difficulty ??
        raw.stratumDifficulty ?? raw.stratumSuggestedDifficulty ?? raw.difficulty) as number || 0;
    }

    // Best diff - check various field names
    if (data.bestDiff === undefined || data.bestDiff === null) {
      data.bestDiff = (raw.best_diff ?? raw.bestdiff ?? raw.BestDiff ??
        raw.bestDifficulty ?? raw.best_difficulty) as number || 0;
    }

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

// Track which devices have already been re-detected to avoid repeated detection attempts
const redetectedDevices = new Set<string>();

async function pollDevice(device: devices.Device): Promise<void> {
  // Fetch metrics based on device type
  let data = device.device_type === 'bitmain'
    ? await fetchBitmainMetrics(device.ip_address, device.auth_user || undefined, device.auth_pass || undefined)
    : device.device_type === 'canaan'
    ? await fetchCanaanMetrics(device.ip_address)
    : await fetchDeviceMetrics(device.ip_address);

  // Check if device was deleted while HTTP request was in-flight
  if (!pollIntervals.has(device.id)) {
    return;
  }

  // If fetch failed and we haven't re-detected this device yet, try auto-detection
  // This fixes devices added with wrong type before the detection fix
  if (!data && !redetectedDevices.has(device.id)) {
    redetectedDevices.add(device.id);
    console.log(`[Poller] ${device.name}: fetch failed with type '${device.device_type}', trying auto-detection...`);
    const detection = await detectDeviceType(device.ip_address);
    if (detection && detection.type !== device.device_type) {
      console.log(`[Poller] ${device.name}: re-detected as '${detection.type}' (was '${device.device_type}'), updating`);
      const authUser = detection.type === 'bitmain' ? 'root' : undefined;
      const authPass = detection.type === 'bitmain' ? 'root' : undefined;
      devices.updateDeviceType(device.id, detection.type, authUser, authPass);
      // Use the detection data as our metrics
      data = detection.data;
      // Update the device reference for the rest of this function
      device = devices.getDeviceById(device.id) || device;
      // Restart polling with correct type
      stopPolling(device.id);
      startPolling(device);
    }
  }

  if (data) {
    // Reset consecutive failures on successful poll
    consecutiveFailures.set(device.id, 0);

    // Update device status to online
    devices.updateDeviceStatus(device.id, true);

    // Check for new all-time best difficulty
    // Parse bestDiff which may be a formatted string like "56.4M" from some devices
    const parsedBestDiff = typeof data.bestDiff === 'string'
      ? (() => {
          const match = String(data.bestDiff).match(/^([\d.]+)\s*([KMGBT])?$/i);
          if (match) {
            const num = parseFloat(match[1]);
            const suffix = match[2]?.toUpperCase();
            const multipliers: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
            return num * (multipliers[suffix] || 1);
          }
          return parseFloat(String(data.bestDiff)) || 0;
        })()
      : Number(data.bestDiff) || 0;

    // Normalize bestDiff to numeric value so renderer doesn't get strings
    data.bestDiff = parsedBestDiff;

    if (parsedBestDiff > 0) {
      const previousBest = device.all_time_best_diff || 0;
      const isNewRecord = devices.updateAllTimeBestDiff(device.id, parsedBestDiff);
      if (isNewRecord) {
        console.log(`[Poller] 🏆 NEW RECORD! ${device.name}: bestDiff=${parsedBestDiff} (previous: ${previousBest})`);
        newBestDiffCallback?.(device.id, device.name, parsedBestDiff, previousBest);
      }
    }

    // Also normalize bestSessionDiff if it's a string
    if (data.bestSessionDiff !== undefined) {
      data.bestSessionDiff = typeof data.bestSessionDiff === 'string'
        ? (() => {
            const match = String(data.bestSessionDiff).match(/^([\d.]+)\s*([KMGBT])?$/i);
            if (match) {
              const num = parseFloat(match[1]);
              const suffix = match[2]?.toUpperCase();
              const multipliers: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
              return num * (multipliers[suffix] || 1);
            }
            return parseFloat(String(data.bestSessionDiff)) || 0;
          })()
        : Number(data.bestSessionDiff) || 0;
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
    // Increment consecutive failures
    const failures = (consecutiveFailures.get(device.id) || 0) + 1;
    consecutiveFailures.set(device.id, failures);

    // Only mark offline after OFFLINE_THRESHOLD consecutive failures
    if (failures >= OFFLINE_THRESHOLD) {
      console.log(`[Poller] ${device.name}: ${failures} consecutive failures, marking offline`);
      devices.updateDeviceStatus(device.id, false);
      metricsCallback?.(device.id, {} as AxeOSSystemInfo, false);
    } else {
      console.log(`[Poller] ${device.name}: poll failed (${failures}/${OFFLINE_THRESHOLD}), keeping online`);
      // Keep the device online but don't send new metrics
    }
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
  // Clean up cached state for this device
  latestMetrics.delete(deviceId);
  consecutiveFailures.delete(deviceId);
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

// Fetch metrics from Bitmain Antminer with Digest Authentication (supports S9, L3+, etc.)
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
      // Detect specific model (S9, L3+, etc.)
      const model = await detectBitmainModel(ipAddress, username, password);
      return transformBitmainToAxeOS(data, ipAddress, model);
    }

    // If no auth required (shouldn't happen with S9)
    if (!initialResponse.ok) {
      console.error(`[Bitmain] Failed to fetch from ${ipAddress}: ${initialResponse.status}`);
      return null;
    }

    const data = await initialResponse.json() as BitmainMinerStatus;
    const model = await detectBitmainModel(ipAddress, username, password);
    return transformBitmainToAxeOS(data, ipAddress, model);
  } catch (error) {
    console.error(`[Bitmain] Error fetching from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Detect Bitmain model by querying system info endpoint
async function detectBitmainModel(ipAddress: string, username?: string, password?: string): Promise<string> {
  const url = `http://${ipAddress}/cgi-bin/get_system_info.cgi`;
  const uri = '/cgi-bin/get_system_info.cgi';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const initialResponse = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (initialResponse.status === 401 && username && password) {
      const wwwAuth = initialResponse.headers.get('www-authenticate');
      if (!wwwAuth) return 'Unknown Antminer';

      const digestParams = parseDigestChallenge(wwwAuth);
      if (!digestParams) return 'Unknown Antminer';

      const authHeader = createDigestHeader('GET', uri, username, password, digestParams);
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 5000);

      const authResponse = await fetch(url, {
        signal: controller2.signal,
        headers: { 'Authorization': authHeader },
      });
      clearTimeout(timeoutId2);

      if (authResponse.ok) {
        const info = await authResponse.json() as Record<string, unknown>;
        if (info.minertype && typeof info.minertype === 'string') {
          return info.minertype; // e.g., "Antminer S9", "Antminer L3+"
        }
      }
    } else if (initialResponse.ok) {
      const info = await initialResponse.json() as Record<string, unknown>;
      if (info.minertype && typeof info.minertype === 'string') {
        return info.minertype;
      }
    }
  } catch {
    // Fall through to heuristic
  }

  return 'Unknown Antminer';
}

// Infer Bitmain model from chain data heuristics
function inferBitmainModel(data: BitmainMinerStatus): { model: string; algorithm: 'sha256' | 'scrypt'; chipsPerChain: number } {
  const chainCount = data.devs.length;
  const hashRateGH = parseFloat(data.summary.ghs5s) || 0;

  // L3+ typically has 4 chains and much lower hashrate (in GH/s terms, ~0.5 GH/s for Scrypt)
  // S9 typically has 3 chains and ~14 TH/s (14000 GH/s for SHA-256)
  if (chainCount === 4 && hashRateGH < 10) {
    return { model: 'Antminer L3+', algorithm: 'scrypt', chipsPerChain: 72 };
  }

  // S9: 3 chains, high hashrate
  if (chainCount === 3) {
    return { model: 'Antminer S9', algorithm: 'sha256', chipsPerChain: 63 };
  }

  // Default: assume SHA-256 miner
  return { model: 'Unknown Antminer', algorithm: 'sha256', chipsPerChain: 63 };
}

// Transform Bitmain data to AxeOSSystemInfo format (supports S9, L3+, and other Antminers)
function transformBitmainToAxeOS(data: BitmainMinerStatus, ipAddress: string, detectedModel?: string): AxeOSSystemInfo {
  // Calculate totals from all chains
  let totalPower = 0;
  let maxTemp = 0;
  let maxTemp2 = 0;
  let totalFreq = 0;
  let totalVoltage = 0;
  let maxFanRpm = 0;
  let chainCount = 0;

  // Collect per-board data
  const boards: Array<{ index: number; power: number; temp: number; freq: number; hashrate: number }> = [];

  for (const dev of data.devs) {
    const boardPower = parseFloat(dev.chain_consumption) || 0;
    const boardTemp = parseFloat(dev.temp) || 0;
    const boardFreq = parseFloat(dev.freq) || 0;
    const boardHashrate = parseFloat(dev.rate) || 0;

    totalPower += boardPower;
    maxTemp = Math.max(maxTemp, boardTemp);
    maxTemp2 = Math.max(maxTemp2, parseFloat(dev.temp2) || 0);
    totalFreq += boardFreq;
    totalVoltage += parseFloat(dev.chain_vol) || 0;
    chainCount++;

    boards.push({
      index: parseInt(dev.index) || chainCount,
      power: boardPower,
      temp: boardTemp,
      freq: boardFreq,
      hashrate: boardHashrate,
    });

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

  // Detect model - use detected model from system info, or infer from data
  const inferred = inferBitmainModel(data);
  const modelName = detectedModel && detectedModel !== 'Unknown Antminer' ? detectedModel : inferred.model;
  const algorithm = detectedModel?.toLowerCase().includes('l3') ? 'scrypt' as const : inferred.algorithm;
  const chipsPerChain = inferred.chipsPerChain;

  // Generate hostname prefix from model
  const hostnamePrefix = modelName.replace('Antminer ', '').replace('+', 'p').split(' ')[0];

  // Calculate efficiency (J/TH)
  const hashrateTH = hashRateGH / 1000;
  const efficiency = hashrateTH > 0 ? totalPower / hashrateTH : 0;

  // Chain voltage handling
  // avgVoltage is the average chain voltage from dev.chain_vol
  // Convert to mV if it looks like it's in V (< 100 means V, otherwise mV)
  // Use 8.5V fallback if chain_vol not reported (typical operating voltage)
  const DEFAULT_S9_VOLTAGE = 8.5;
  let chainVoltage: number;
  if (avgVoltage > 0) {
    chainVoltage = avgVoltage < 100 ? avgVoltage * 1000 : avgVoltage; // Normalize to mV
  } else {
    chainVoltage = DEFAULT_S9_VOLTAGE * 1000; // Use fallback in mV
    console.log(`[Bitmain] ${ipAddress}: chain_vol not reported, using fallback ${DEFAULT_S9_VOLTAGE}V`);
  }

  // Calculate DC current at chain voltage
  const chainVoltageV = chainVoltage / 1000;
  const dcAmps = chainVoltageV > 0 ? totalPower / chainVoltageV : 0;

  // Mains voltage for wall current reference
  const mainsVoltage = 120;

  // Get active pool info (safely handle missing pools array)
  const pools = data.pools || [];
  const activePool = pools.find(p => p.status === 'Alive' && p.priority === 0) || pools[0];

  return {
    // Core metrics
    power: totalPower,
    voltage: chainVoltage, // Chain DC voltage in mV (for DC current calculation)
    current: dcAmps * 1000, // DC current in milliamps
    efficiency: efficiency,
    temp: maxTemp,
    temp2: maxTemp2,
    vrTemp: maxTemp2, // Use temp2 (chip/board temp) for VR temp display

    // Hashrate
    hashRate: hashRateGH,
    hashRate_1m: hashRateGH,
    hashRate_10m: hashRateGH,
    hashRate_1h: Number(data.summary.ghsav) || 0,
    expectedHashrate: hashRateGH,

    // Shares and difficulty - ensure numeric (Bitmain API may return strings)
    bestDiff: Number(data.summary.bestshare) || 0,
    bestSessionDiff: Number(data.summary.bestshare) || 0,
    sharesAccepted: Number(data.summary.accepted) || 0,
    sharesRejected: Number(data.summary.rejected) || 0,

    // System info
    uptimeSeconds: Number(data.summary.elapsed) || 0,
    hostname: `${hostnamePrefix}-${ipAddress.split('.').pop()}`,
    ipv4: ipAddress,
    ASICModel: `Bitmain ${modelName}`,
    version: 'Bitmain (BETA)',

    // Fan and frequency
    fanspeed: 100, // S9 reports RPM, not percentage
    fanrpm: maxFanRpm,
    frequency: avgFreq,
    coreVoltage: avgVoltage,

    // Pool info - S9 pools report URL as "stratum+tcp://host:port", parse them apart
    // Parse pool difficulty properly - handles K, M, G, B, T suffixes
    poolDifficulty: (() => {
      const diffStr = activePool?.diff || '0';
      const match = diffStr.match(/^([\d.]+)\s*([KMGBT])?$/i);
      if (match) {
        const num = parseFloat(match[1]);
        const suffix = match[2]?.toUpperCase();
        const multipliers: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
        return num * (multipliers[suffix] || 1);
      }
      return parseFloat(diffStr) || 0;
    })(),
    stratumURL: (() => {
      const url = activePool?.url || '';
      // Strip protocol prefix and port: "stratum+tcp://host:port" -> "host"
      const stripped = url.replace(/^stratum\+tcp:\/\//, '');
      const portIdx = stripped.lastIndexOf(':');
      return portIdx > 0 ? stripped.substring(0, portIdx) : stripped;
    })(),
    stratumPort: (() => {
      const url = activePool?.url || '';
      const portMatch = url.match(/:(\d+)$/);
      return portMatch ? parseInt(portMatch[1]) : 3333;
    })(),
    stratumUser: activePool?.user || '',

    // System
    wifiStatus: 'Ethernet',
    freeHeap: 0,
    smallCoreCount: chainCount * chipsPerChain,

    // Algorithm
    algorithm: algorithm,

    // Extra Bitmain-specific fields
    hwErrors: Number(data.summary.hw) || 0,
    chainCount: chainCount,
    isBitmain: true,
    boards: boards, // Per-board breakdown
    mainsVoltage: mainsVoltage, // Track assumed mains voltage
  };
}

// ============================================
// CANAAN AVALON SUPPORT (BETA)
// ============================================

// Send a CGMiner API command over TCP and receive the response
function cgminerCommand(ipAddress: string, command: string, port: number = 4028, timeoutMs: number = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';

    socket.setTimeout(timeoutMs);

    socket.connect(port, ipAddress, () => {
      socket.write(JSON.stringify({ command }) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
    });

    socket.on('end', () => {
      resolve(data);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('CGMiner TCP timeout'));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    // CGMiner sometimes doesn't send FIN, so close after receiving data + short delay
    socket.on('data', () => {
      // Reset a close timer each time data arrives
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        socket.end();
      }, 500);
    });

    let closeTimer = setTimeout(() => {
      socket.end();
    }, timeoutMs - 500);
  });
}

// Check if a Canaan/CGMiner device is reachable on TCP 4028
export async function checkCanaanDevice(ipAddress: string): Promise<boolean> {
  try {
    const raw = await cgminerCommand(ipAddress, 'version', 4028, 3000);
    // CGMiner responses may have null bytes, clean them
    const cleaned = raw.replace(/\0/g, '');
    const parsed = JSON.parse(cleaned);
    return parsed && (parsed.VERSION || parsed.version);
  } catch {
    return false;
  }
}

// Fetch metrics from Canaan Avalon (CGMiner API on TCP 4028)
export async function fetchCanaanMetrics(ipAddress: string): Promise<AxeOSSystemInfo | null> {
  try {
    const raw = await cgminerCommand(ipAddress, 'summary+pools+stats', 4028, 8000);
    // CGMiner responses may have null bytes and multiple JSON objects
    const cleaned = raw.replace(/\0/g, '');

    // CGMiner multi-command responses are concatenated JSON objects
    // Parse them by splitting on }{ boundaries
    let summary: Record<string, unknown> | null = null;
    let pools: Array<Record<string, unknown>> = [];
    let stats: Array<Record<string, unknown>> = [];

    // Try parsing as a single JSON object first (some implementations)
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.SUMMARY) summary = Array.isArray(parsed.SUMMARY) ? parsed.SUMMARY[0] : parsed.SUMMARY;
      if (parsed.POOLS) pools = Array.isArray(parsed.POOLS) ? parsed.POOLS : [parsed.POOLS];
      if (parsed.STATS) stats = Array.isArray(parsed.STATS) ? parsed.STATS : [parsed.STATS];
    } catch {
      // Try splitting multiple JSON responses
      const parts = cleaned.split(/\}\s*\{/).map((p, i, arr) => {
        if (i === 0) return p + '}';
        if (i === arr.length - 1) return '{' + p;
        return '{' + p + '}';
      });

      for (const part of parts) {
        try {
          const parsed = JSON.parse(part);
          if (parsed.SUMMARY) summary = Array.isArray(parsed.SUMMARY) ? parsed.SUMMARY[0] : parsed.SUMMARY;
          if (parsed.POOLS) pools = Array.isArray(parsed.POOLS) ? parsed.POOLS : [parsed.POOLS];
          if (parsed.STATS) stats = Array.isArray(parsed.STATS) ? parsed.STATS : [parsed.STATS];
        } catch {
          // Skip unparseable parts
        }
      }
    }

    if (!summary) {
      console.error(`[Canaan] ${ipAddress}: No SUMMARY data in CGMiner response`);
      return null;
    }

    return transformCanaanToAxeOS(summary, pools, stats, ipAddress);
  } catch (error) {
    console.error(`[Canaan] Error fetching from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Transform CGMiner API data to unified AxeOSSystemInfo format
function transformCanaanToAxeOS(
  summary: Record<string, unknown>,
  pools: Array<Record<string, unknown>>,
  stats: Array<Record<string, unknown>>,
  ipAddress: string
): AxeOSSystemInfo {
  // Hashrate: CGMiner reports MHS 5s (megahashes per second over 5s)
  const mhs5s = Number(summary['MHS 5s'] || summary['MHS5s'] || 0);
  const mhsAv = Number(summary['MHS av'] || summary['MHSav'] || 0);
  const hashRateGH = mhs5s / 1000; // Convert MH/s to GH/s
  const hashRateAvgGH = mhsAv / 1000;

  // Shares
  const sharesAccepted = Number(summary['Accepted'] || 0);
  const sharesRejected = Number(summary['Rejected'] || 0);
  const bestShare = Number(summary['Best Share'] || 0);
  const hwErrors = Number(summary['Hardware Errors'] || 0);
  const uptimeSeconds = Number(summary['Elapsed'] || 0);

  // Extract temperature and fan from stats
  let maxTemp = 0;
  let maxFanRpm = 0;
  let frequency = 0;
  let totalPower = 0;

  for (const stat of stats) {
    // Temperature fields: temp, temp1, temp2, temp3, etc.
    for (const key of Object.keys(stat)) {
      if (key.match(/^temp\d*$/i)) {
        const val = Number(stat[key]);
        if (val > 0 && val < 150) maxTemp = Math.max(maxTemp, val);
      }
      if (key.match(/^fan\d*$/i)) {
        const val = Number(stat[key]);
        if (val > 0) maxFanRpm = Math.max(maxFanRpm, val);
      }
      if (key.toLowerCase() === 'frequency' || key.toLowerCase() === 'freq') {
        const val = Number(stat[key]);
        if (val > 0) frequency = val;
      }
    }
  }

  // Estimate power for Nano 3S (~600W typical at 6 TH/s)
  // Use hashrate-based estimation since CGMiner doesn't report power
  const hashrateTH = hashRateGH / 1000;
  if (hashrateTH > 0) {
    // Nano 3S efficiency is ~100 J/TH
    totalPower = hashrateTH * 100;
  }

  const efficiency = hashrateTH > 0 && totalPower > 0 ? totalPower / hashrateTH : 0;

  // Pool info from first active pool
  const activePool = pools.find(p => p['Status'] === 'Alive') || pools[0] || {};
  const poolUrl = String(activePool['URL'] || '');
  // Parse stratum URL: "stratum+tcp://host:port" or "host:port"
  const strippedUrl = poolUrl.replace(/^stratum\+tcp:\/\//, '');
  const portIdx = strippedUrl.lastIndexOf(':');
  const stratumURL = portIdx > 0 ? strippedUrl.substring(0, portIdx) : strippedUrl;
  const stratumPort = portIdx > 0 ? parseInt(strippedUrl.substring(portIdx + 1)) || 3333 : 3333;

  // Detect model from stats (version string or type field)
  let modelName = 'Avalon Nano 3S';
  for (const stat of stats) {
    const type = String(stat['Type'] || stat['type'] || '');
    if (type) {
      modelName = type;
      break;
    }
  }

  return {
    // Core metrics
    power: totalPower,
    voltage: 0,
    current: 0,
    efficiency: efficiency,
    temp: maxTemp,
    temp2: 0,
    vrTemp: 0,

    // Hashrate
    hashRate: hashRateGH,
    hashRate_1m: hashRateGH,
    hashRate_10m: hashRateAvgGH,
    hashRate_1h: hashRateAvgGH,
    expectedHashrate: hashRateGH,

    // Shares and difficulty
    bestDiff: bestShare,
    bestSessionDiff: bestShare,
    sharesAccepted: sharesAccepted,
    sharesRejected: sharesRejected,

    // System info
    uptimeSeconds: uptimeSeconds,
    hostname: `Nano3S-${ipAddress.split('.').pop()}`,
    ipv4: ipAddress,
    ASICModel: modelName,
    version: 'Canaan (BETA)',

    // Fan and frequency
    fanspeed: 0, // CGMiner reports RPM, not percentage
    fanrpm: maxFanRpm,
    frequency: frequency,
    coreVoltage: 0,

    // Pool info
    poolDifficulty: Number(activePool['Difficulty Accepted'] || 0),
    stratumURL: stratumURL,
    stratumPort: stratumPort,
    stratumUser: String(activePool['User'] || ''),

    // System
    wifiStatus: 'Ethernet',
    freeHeap: 0,
    smallCoreCount: 0,

    // Canaan-specific
    algorithm: 'sha256',
    isCanaan: true,
    hwErrors: hwErrors,
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

  // Try Bitmain/CGMiner HTTP
  const bitmainData = await fetchBitmainMetrics(ipAddress, username, password);
  if (bitmainData) {
    console.log(`[Detection] ${ipAddress} is Bitmain: ${bitmainData.ASICModel}`);
    return { type: 'bitmain', data: bitmainData };
  }

  // Try Canaan/CGMiner TCP (port 4028)
  const canaanData = await fetchCanaanMetrics(ipAddress);
  if (canaanData) {
    console.log(`[Detection] ${ipAddress} is Canaan: ${canaanData.ASICModel}`);
    return { type: 'canaan', data: canaanData };
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
