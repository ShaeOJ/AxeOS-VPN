import bcrypt from 'bcryptjs';
import { getDatabase, generateId } from './index';

const SALT_ROUNDS = 12;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isPasswordSet(): boolean {
  const db = getDatabase();
  const user = db.prepare('SELECT id FROM user WHERE id = 1').get();
  return !!user;
}

export async function setPassword(password: string): Promise<void> {
  const db = getDatabase();
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  db.prepare(`
    INSERT INTO user (id, password_hash, created_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash
  `).run(hash, Date.now());
}

export async function verifyPassword(password: string): Promise<boolean> {
  const db = getDatabase();
  const user = db.prepare('SELECT password_hash FROM user WHERE id = 1').get() as
    | { password_hash: string }
    | undefined;

  if (!user) return false;

  return bcrypt.compare(password, user.password_hash);
}

export function createSession(): { token: string; expiresAt: number } {
  const db = getDatabase();
  const id = generateId();
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_DURATION;

  db.prepare(`
    INSERT INTO sessions (id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, token, expiresAt, Date.now());

  // Clean up expired sessions
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

  return { token, expiresAt };
}

export function validateSession(token: string): boolean {
  const db = getDatabase();
  const session = db.prepare(`
    SELECT id FROM sessions
    WHERE token = ? AND expires_at > ?
  `).get(token, Date.now());

  return !!session;
}

export function deleteSession(token: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function deleteAllSessions(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions').run();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const isValid = await verifyPassword(currentPassword);
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  await setPassword(newPassword);
  deleteAllSessions();
  return { success: true };
}

export function resetPassword(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM user WHERE id = 1').run();
  deleteAllSessions();
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
