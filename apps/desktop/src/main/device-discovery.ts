import { networkInterfaces } from 'os';
import * as net from 'net';

export type DeviceType = 'bitaxe' | 'bitmain' | 'canaan';

export interface DiscoveredDevice {
  ip: string;
  hostname: string;
  model: string;
  hashRate: number;
  version: string;
  alreadyAdded: boolean;
  deviceType: DeviceType;
}

export interface DiscoveryProgress {
  scanned: number;
  total: number;
  found: DiscoveredDevice[];
  currentIp: string;
  isComplete: boolean;
  isCancelled: boolean;
}

type ProgressCallback = (progress: DiscoveryProgress) => void;
type CheckExistingDevice = (ip: string) => boolean;

let cancelRequested = false;

/**
 * Get the local subnet info from network interfaces
 */
function getLocalSubnets(): { baseIp: string; mask: string }[] {
  const interfaces = networkInterfaces();
  const subnets: { baseIp: string; mask: string }[] = [];

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const config of iface) {
      // Skip internal/loopback and IPv6
      if (config.internal || config.family !== 'IPv4') continue;

      // Skip common non-LAN addresses
      if (config.address.startsWith('169.254.')) continue; // Link-local

      subnets.push({
        baseIp: config.address,
        mask: config.netmask
      });
    }
  }

  return subnets;
}

/**
 * Generate IP range for a /24 subnet (most common home network)
 */
function generateIpRange(baseIp: string): string[] {
  const parts = baseIp.split('.');
  if (parts.length !== 4) return [];

  const subnet = parts.slice(0, 3).join('.');
  const ips: string[] = [];

  // Scan .1 to .254 (skip .0 network and .255 broadcast)
  for (let i = 1; i <= 254; i++) {
    ips.push(`${subnet}.${i}`);
  }

  return ips;
}

/**
 * Test if an IP is a BitAxe device by calling its API
 */
async function probeDevice(ip: string, timeout: number = 3000): Promise<DiscoveredDevice | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`http://${ip}/api/system/info`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();

    // Validate it's a BitAxe device by checking for expected fields
    if (!data.ASICModel && !data.hostname) return null;

    // Check for common BitAxe indicators
    const isBitAxe =
      data.ASICModel?.toLowerCase().includes('bm') || // BM1366, BM1368, etc.
      data.hostname?.toLowerCase().includes('bitaxe') ||
      data.hostname?.toLowerCase().includes('axeos') ||
      data.version?.toLowerCase().includes('axeos') ||
      data.stratumURL; // Mining devices have stratum config

    if (!isBitAxe) return null;

    return {
      ip,
      hostname: data.hostname || ip,
      model: data.ASICModel || 'Unknown',
      hashRate: data.hashRate || 0,
      version: data.version || 'Unknown',
      alreadyAdded: false,
      deviceType: 'bitaxe' as DeviceType,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Test if an IP is a Canaan/CGMiner device by probing TCP port 4028
 */
async function probeCanaanDevice(ip: string, timeout: number = 3000): Promise<DiscoveredDevice | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = '';
    let resolved = false;

    const done = (result: DiscoveredDevice | null) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);

    socket.connect(4028, ip, () => {
      // Send summary+version command to get model info and hashrate
      socket.write(JSON.stringify({ command: 'summary+version' }) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      // Try to parse after a short delay (data may come in chunks)
      clearTimeout(parseTimer);
      parseTimer = setTimeout(() => {
        try {
          const cleaned = data.replace(/\0/g, '');
          // Try parsing - CGMiner may return multiple JSON objects
          let parsed: Record<string, unknown> | null = null;
          try {
            parsed = JSON.parse(cleaned);
          } catch {
            // Try first JSON object
            const endIdx = cleaned.indexOf('}{');
            if (endIdx > 0) {
              try { parsed = JSON.parse(cleaned.substring(0, endIdx + 1)); } catch { /* skip */ }
            }
          }

          if (parsed) {
            const summary = Array.isArray(parsed['SUMMARY']) ? parsed['SUMMARY'][0] : parsed['SUMMARY'];
            const version = Array.isArray(parsed['VERSION']) ? parsed['VERSION'][0] : parsed['VERSION'];
            const mhs = summary ? Number((summary as Record<string, unknown>)['MHS 5s'] || (summary as Record<string, unknown>)['MHS5s'] || 0) : 0;
            const hashRateGH = mhs / 1000;
            const versionType = version ? String((version as Record<string, unknown>)['Type'] || '') : '';
            const modelName = versionType || 'Avalon Nano 3S';

            done({
              ip,
              hostname: `Nano3S-${ip.split('.').pop()}`,
              model: modelName,
              hashRate: hashRateGH,
              version: 'Canaan (BETA)',
              alreadyAdded: false,
              deviceType: 'canaan' as DeviceType,
            });
          } else {
            done(null);
          }
        } catch {
          done(null);
        }
      }, 300);
    });

    let parseTimer = setTimeout(() => {}, 0);

    socket.on('timeout', () => done(null));
    socket.on('error', () => done(null));

    // Absolute timeout safety
    setTimeout(() => done(null), timeout + 500);
  });
}

/**
 * Test if an IP is a Bitmain/Antminer device by probing CGI endpoint
 */
async function probeBitmainDevice(ip: string, timeout: number = 3000): Promise<DiscoveredDevice | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try unauthenticated first - some Bitmain devices allow status read without auth
    const response = await fetch(`http://${ip}/cgi-bin/get_miner_status.cgi`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      // Device exists and requires auth - still a Bitmain device
      // Try with default credentials (root/root)
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
      try {
        const authResponse = await fetch(`http://${ip}/cgi-bin/get_miner_status.cgi`, {
          signal: controller2.signal,
          headers: {
            'Authorization': 'Digest username="root"',
          },
        });
        clearTimeout(timeoutId2);
        // Even if auth fails, we know it's a Bitmain device
        return {
          ip,
          hostname: `Antminer-${ip.split('.').pop()}`,
          model: 'Antminer (Auth Required)',
          hashRate: 0,
          version: 'Bitmain (BETA)',
          alreadyAdded: false,
          deviceType: 'bitmain' as DeviceType,
        };
      } catch {
        clearTimeout(timeoutId2);
        // Still a Bitmain device, just can't get details
        return {
          ip,
          hostname: `Antminer-${ip.split('.').pop()}`,
          model: 'Antminer (Auth Required)',
          hashRate: 0,
          version: 'Bitmain (BETA)',
          alreadyAdded: false,
          deviceType: 'bitmain' as DeviceType,
        };
      }
    }

    if (!response.ok) return null;

    const data = await response.json();

    // Validate it looks like a Bitmain miner status response
    if (!data.STATS && !data.stats) return null;

    const stats = data.STATS || data.stats;
    const chains = Array.isArray(stats) ? stats : [];
    const chainCount = chains.length;
    const hostname = `Antminer-${ip.split('.').pop()}`;

    return {
      ip,
      hostname,
      model: chainCount === 4 ? 'Antminer L3+' : chainCount === 3 ? 'Antminer S9' : 'Antminer',
      hashRate: 0,
      version: 'Bitmain (BETA)',
      alreadyAdded: false,
      deviceType: 'bitmain' as DeviceType,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Scan network for BitAxe, Bitmain, and Canaan devices
 */
export async function discoverDevices(
  onProgress: ProgressCallback,
  checkExisting: CheckExistingDevice,
  concurrency: number = 20
): Promise<DiscoveredDevice[]> {
  cancelRequested = false;
  const discovered: DiscoveredDevice[] = [];

  // Get local subnets
  const subnets = getLocalSubnets();
  if (subnets.length === 0) {
    onProgress({
      scanned: 0,
      total: 0,
      found: [],
      currentIp: '',
      isComplete: true,
      isCancelled: false
    });
    return [];
  }

  // Generate IP ranges for all subnets
  const allIps: string[] = [];
  for (const subnet of subnets) {
    const ips = generateIpRange(subnet.baseIp);
    allIps.push(...ips);
  }

  // Remove duplicates
  const uniqueIps = [...new Set(allIps)];
  const total = uniqueIps.length;
  let scanned = 0;

  // Scan in batches for controlled concurrency
  for (let i = 0; i < uniqueIps.length; i += concurrency) {
    if (cancelRequested) {
      onProgress({
        scanned,
        total,
        found: discovered,
        currentIp: '',
        isComplete: true,
        isCancelled: true
      });
      return discovered;
    }

    const batch = uniqueIps.slice(i, i + concurrency);

    // Report progress with first IP in batch
    onProgress({
      scanned,
      total,
      found: [...discovered],
      currentIp: batch[0],
      isComplete: false,
      isCancelled: false
    });

    // Probe batch in parallel - try BitAxe HTTP first, then Bitmain, then Canaan TCP
    const results = await Promise.all(
      batch.map(async (ip) => {
        const bitaxe = await probeDevice(ip);
        if (bitaxe) return bitaxe;
        const bitmain = await probeBitmainDevice(ip);
        if (bitmain) return bitmain;
        return await probeCanaanDevice(ip);
      })
    );

    // Process results
    for (const device of results) {
      if (device) {
        device.alreadyAdded = checkExisting(device.ip);
        discovered.push(device);

        // Immediate progress update when device found
        onProgress({
          scanned: scanned + batch.indexOf(results.find(r => r === device)!) + 1,
          total,
          found: [...discovered],
          currentIp: device.ip,
          isComplete: false,
          isCancelled: false
        });
      }
    }

    scanned += batch.length;
  }

  // Final progress update
  onProgress({
    scanned: total,
    total,
    found: discovered,
    currentIp: '',
    isComplete: true,
    isCancelled: false
  });

  return discovered;
}

/**
 * Cancel ongoing discovery
 */
export function cancelDiscovery(): void {
  cancelRequested = true;
}

/**
 * Quick scan of a specific IP (for manual testing)
 */
export async function scanSingleIp(ip: string): Promise<DiscoveredDevice | null> {
  return probeDevice(ip, 5000);
}
