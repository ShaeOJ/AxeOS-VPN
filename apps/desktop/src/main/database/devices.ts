import { getDatabase, generateId } from './index';

export interface Device {
  id: string;
  name: string;
  ip_address: string;
  poll_interval: number;
  last_seen: number | null;
  is_online: number;
  group_id: string | null;
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

export function createDevice(name: string, ipAddress: string): Device {
  const db = getDatabase();
  const id = generateId();
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO devices (id, name, ip_address, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, name, ipAddress, createdAt);

  return {
    id,
    name,
    ip_address: ipAddress,
    poll_interval: 5000,
    last_seen: null,
    is_online: 0,
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
