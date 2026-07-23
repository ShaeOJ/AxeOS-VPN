import { useEffect, useRef, useState } from 'react';

// Fleet-wide rolling history for the dashboard hero + mini sparklines.
//
// Reuses the per-device getMetrics + timestamp-bucket pattern proven in
// ChartsPage, but rolls every device into a single fleet series. Note the unit
// gotcha: stored metric.hashrate is in H/s, whereas the dashboard's instant
// totalHashrate (from latestMetrics.hashRate) is GH/s. We convert to GH/s here
// so the sparkline and the big hero number share one scale.

const BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets
const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const BUCKET_COUNT = Math.round(WINDOW_MS / BUCKET_MS); // 144
const REFRESH_MS = 60 * 1000;

export interface FleetHistory {
  hashSeries: (number | null)[]; // fleet total hashrate, GH/s, oldest -> newest
  tempSeries: (number | null)[]; // fleet average temp, °C
  effSeries: (number | null)[]; // fleet efficiency, J/TH
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

interface Bucket {
  hashSum: number; // sum of device mean hashrate (GH/s), SHA-256 only
  tempSum: number; // sum of device mean temps
  tempCount: number;
  powerSum: number; // sum of device mean power (W)
}

const emptyHistory: FleetHistory = {
  hashSeries: [],
  tempSeries: [],
  effSeries: [],
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
    return { ...emptyHistory, hashSeries: [], loading: false };
  }

  const now = Date.now();
  const startTime = now - WINDOW_MS;
  const nowBucket = Math.floor(now / BUCKET_MS);
  const firstBucket = nowBucket - (BUCKET_COUNT - 1);

  // Fixed grid of bucket accumulators, index 0 = oldest.
  const buckets: Bucket[] = Array.from({ length: BUCKET_COUNT }, () => ({
    hashSum: 0,
    tempSum: 0,
    tempCount: 0,
    powerSum: 0,
  }));

  const results = await Promise.all(
    online.map(async (d) => {
      const metrics = await window.electronAPI.getMetrics(d.id, { startTime, limit: 2000 });
      return { isScrypt: d.latestMetrics?.algorithm === 'scrypt', metrics };
    })
  );

  // Per device, average its samples within each bucket, then fold into the fleet
  // accumulators. Averaging within a bucket keeps a chatty poller from
  // over-weighting a bucket relative to a quiet one.
  for (const { isScrypt, metrics } of results) {
    const perBucket = new Map<number, { hash: number[]; temp: number[]; power: number[] }>();
    for (const m of metrics) {
      const idx = Math.floor(m.timestamp / BUCKET_MS) - firstBucket;
      if (idx < 0 || idx >= BUCKET_COUNT) continue;
      let b = perBucket.get(idx);
      if (!b) {
        b = { hash: [], temp: [], power: [] };
        perBucket.set(idx, b);
      }
      if (m.hashrate != null) b.hash.push(m.hashrate / 1e9); // H/s -> GH/s
      if (m.temperature != null) b.temp.push(m.temperature);
      if (m.power != null) b.power.push(m.power);
    }

    for (const [idx, b] of perBucket) {
      const acc = buckets[idx];
      const h = mean(b.hash);
      // SHA-256 devices only contribute to fleet hashrate / efficiency.
      if (h != null && !isScrypt) acc.hashSum += h;
      const t = mean(b.temp);
      if (t != null) {
        acc.tempSum += t;
        acc.tempCount += 1;
      }
      const p = mean(b.power);
      if (p != null && !isScrypt) acc.powerSum += p;
    }
  }

  const hashSeries: (number | null)[] = [];
  const tempSeries: (number | null)[] = [];
  const effSeries: (number | null)[] = [];

  for (const b of buckets) {
    const hasHash = b.hashSum > 0;
    hashSeries.push(hasHash ? b.hashSum : null);
    tempSeries.push(b.tempCount > 0 ? b.tempSum / b.tempCount : null);
    // Efficiency J/TH = watts / (GH/s / 1000)
    effSeries.push(hasHash && b.powerSum > 0 ? b.powerSum / (b.hashSum / 1000) : null);
  }

  // Shares/min: sharesAccepted is a cumulative counter, so sum only positive
  // deltas across a recent window (positive-only ignores restarts that reset the
  // counter to 0) and divide by the actual elapsed time the window covers.
  const SHARES_WINDOW_MS = 15 * 60 * 1000;
  const sharesWindowStart = now - SHARES_WINDOW_MS;
  let sharesDelta = 0;
  let earliest = Infinity;
  let latest = 0;
  for (const { metrics } of results) {
    const inWindow = metrics
      .filter((m) => m.timestamp >= sharesWindowStart && m.data?.sharesAccepted != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < inWindow.length; i++) {
      const d = (inWindow[i].data!.sharesAccepted as number) - (inWindow[i - 1].data!.sharesAccepted as number);
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
    avg1h: trailingAvg(hashSeries, Math.round((60 * 60 * 1000) / BUCKET_MS)), // 12 buckets
    avg6h: trailingAvg(hashSeries, Math.round((6 * 60 * 60 * 1000) / BUCKET_MS)), // 72 buckets
    avg12h: trailingAvg(hashSeries, BUCKET_COUNT), // 144 buckets
    sharesPerMin,
    loading: false,
  };
}

// Refreshes on mount and every REFRESH_MS. `devices` is only used to detect the
// online set — we intentionally key the effect on device count + a joined id
// list so adding/removing a device re-fetches, but a metrics tick (which
// mutates latestMetrics) does not thrash the 12h history fetch.
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
