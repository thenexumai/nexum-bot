import { db } from '../core/db';

export function generatePairingCode(uid: number): string {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT OR REPLACE INTO link_codes (code, device_id, platform, expires_at) VALUES (?,?,?,?)').run(code, `uid_${uid}`, 'pending', expires);
  return code;
}

export function verifyPairingCode(code: string): boolean {
  const row = db.prepare('SELECT * FROM link_codes WHERE code=? AND used=0 AND expires_at>datetime(\'now\')').get(code) as any;
  return !!row;
}

export function getPairedAgents(uid: number): string[] {
  const agents = db.prepare('SELECT device_name, platform, status, last_seen FROM pc_agents WHERE uid=? ORDER BY last_seen DESC').all(uid) as any[];
  return agents.map(a => `${a.device_name || 'Device'} (${a.platform || 'Unknown'}) — ${a.status}`);
}

export function isAgentOnline(uid: number): boolean {
  const row = db.prepare('SELECT status FROM pc_agents WHERE uid=?').get(uid) as any;
  return row?.status === 'online';
}
