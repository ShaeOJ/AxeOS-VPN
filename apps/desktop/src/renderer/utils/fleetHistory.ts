import { useEffect, useRef, useState } from 'react';

// Fleet-wide rolling history for the dashboard hero + metric graphs.
//
// Now backed by the SQL-side bucketed metrics query (getBucketedMetrics): the
// averaging + downsampling happens in SQLite and the ~3KB `data` blob is never
// shipped or JSON.parsed, so a 12h fetch across the fleet is a few hundred
// small numeric rows instead of tens of thousands of fat ones. Unit gotcha:
// stored hashrate is H/s, whereas the dashboard's instant totalHashrate is
// GH/s — we convert to GH/s here so the graph and the hero number share a scale.

const BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets
const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const BUCKET_COUNT = Math.round(WINDOW_MS / BUCKET_MS); // 144
const REFRESH_MS = 60 * 1000;

export interface FleetHistory {
  hashSeries: (number | null)[]; // fleet total hashrate, GH/s, oldest -> newest
  tempSeries: (number | null)[]; // fleet average temp, °C
  effSeries: (number | null)[]; // fleet efficiency, J/TH
  powerSeries: (number | null)[]; // fleet total power, W
  sharesSeries: (number | null)[]; // fleet shares accepted per bucket
  avg1h: number | null; // GH/s
  avg6h: number | null; // GH/s
  avg12h: number | null; // GH/s
  sharesPerMin: number | null; // fleet shares accepted per minute
  loading: boolean;
}

// Minimal shape we need from a device — avoids coupling to the store's type.
interface DeviceLike {
  id: string;
  isOnline: boolean;
  latestMetrics?: { algorithm?: string | null } | null;
}

interface BucketAcc {
  hashSum: number; // sum of device hashrate (GH/s), SHA-256 only
  tempSum: number; // sum of device temps
  tempCount: number;
  powerSum: number; // sum of device power (W), SHA-256 only
}

const emptyHistory: FleetHistory = {
  hashSeries: [],
  tempSeries: [],
  effSeries: [],
  powerSeries: [],
  sharesSeries: [],
  avg1h: null,
  avg6h: null,
  avg12h: null,
  sharesPerMin: null,
  loading: true,
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Trailing average over the last `buckets` entries, ignoring gaps (nulls).
function trailingAvg(series: (number | null)[], buckets: number): number | null {
  const slice = series.slice(-buckets).filter((v): v is number => v != null);
  return mean(slice);
}

export async function computeFleetHistory(devices: DeviceLike[]): Promise<FleetHistory> {
  const online = devices.filter((d) => d.isOnline);
  if (online.length === 0) {
    return { ...emptyHistory, loading: false };
  }

  const now = Date.now();
  const startTime = now - WINDOW_MS;
  const nowBucket = Math.floor(now / BUCKET_MS);
  const firstBucket = nowBucket - (BUCKET_COUNT - 1);

  const buckets: BucketAcc[] = Array.from({ length: BUCKET_COUNT }, () => ({
    hashSum: 0,
    tempSum: 0,
    tempCount: 0,
    powerSum: 0,
  }));

  const results = await Promise.all(
    online.map(async (d) => {
      const rows = await window.electronAPI.getBucketedMetrics(d.id, { startTime, bucketMs: BUCKET_MS });
      return { isScrypt: d.latestMetrics?.algorithm === 'scrypt', rows };
    })
  );

  // Fold each device's already-per-bucket-averaged rows into the fleet grid.
  for (const { isScrypt, rows } of results) {
    for (const r of rows) {
      const idx = Math.floor(r.timestamp / BUCKET_MS) - firstBucket;
      if (idx < 0 || idx >= BUCKET_COUNT) continue;
      const acc = buckets[idx];
      // SHA-256 devices only contribute to fleet hashrate / power / efficiency.
      if (r.hashrate != null && !isScrypt) acc.hashSum += r.hashrate / 1e9; // H/s -> GH/s
      if (r.temperature != null) {
        acc.tempSum += r.temperature;
        acc.tempCount += 1;
      }
      if (r.power != null && !isScrypt) acc.powerSum += r.power;
    }
  }

  const hashSeries: (number | null)[] = [];
  const tempSeries: (number | null)[] = [];
  const effSeries: (number | null)[] = [];
  const powerSeries: (number | null)[] = [];

  for (const b of buckets) {
    const hasHash = b.hashSum > 0;
    hashSeries.push(hasHash ? b.hashSum : null);
    tempSeries.push(b.tempCount > 0 ? b.tempSum / b.tempCount : null);
    powerSeries.push(b.powerSum > 0 ? b.powerSum : null);
    // Efficiency J/TH = watts / (GH/s / 1000)
    effSeries.push(hasHash && b.powerSum > 0 ? b.powerSum / (b.hashSum / 1000) : null);
  }

  // Shares-per-bucket series (fleet): for each device, the positive delta of the
  // cumulative counter between consecutive buckets is the shares accepted during
  // the newer bucket; sum those across devices onto the 144-bucket grid.
  const sharesBuckets = new Array<number>(BUCKET_COUNT).fill(0);
  const sharesSeen = new Array<number>(BUCKET_COUNT).fill(0);
  for (const { rows } of results) {
    const withShares = rows.filter((r) => r.sharesAccepted != null);
    for (let i = 1; i < withShares.length; i++) {
      const idx = Math.floor(withShares[i].timestamp / BUCKET_MS) - firstBucket;
      if (idx < 0 || idx >= BUCKET_COUNT) continue;
      const d = (withShares[i].sharesAccepted as number) - (withShares[i - 1].sharesAccepted as number);
      if (d > 0) sharesBuckets[idx] += d;
      sharesSeen[idx] += 1;
    }
  }
  const sharesSeries = sharesBuckets.map((v, i) => (sharesSeen[i] > 0 ? v : null));

  // Shares/min: sharesAccepted is a cumulative counter (per bucket we stored its
  // max), so sum only positive deltas between consecutive buckets over a recent
  // window (positive-only ignores counter resets on device restart) and divide
  // by the elapsed minutes the window actually spans.
  const SHARES_WINDOW_MS = 20 * 60 * 1000;
  const sharesWindowStart = now - SHARES_WINDOW_MS;
  let sharesDelta = 0;
  let earliest = Infinity;
  let latest = 0;
  for (const { rows } of results) {
    const inWindow = rows.filter((r) => r.timestamp >= sharesWindowStart && r.sharesAccepted != null);
    for (let i = 1; i < inWindow.length; i++) {
      const d = (inWindow[i].sharesAccepted as number) - (inWindow[i - 1].sharesAccepted as number);
      if (d > 0) sharesDelta += d;
    }
    if (inWindow.length > 0) {
      earliest = Math.min(earliest, inWindow[0].timestamp);
      latest = Math.max(latest, inWindow[inWindow.length - 1].timestamp);
    }
  }
  const elapsedMin = latest > earliest ? (latest - earliest) / 60000 : 0;
  const sharesPerMin = elapsedMin > 0 ? sharesDelta / elapsedMin : null;

  return {
    hashSeries,
    tempSeries,
    effSeries,
    powerSeries,
    sharesSeries,
    avg1h: trailingAvg(hashSeries, Math.round((60 * 60 * 1000) / BUCKET_MS)), // 12 buckets
    avg6h: trailingAvg(hashSeries, Math.round((6 * 60 * 60 * 1000) / BUCKET_MS)), // 72 buckets
    avg12h: trailingAvg(hashSeries, BUCKET_COUNT), // 144 buckets
    sharesPerMin,
    loading: false,
  };
}

// Refreshes on mount and every REFRESH_MS. `devices` is only used to detect the
// online set — we intentionally key the effect on the joined online-id list so
// adding/removing a device re-fetches, but a metrics tick (which mutates
// latestMetrics) does not thrash the 12h history fetch.
export function useFleetHistory(devices: DeviceLike[]): FleetHistory {
  const [history, setHistory] = useState<FleetHistory>(emptyHistory);
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const key = devices
    .filter((d) => d.isOnline)
    .map((d) => d.id)
    .sort()
    .join(',');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const next = await computeFleetHistory(devicesRef.current);
        if (!cancelled) setHistory(next);
      } catch (err) {
        console.error('Failed to compute fleet history:', err);
        if (!cancelled) setHistory((h) => ({ ...h, loading: false }));
      }
    };

    run();
    const interval = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return history;
}
