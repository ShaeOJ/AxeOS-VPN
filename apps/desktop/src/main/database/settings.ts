import { getDatabase } from './index';

export function getSetting(key: string): string | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function deleteSetting(key: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function getAllSettings(): Record<string, string> {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Specific settings helpers
export function getServerPort(): number {
  const port = getSetting('server_port');
  return port ? parseInt(port, 10) : 45678;
}

export function setServerPort(port: number): void {
  setSetting('server_port', port.toString());
}

export function getConnectionCode(): string {
  return getSetting('connection_code') || 'ERROR';
}

export function regenerateConnectionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  setSetting('connection_code', code);
  return code;
}
