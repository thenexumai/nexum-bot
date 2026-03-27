// NEXUM PC Agent pairing — link codes & device registry

import { db } from '../core/db';
import crypto from 'crypto';

export function generateLinkCode(uid: number): string {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  (db as any).prepare(
    `INSERT OR REPLACE INTO link_codes (code, uid, expires_at, used) VALUES (?,?,?,0)`
  ).run(code, uid, expiresAt);

  return code;
}

export function validateLinkCode(code: string): number | null {
  const row = (db as any).prepare(
    `SELECT uid FROM link_codes WHERE code=? AND used=0 AND expires_at>datetime('now')`
  ).get(code) as any;
  return row?.uid || null;
}

export function useLinkCode(code: string, deviceId: string, deviceName: string, platform: string): number | null {
  const uid = validateLinkCode(code);
  if (!uid) return null;

  (db as any).prepare(`UPDATE link_codes SET used=1 WHERE code=?`).run(code);

  (db as any).prepare(
    `INSERT INTO pc_agents (uid, device_id, device_name, platform, last_seen, status)
     VALUES (?,?,?,?,datetime('now'),'online')
     ON CONFLICT(uid) DO UPDATE SET
       device_id=excluded.device_id,
       device_name=excluded.device_name,
       platform=excluded.platform,
       last_seen=excluded.last_seen,
       status='online'`
  ).run(uid, deviceId, deviceName, platform);

  return uid;
}

export function getAgent(uid: number): any {
  return (db as any).prepare(`SELECT * FROM pc_agents WHERE uid=?`).get(uid);
}

export function updateAgentStatus(uid: number, status: 'online' | 'offline') {
  (db as any).prepare(
    `UPDATE pc_agents SET status=?, last_seen=datetime('now') WHERE uid=?`
  ).run(status, uid);
}

export function isAgentOnline(uid: number): boolean {
  const row = (db as any).prepare(
    `SELECT status, last_seen FROM pc_agents WHERE uid=?`
  ).get(uid) as any;
  if (!row || row.status !== 'online') return false;

  // Consider offline if last seen > 60 seconds ago
  const lastSeen = new Date(row.last_seen + 'Z').getTime();
  return Date.now() - lastSeen < 60_000;
}

export function listDevices(uid: number): any[] {
  return (db as any).prepare(
    `SELECT device_id, device_name, platform, status, last_seen FROM pc_agents WHERE uid=?`
  ).all(uid) as any[] || [];
}
