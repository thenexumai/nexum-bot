/**
 * NEXUM Audit Log — immutable record of all PC Agent actions
 * Every capability execution is logged for security and review.
 */

import db from '../../core/db';
import { createLogger } from '../../infra/logger';

const log = createLogger('audit');

export type AuditAction = 'pc_exec' | 'pc_denied' | 'pc_approved' | 'pc_timeout' | 'pc_connect' | 'pc_disconnect';

export interface AuditEntry {
  id?: number;
  uid: number;
  action: AuditAction;
  capability: string;
  args?: Record<string, unknown>;
  result?: string;
  approved?: boolean;
  safety_level?: string;
  timestamp: string;
}

// Ensure audit table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uid          INTEGER NOT NULL,
    action       TEXT NOT NULL,
    capability   TEXT NOT NULL,
    args         TEXT,
    result       TEXT,
    approved     INTEGER,
    safety_level TEXT,
    timestamp    TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_uid ON audit_log(uid, timestamp);
`);

// ── Public API ─────────────────────────────────────────────────────────────────

export function logAudit(entry: Omit<AuditEntry, 'timestamp'>): void {
  try {
    db.prepare(`
      INSERT INTO audit_log (uid, action, capability, args, result, approved, safety_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.uid,
      entry.action,
      entry.capability,
      entry.args ? JSON.stringify(entry.args) : null,
      entry.result ?? null,
      entry.approved !== undefined ? (entry.approved ? 1 : 0) : null,
      entry.safety_level ?? null,
    );
  } catch (err) {
    log.error(`Audit log failed: ${err}`);
  }
}

export function getAuditLog(uid: number, limit = 50): AuditEntry[] {
  return db.prepare(`
    SELECT * FROM audit_log WHERE uid=? ORDER BY timestamp DESC LIMIT ?
  `).all(uid, limit) as AuditEntry[];
}

export function getRecentActions(uid: number, minutes = 60): AuditEntry[] {
  return db.prepare(`
    SELECT * FROM audit_log
    WHERE uid=? AND timestamp > datetime('now', '-' || ? || ' minutes')
    ORDER BY timestamp DESC
  `).all(uid, minutes) as AuditEntry[];
}

export function formatAuditEntry(entry: AuditEntry): string {
  const icon = entry.approved === false ? '❌' : entry.action === 'pc_exec' ? '✅' : '🔧';
  const time = entry.timestamp.replace('T', ' ').slice(0, 16);
  return `${icon} \`${time}\` — **${entry.capability}** (${entry.safety_level ?? '?'})`;
}
