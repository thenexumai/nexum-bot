import { db } from '../core/db';
import crypto from 'crypto';

export interface DeviceInfo {
  device_id: string;
  device_name: string;
  platform: string;
  status: 'online' | 'offline';
  last_seen: string;
}

export function generateLinkCode(uid: number): string {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare(`INSERT OR REPLACE INTO link_codes (code, uid, expires_at, used) VALUES (?, ?, ?, 0)`).run(code, uid, expiresAt);
  return code;
}

export function useLinkCode(code: string, deviceId: string, deviceName: string, platform: string): number | null {
  const row = db.prepare(`SELECT uid FROM link_codes WHERE code=? AND used=0 AND expires_at > datetime('now')`).get(code) as { uid: number } | undefined;
  if (!row) return null;
  db.prepare(`UPDATE link_codes SET used=1 WHERE code=?`).run(code);
  db.prepare(`
    INSERT INTO pc_agents (uid, device_id, device_name, platform, last_seen, status)
    VALUES (?, ?, ?, ?, datetime('now'), 'online')
    ON CONFLICT(uid) DO UPDATE SET
      device_id=excluded.device_id, device_name=excluded.device_name,
      platform=excluded.platform, last_seen=excluded.last_seen, status='online'
  `).run(row.uid, deviceId, deviceName, platform);
  return row.uid;
}

export function getDevice(uid: number): DeviceInfo | undefined {
  return db.prepare(`SELECT * FROM pc_agents WHERE uid=?`).get(uid) as DeviceInfo | undefined;
}

export function listDevices(uid: number): DeviceInfo[] {
  return db.prepare(`SELECT device_id, device_name, platform, status, last_seen FROM pc_agents WHERE uid=?`).all(uid) as DeviceInfo[];
}

export function updateDeviceStatus(uid: number, status: 'online' | 'offline'): void {
  db.prepare(`UPDATE pc_agents SET status=?, last_seen=datetime('now') WHERE uid=?`).run(status, uid);
}

export function isDeviceOnline(uid: number): boolean {
  const row = db.prepare(`SELECT status, last_seen FROM pc_agents WHERE uid=?`).get(uid) as { status: string; last_seen: string } | undefined;
  if (!row || row.status !== 'online') return false;
  return Date.now() - new Date(row.last_seen + 'Z').getTime() < 60_000;
}
