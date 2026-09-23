// ============================================================================
// PRIMO ARM MINER SUPPORT — ccminer TEXT API  [BETA]
// ============================================================================
// Primo ARM Miner (https://primolab.dev) is a pure-ARM CPU miner (Verus / RandomX
// / scrypt / SHA256d). It exposes a ccminer-compatible TEXT API — NOT the cgminer
// JSON API. Commands are sent as raw words terminated by '\n'; each reply is a
// pipe-terminated list of ';'-separated KEY=VALUE tokens, e.g.:
//
//   summary -> NAME=primo-arm-miner;VER=1.1.0;ALGO=sha256d;KHS=22199.85;ACC=200;REJ=0;UPTIME=2367;...|
//   pool    -> POOL=host:port;URL=stratum+tcp://host:port;USER=addr.worker;DIFF=0.13;BEST=62.5;...|
//   threads -> GPU=0;CARD=cpu-little;TEMP=56.0;FREQ=1512;KHS=5447;ACC=57;...|GPU=1;...|
//
// The API defaults to 127.0.0.1:4068; the device must be launched with
// `-b 0.0.0.0:4068` (or its LAN IP) for AxeOS-VPN to reach it. Monitoring only —
// the API is read-only, so no control panel is offered (like the Canaan BETA path).
// ============================================================================

import * as net from 'net';
import type { AxeOSSystemInfo } from './axeos-poller';

export const PRIMO_PORT = 4068;

/**
 * Send a plain-text ccminer API command to Primo on TCP 4068 and return the raw
 * reply. Unlike cgminer's JSON API, the command is written as a bare word plus a
 * newline; the response terminates at the first '|' (or a newline / idle gap).
 */
export function primoCommand(ipAddress: string, command: string, port = PRIMO_PORT, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';
    let settled = false;
    let idleTimer: NodeJS.Timeout | undefined;

    const hardTimer = setTimeout(() => finish(), Math.max(1000, timeoutMs - 500));
    const cleanup = () => {
      clearTimeout(hardTimer);
      if (idleTimer) clearTimeout(idleTimer);
      socket.destroy();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    socket.setTimeout(timeoutMs);
    socket.connect(port, ipAddress, () => {
      socket.write(command + '\n');
    });
    socket.on('data', (chunk) => {
      data += chunk.toString();
      // A record ends at '|'; finish as soon as one full record has arrived.
      if (data.includes('|') || data.includes('\n')) return finish();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, 400);
    });
    socket.on('end', finish);
    socket.on('timeout', () => fail(new Error('Primo API TCP timeout')));
    socket.on('error', fail);
  });
}

/** Parse one ccminer record ("K=V;K=V;...") into a flat map. */
function parseRecord(rec: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tok of rec.split(';')) {
    const i = tok.indexOf('=');
    if (i > 0) out[tok.slice(0, i).trim()] = tok.slice(i + 1).trim();
  }
  return out;
}

/** Split a reply into its '|'-terminated records (dropping empties). */
function parseRecords(raw: string): Array<Record<string, string>> {
  return raw
    .replace(/\0/g, '')
    .split('|')
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.includes('='))
    .map(parseRecord);
}

/** True if the host at `ip` answers the Primo `summary` command as primo-arm-miner. */
export async function checkPrimoDevice(ipAddress: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const raw = await primoCommand(ipAddress, 'summary', PRIMO_PORT, timeoutMs);
    return /NAME=primo-arm-miner/i.test(raw);
  } catch {
    return false;
  }
}

// ccminer ALGO string -> the algorithm tag AxeOS-VPN understands (sha256 | scrypt).
function mapAlgorithm(algo: string): 'sha256' | 'scrypt' {
  const a = (algo || '').toLowerCase();
  if (a.includes('scrypt')) return 'scrypt';
  return 'sha256';
}

/**
 * Poll a Primo miner and map its ccminer API into the unified AxeOSSystemInfo.
 * Returns null if the device does not identify as Primo (so detection/poll can
 * fall through to other device types).
 */
export async function fetchPrimoMetrics(ipAddress: string): Promise<AxeOSSystemInfo | null> {
  try {
    const summaryRaw = await primoCommand(ipAddress, 'summary');
    if (!/NAME=primo-arm-miner/i.test(summaryRaw)) return null;
    const summary = parseRecords(summaryRaw)[0] || {};

    const [poolRaw, threadsRaw] = await Promise.all([
      primoCommand(ipAddress, 'pool').catch(() => ''),
      primoCommand(ipAddress, 'threads').catch(() => ''),
    ]);
    // Prefer the active (first) pool that carries a USER; fall back to first record.
    const pools = parseRecords(poolRaw);
    const pool = pools.find((p) => p['USER']) || pools[0] || {};
    const threads = parseRecords(threadsRaw);

    // Hashrate: ccminer reports KHS (kH/s). AxeOSSystemInfo.hashRate is GH/s.
    const khs = Number(summary['KHS'] || 0);
    const hashRateGH = khs / 1_000_000;

    // Shares: the `pool` record carries the richest counters (incl. STALE); the
    // `summary` ACC/REJ are the fallback.
    const sharesAccepted = Number(pool['ACC'] ?? summary['ACC'] ?? 0);
    const sharesRejected = Number(pool['REJ'] ?? summary['REJ'] ?? 0);
    const bestDiff = Number(pool['BEST'] || 0);
    const poolDifficulty = Number(pool['DIFF'] ?? summary['DIFF'] ?? 0);
    const uptimeSeconds = Number(summary['UPTIME'] || pool['UPTIME'] || 0);

    // Temperature / frequency: max across CPU thread records.
    let maxTemp = 0;
    let frequency = 0;
    for (const t of threads) {
      const temp = Number(t['TEMP'] || 0);
      if (temp > 0 && temp < 150) maxTemp = Math.max(maxTemp, temp);
      const freq = Number(t['FREQ'] || 0);
      if (freq > 0) frequency = Math.max(frequency, freq);
    }

    // Pool URL: "stratum+tcp://host:port" (or "host:port").
    const poolUrl = String(pool['URL'] || pool['POOL'] || '');
    const stripped = poolUrl.replace(/^stratum\+(tcp|ssl|tcps):\/\//, '');
    const portIdx = stripped.lastIndexOf(':');
    const stratumURL = portIdx > 0 ? stripped.slice(0, portIdx) : stripped;
    const stratumPort = portIdx > 0 ? parseInt(stripped.slice(portIdx + 1), 10) || 0 : 0;

    const lastOctet = ipAddress.split('.').pop();
    const algo = summary['ALGO'] || pool['ALGO'] || '';

    return {
      // Core metrics — a CPU miner reports no power/voltage/current.
      power: 0,
      voltage: 0,
      current: 0,
      efficiency: 0,
      temp: maxTemp,
      temp2: 0,
      vrTemp: 0,

      // Hashrate (Primo exposes a single instantaneous KHS).
      hashRate: hashRateGH,
      hashRate_1m: hashRateGH,
      hashRate_10m: hashRateGH,
      hashRate_1h: hashRateGH,
      expectedHashrate: hashRateGH,

      // Shares and difficulty.
      bestDiff,
      bestSessionDiff: bestDiff,
      sharesAccepted,
      sharesRejected,

      // System info.
      uptimeSeconds,
      hostname: `Primo-${lastOctet}`,
      ipv4: ipAddress,
      ASICModel: `Primo ARM CPU (${algo || 'sha256d'})`,
      version: `Primo ${summary['VER'] || '?'} (BETA)`,

      // Fan / frequency — no fan on the SBC.
      fanspeed: 0,
      fanrpm: 0,
      frequency,
      coreVoltage: 0,

      // Pool info.
      poolDifficulty,
      stratumURL,
      stratumPort,
      stratumUser: String(pool['USER'] || ''),

      // System.
      wifiStatus: 'Ethernet',
      freeHeap: 0,
      smallCoreCount: 0,

      // Tags.
      algorithm: mapAlgorithm(algo),
      isPrimo: true,
    };
  } catch (error) {
    console.error(`[Primo] Error fetching from ${ipAddress}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
