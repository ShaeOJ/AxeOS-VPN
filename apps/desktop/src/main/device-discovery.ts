import { networkInterfaces } from 'os';

export interface DiscoveredDevice {
  ip: string;
  hostname: string;
  model: string;
  hashRate: number;
  version: string;
  alreadyAdded: boolean;
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
      alreadyAdded: false
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Scan network for BitAxe devices
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

    // Probe batch in parallel
    const results = await Promise.all(
      batch.map(ip => probeDevice(ip))
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
