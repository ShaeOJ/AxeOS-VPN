import { getDatabase, generateId } from './index';

// A recorded (provisional) block found by a solo miner. See the blocks table
// in database/index.ts for why device_id is nullable and device_name is a
// snapshot.
export interface Block {
  id: string;
  device_id: string | null;
  device_name: string;
  coin: string;
  found_at: number;
  share_diff: number | null;
  network_diff: number | null;
  block_height: number | null;
  reward: number | null;
  fiat_value: number | null;
  fiat_currency: string | null;
  pool_url: string | null;
  source: 'bestdiff' | 'firmware';
  confirmed: number;
  created_at: number;
}

export interface RecordBlockInput {
  deviceId: string | null;
  deviceName: string;
  coin: string;
  foundAt: number;
  shareDiff?: number | null;
  networkDiff?: number | null;
  blockHeight?: number | null;
  reward?: number | null;
  fiatValue?: number | null;
  fiatCurrency?: string | null;
  poolUrl?: string | null;
  source: 'bestdiff' | 'firmware';
}

export function recordBlock(input: RecordBlockInput): Block {
  const db = getDatabase();
  const id = generateId();
  db.prepare(`
    INSERT INTO blocks (
      id, device_id, device_name, coin, found_at, share_diff, network_diff,
      block_height, reward, fiat_value, fiat_currency, pool_url, source, confirmed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    input.deviceId,
    input.deviceName,
    input.coin,
    input.foundAt,
    input.shareDiff ?? null,
    input.networkDiff ?? null,
    input.blockHeight ?? null,
    input.reward ?? null,
    input.fiatValue ?? null,
    input.fiatCurrency ?? null,
    input.poolUrl ?? null,
    input.source,
  );
  return db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as Block;
}

export function getBlocks(limit = 100, offset = 0): Block[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM blocks ORDER BY found_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as Block[];
}

export function getBlockById(id: string): Block | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as Block | undefined;
}

export function getBlockCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS n FROM blocks').get() as { n: number };
  return row.n;
}

export function getBlockCountByDevice(deviceId: string): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS n FROM blocks WHERE device_id = ?').get(deviceId) as { n: number };
  return row.n;
}

// { btc: 2, dgb: 1, ... } for the per-coin breakdown on the counter tile.
export function getBlockCountsByCoin(): Record<string, number> {
  const db = getDatabase();
  const rows = db.prepare('SELECT coin, COUNT(*) AS n FROM blocks GROUP BY coin').all() as { coin: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.coin] = r.n;
  return out;
}

export function setBlockConfirmed(id: string, confirmed: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE blocks SET confirmed = ? WHERE id = ?').run(confirmed ? 1 : 0, id);
}

export function deleteBlock(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM blocks WHERE id = ?').run(id);
}
