import { getDatabase, generateId } from './index';

export type DeviceType = 'bitaxe' | 'bitmain' | 'canaan';

export interface Device {
  id: string;
  name: string;
  ip_address: string;
  device_type: DeviceType;
  auth_user: string | null;
  auth_pass: string | null;
  poll_interval: number;
  last_seen: number | null;
  is_online: number;
  group_id: string | null;
  all_time_best_diff: number | null;
  all_time_best_diff_at: number | null;
  created_at: number;
}

export function getAllDevices(): Device[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all() as Device[];
}

export function getDeviceById(id: string): Device | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
}

export function getDeviceByIp(ipAddress: string): Device | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM devices WHERE ip_address = ?').get(ipAddress) as Device | undefined;
}

export interface CreateDeviceOptions {
  name: string;
  ipAddress: string;
  deviceType?: DeviceType;
  authUser?: string;
  authPass?: string;
}

export function createDevice(name: string, ipAddress: string, deviceType: DeviceType = 'bitaxe', authUser?: string, authPass?: string): Device {
  const db = getDatabase();
  const id = generateId();
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO devices (id, name, ip_address, device_type, auth_user, auth_pass, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, ipAddress, deviceType, authUser || null, authPass || null, createdAt);

  return {
    id,
    name,
    ip_address: ipAddress,
    device_type: deviceType,
    auth_user: authUser || null,
    auth_pass: authPass || null,
    poll_interval: 5000,
    last_seen: null,
    is_online: 0,
    group_id: null,
    all_time_best_diff: null,
    all_time_best_diff_at: null,
    created_at: createdAt,
  };
}

export function updateDeviceStatus(id: string, isOnline: boolean): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE devices
    SET is_online = ?, last_seen = ?
    WHERE id = ?
  `).run(isOnline ? 1 : 0, Date.now(), id);
}

export function updateDeviceName(id: string, name: string): void {
  const db = getDatabase();
  db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
}

export function updateDeviceIp(id: string, ipAddress: string): void {
  const db = getDatabase();
  db.prepare('UPDATE devices SET ip_address = ? WHERE id = ?').run(ipAddress, id);
}

export function updateDeviceType(id: string, deviceType: DeviceType, authUser?: string, authPass?: string): void {
  const db = getDatabase();
  db.prepare('UPDATE devices SET device_type = ?, auth_user = ?, auth_pass = ? WHERE id = ?')
    .run(deviceType, authUser || null, authPass || null, id);
}

export function updatePollInterval(id: string, interval: number): void {
  const db = getDatabase();
  db.prepare('UPDATE devices SET poll_interval = ? WHERE id = ?').run(interval, id);
}

export function deleteDevice(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
}

export function setDeviceGroup(id: string, groupId: string | null): void {
  const db = getDatabase();
  db.prepare('UPDATE devices SET group_id = ? WHERE id = ?').run(groupId, id);
}

export function getDevicesByGroup(groupId: string | null): Device[] {
  const db = getDatabase();
  if (groupId === null) {
    return db.prepare('SELECT * FROM devices WHERE group_id IS NULL ORDER BY created_at DESC').all() as Device[];
  }
  return db.prepare('SELECT * FROM devices WHERE group_id = ? ORDER BY created_at DESC').all(groupId) as Device[];
}

// Update all-time best difficulty if the new value is higher
// Returns true if a new record was set
export function updateAllTimeBestDiff(id: string, bestDiff: number): boolean {
  const db = getDatabase();
  const device = getDeviceById(id);

  if (!device) return false;

  const currentBest = device.all_time_best_diff || 0;

  if (bestDiff > currentBest) {
    db.prepare(`
      UPDATE devices
      SET all_time_best_diff = ?, all_time_best_diff_at = ?
      WHERE id = ?
    `).run(bestDiff, Date.now(), id);
    return true;
  }

  return false;
}
