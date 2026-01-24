import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbDir = join(userDataPath, 'data');

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = join(dbDir, 'axeos.db');
  console.log('Database path:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Check if we need to migrate the devices table (old schema had device_token, new has ip_address)
  const tableInfo = db.prepare("PRAGMA table_info(devices)").all() as { name: string }[];
  const hasOldSchema = tableInfo.some((col) => col.name === 'device_token');
  const hasNewSchema = tableInfo.some((col) => col.name === 'ip_address');

  if (hasOldSchema && !hasNewSchema) {
    console.log('Migrating devices table to new schema...');
    // Drop old devices table and related data (since structure changed significantly)
    db.exec(`
      DROP TABLE IF EXISTS metrics;
      DROP TABLE IF EXISTS alerts;
      DROP TABLE IF EXISTS devices;
    `);
    console.log('Old tables dropped, will recreate with new schema');
  }

  // Create tables
  db.exec(`
    -- User table (single user for this install)
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Sessions table for web access
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Device groups table
    CREATE TABLE IF NOT EXISTS device_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#FFB000',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Devices table (BitAxe devices accessed via IP)
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT UNIQUE NOT NULL,
      poll_interval INTEGER DEFAULT 5000,
      last_seen INTEGER,
      is_online INTEGER DEFAULT 0,
      group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );

    -- Metrics snapshots table
    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      hashrate REAL,
      temperature REAL,
      power REAL,
      data TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    -- Alerts table
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      value REAL,
      threshold REAL,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    -- Settings table (key-value store)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_metrics_device_timestamp ON metrics(device_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
    CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address);
  `);

  // Migration: Add group_id column to existing devices table if missing
  const devicesTableInfo = db.prepare("PRAGMA table_info(devices)").all() as { name: string }[];
  const hasGroupId = devicesTableInfo.some((col) => col.name === 'group_id');
  if (!hasGroupId) {
    console.log('Migrating devices table: adding group_id column...');
    db.exec('ALTER TABLE devices ADD COLUMN group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL');
    console.log('Migration complete: group_id column added');
  }

  // Create group_id index after migration ensures column exists
  db.exec('CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id)');

  // Migration: Add all_time_best_diff column to devices table if missing
  const hasAllTimeBestDiff = devicesTableInfo.some((col) => col.name === 'all_time_best_diff');
  if (!hasAllTimeBestDiff) {
    console.log('Migrating devices table: adding all_time_best_diff column...');
    db.exec('ALTER TABLE devices ADD COLUMN all_time_best_diff REAL DEFAULT 0');
    db.exec('ALTER TABLE devices ADD COLUMN all_time_best_diff_at INTEGER');
    console.log('Migration complete: all_time_best_diff columns added');
  }

  // Migration: Add device_type column for multi-miner support (BETA)
  const hasDeviceType = devicesTableInfo.some((col) => col.name === 'device_type');
  if (!hasDeviceType) {
    console.log('Migrating devices table: adding device_type column...');
    db.exec("ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT 'bitaxe'");
    console.log('Migration complete: device_type column added');
  }

  // Migration: Add auth credentials for Bitmain devices
  const hasAuthUser = devicesTableInfo.some((col) => col.name === 'auth_user');
  if (!hasAuthUser) {
    console.log('Migrating devices table: adding auth credentials columns...');
    db.exec("ALTER TABLE devices ADD COLUMN auth_user TEXT");
    db.exec("ALTER TABLE devices ADD COLUMN auth_pass TEXT");
    console.log('Migration complete: auth credentials columns added');
  }

  // Initialize default settings
  const initSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  initSetting.run('server_port', '45678');
  initSetting.run('connection_code', generateConnectionCode());

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function generateConnectionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to generate IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
