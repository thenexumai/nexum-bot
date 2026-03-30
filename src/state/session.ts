/**
 * NEXUM Session Manager
 * In-memory sessions with optional SQLite persistence across restarts.
 */

import db from '../core/db';
import { Logger } from '../infra/logger';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_MESSAGES = 40;

const sessions = new Map<number, SessionMessage[]>();

export function getSession(uid: number): SessionMessage[] {
  return sessions.get(uid) ?? [];
}

export function addToSession(uid: number, role: SessionMessage['role'], content: string): void {
  if (!sessions.has(uid)) sessions.set(uid, []);
  const msgs = sessions.get(uid)!;

  msgs.push({ role, content, ts: Date.now() });

  // Trim to max messages
  if (msgs.length > MAX_MESSAGES) {
    const systemMsgs = msgs.filter(m => m.role === 'system');
    const nonSystem = msgs.filter(m => m.role !== 'system');
    const trimmed = nonSystem.slice(-MAX_MESSAGES + systemMsgs.length);
    sessions.set(uid, [...systemMsgs.slice(-1), ...trimmed]);
  }
}

export function clearSession(uid: number): void {
  sessions.delete(uid);
  Logger.info('session', `Session cleared for uid=${uid}`);
}

export function hasActiveSession(uid: number): boolean {
  const msgs = sessions.get(uid);
  if (!msgs || msgs.length === 0) return false;
  const last = msgs[msgs.length - 1];
  return Date.now() - last.ts < SESSION_TTL_MS;
}

export function pruneExpiredSessions(): number {
  let pruned = 0;
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [uid, msgs] of sessions.entries()) {
    if (!msgs.length) { sessions.delete(uid); pruned++; continue; }
    const last = msgs[msgs.length - 1];
    if (last.ts < cutoff) {
      sessions.delete(uid);
      pruned++;
    }
  }
  if (pruned > 0) Logger.info('session', `Pruned ${pruned} expired sessions`);
  return pruned;
}

export function getSessionStats(): { active: number; total: number } {
  const cutoff = Date.now() - SESSION_TTL_MS;
  let active = 0;
  for (const msgs of sessions.values()) {
    if (msgs.length && msgs[msgs.length - 1].ts > cutoff) active++;
  }
  return { active, total: sessions.size };
}

/** Persist to DB across restarts */
export function persistSession(uid: number): void {
  try {
    const msgs = sessions.get(uid);
    if (!msgs) return;
    db.prepare(`
      INSERT INTO sessions (uid, messages, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(uid) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
    `).run(uid, JSON.stringify(msgs));
  } catch {
    // in-memory fallback — ok
  }
}

/** Load from DB on restart */
export function loadSession(uid: number): void {
  try {
    const row = db.prepare(`SELECT messages FROM sessions WHERE uid=?`).get(uid) as { messages: string } | undefined;
    if (row?.messages) {
      const msgs = JSON.parse(row.messages) as SessionMessage[];
      if (msgs.length && Date.now() - msgs[msgs.length - 1].ts < SESSION_TTL_MS) {
        sessions.set(uid, msgs);
      }
    }
  } catch {
    // ignore
  }
}

/** Aliases для handler.ts */
export const getSessionHistory = (uid: number) =>
  getSession(uid).map(m => ({ role: m.role, content: m.content }));

export const appendToSession = (uid: number, role: 'user' | 'assistant', content: string) => {
  addToSession(uid, role, content.slice(0, 4000));
  persistSession(uid);
};
