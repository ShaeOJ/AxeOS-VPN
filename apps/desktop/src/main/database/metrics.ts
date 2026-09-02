import { getDatabase, generateId } from './index';

export interface MetricRecord {
  id: string;
  device_id: string;
  timestamp: number;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: string;
  created_at: number;
}

export interface SimpleMetrics {
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: string;
}

export function saveMetrics(deviceId: string, metrics: SimpleMetrics): void {
  const db = getDatabase();
  const id = generateId();
  const timestamp = Date.now();

  db.prepare(`
    INSERT INTO metrics (id, device_id, timestamp, hashrate, temperature, power, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    deviceId,
    timestamp,
    metrics.hashrate,
    metrics.temperature,
    metrics.power,
    metrics.data
  );
}

export function getMetrics(
  deviceId: string,
  options: { startTime?: number; endTime?: number; limit?: number } = {}
): MetricRecord[] {
  const db = getDatabase();
  const { startTime, endTime, limit = 100 } = options;

  let query = 'SELECT * FROM metrics WHERE device_id = ?';
  const params: (string | number)[] = [deviceId];

  if (startTime) {
    query += ' AND timestamp >= ?';
    params.push(startTime);
  }

  if (endTime) {
    query += ' AND timestamp <= ?';
    params.push(endTime);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params) as MetricRecord[];
}

export interface BucketedMetric {
  timestamp: number; // bucket start (earliest sample in the bucket), ms
  hashrate: number | null; // avg H/s over the bucket
  temperature: number | null; // avg °C
  maxTemperature: number | null; // peak °C in the bucket
  power: number | null; // avg W
  sharesAccepted: number | null; // max cumulative share counter seen in the bucket
  samples: number; // raw rows folded into this bucket
}

// Downsampled time-series for charts/sparklines. The heavy lifting (averaging,
// bucketing, and pulling just sharesAccepted out of the JSON blob) happens in
// SQLite, so we ship ~1 row per bucket of plain numbers instead of thousands of
// ~3KB `data` blobs that then have to be JSON.parsed in the renderer. This is
// the single biggest win for chart load time + memory. Buckets are aligned to
// the epoch (timestamp / bucketMs) so repeated calls return stable buckets.
export function getBucketedMetrics(
  deviceId: string,
  options: { startTime?: number; endTime?: number; bucketMs?: number } = {}
): BucketedMetric[] {
  const db = getDatabase();
  const { startTime, endTime, bucketMs = 5 * 60 * 1000 } = options;
  const bucket = Math.max(1, Math.floor(bucketMs));

  let query = `
    SELECT
      MIN(timestamp) AS timestamp,
      AVG(hashrate) AS hashrate,
      AVG(temperature) AS temperature,
      MAX(temperature) AS maxTemperature,
      AVG(power) AS power,
      MAX(CAST(json_extract(data, '$.sharesAccepted') AS REAL)) AS sharesAccepted,
      COUNT(*) AS samples
    FROM metrics
    WHERE device_id = ?`;
  const params: (string | number)[] = [deviceId];

  if (startTime) {
    query += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    query += ' AND timestamp <= ?';
    params.push(endTime);
  }

  // CAST the divisor to INTEGER: better-sqlite3 binds JS numbers as REAL, and
  // `timestamp / 300000.0` is a floating divide that never groups (every ms
  // becomes a distinct bucket), which would collapse the aggregation and let the
  // caller sum many raw rows into one cell. Integer division buckets correctly.
  query += ` GROUP BY timestamp / CAST(? AS INTEGER) ORDER BY timestamp ASC`;
  params.push(bucket);

  return db.prepare(query).all(...params) as BucketedMetric[];
}

export function getLatestMetrics(deviceId: string): MetricRecord | undefined {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM metrics
    WHERE device_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(deviceId) as MetricRecord | undefined;
}

export function getAggregatedMetrics(
  deviceId: string,
  startTime: number,
  endTime: number
): { avgHashrate: number; maxTemperature: number; avgPower: number; count: number } {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT
      AVG(hashrate) as avgHashrate,
      MAX(temperature) as maxTemperature,
      AVG(power) as avgPower,
      COUNT(*) as count
    FROM metrics
    WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
  `).get(deviceId, startTime, endTime) as {
    avgHashrate: number | null;
    maxTemperature: number | null;
    avgPower: number | null;
    count: number;
  };

  return {
    avgHashrate: result.avgHashrate ?? 0,
    maxTemperature: result.maxTemperature ?? 0,
    avgPower: result.avgPower ?? 0,
    count: result.count,
  };
}

export function deleteMetricsForDevice(deviceId: string): number {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM metrics WHERE device_id = ?').run(deviceId);
  return result.changes;
}

export function cleanupOldMetrics(olderThanDays: number): number {
  const db = getDatabase();
  // 0 (or negative) means keep forever — do nothing.
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) return 0;
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const result = db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoffTime);
  return result.changes;
}

// Reclaim disk space after large deletes. VACUUM rewrites the DB file and needs
// a brief exclusive lock + free disk (~size of the DB); can take a while on
// large databases. Also truncates the WAL first.
export function vacuumDatabase(): void {
  const db = getDatabase();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
}

// Total metrics row count (fast estimate for diagnostics/UI).
export function getMetricsCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number };
  return row.c;
}
