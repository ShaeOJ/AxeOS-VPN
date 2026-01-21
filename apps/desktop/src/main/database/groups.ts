import { getDatabase, generateId } from './index';

export interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: number;
}

export function getAllGroups(): DeviceGroup[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM device_groups ORDER BY sort_order ASC, created_at ASC').all() as DeviceGroup[];
}

export function getGroupById(id: string): DeviceGroup | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM device_groups WHERE id = ?').get(id) as DeviceGroup | undefined;
}

export function createGroup(name: string, color: string = '#FFB000'): DeviceGroup {
  const db = getDatabase();
  const id = generateId();
  const createdAt = Date.now();

  // Get the max sort_order to put new group at the end
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM device_groups').get() as { max: number | null };
  const sortOrder = (maxOrder?.max ?? -1) + 1;

  db.prepare(`
    INSERT INTO device_groups (id, name, color, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, color, sortOrder, createdAt);

  return {
    id,
    name,
    color,
    sort_order: sortOrder,
    created_at: createdAt,
  };
}

export function updateGroup(id: string, name: string, color: string): void {
  const db = getDatabase();
  db.prepare('UPDATE device_groups SET name = ?, color = ? WHERE id = ?').run(name, color, id);
}

export function updateGroupOrder(id: string, sortOrder: number): void {
  const db = getDatabase();
  db.prepare('UPDATE device_groups SET sort_order = ? WHERE id = ?').run(sortOrder, id);
}

export function deleteGroup(id: string): void {
  const db = getDatabase();
  // Devices in this group will have their group_id set to NULL due to ON DELETE SET NULL
  db.prepare('DELETE FROM device_groups WHERE id = ?').run(id);
}
