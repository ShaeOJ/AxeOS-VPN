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
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const result = db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoffTime);
  return result.changes;
}
