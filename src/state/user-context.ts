/**
 * NEXUM User Context Manager
 * Tracks per-user runtime state beyond the database.
 * Inspired by OpenClaw's state management system.
 */

import db from '../core/db'; // ✅ FIXED: db.ts uses default export

export interface UserContext {
  uid: number;
  sessionStarted: number;
  messageCount: number;
  lastActivity: number;
  currentTopic?: string;
  awaitingConfirmation?: {
    action: string;
    payload: unknown;
    expiresAt: number;
  };
  pcAgentConnected: boolean;
  voiceMode: boolean;
  focusMode: boolean;
}

const contexts = new Map<number, UserContext>();

export function getContext(uid: number): UserContext {
  if (!contexts.has(uid)) {
    contexts.set(uid, {
      uid,
      sessionStarted: Date.now(),
      messageCount: 0,
      lastActivity: Date.now(),
      pcAgentConnected: false,
      voiceMode: false,
      focusMode: false,
    });
  }
  return contexts.get(uid)!;
}

export function updateContext(uid: number, patch: Partial<UserContext>): void {
  const ctx = getContext(uid);
  Object.assign(ctx, patch);
  ctx.lastActivity = Date.now();
}

export function incrementMessageCount(uid: number): void {
  const ctx = getContext(uid);
  ctx.messageCount++;
  ctx.lastActivity = Date.now();
}

export function setAwaitingConfirmation(
  uid: number,
  action: string,
  payload: unknown,
  timeoutMs = 60_000,
): void {
  updateContext(uid, {
    awaitingConfirmation: {
      action,
      payload,
      expiresAt: Date.now() + timeoutMs,
    },
  });
}

export function consumeConfirmation(uid: number): { action: string; payload: unknown } | null {
  const ctx = getContext(uid);
  if (!ctx.awaitingConfirmation) return null;
  if (Date.now() > ctx.awaitingConfirmation.expiresAt) {
    ctx.awaitingConfirmation = undefined;
    return null;
  }
  const result = ctx.awaitingConfirmation;
  ctx.awaitingConfirmation = undefined;
  return result;
}

export function clearContext(uid: number): void {
  contexts.delete(uid);
}

/** Persist user preferences to DB */
export function persistContextToDb(uid: number): void {
  const ctx = getContext(uid);
  try {
    db.prepare(`
      INSERT INTO memory (uid, key, value, updated_at)
      VALUES (?, 'ctx_voice_mode', ?, datetime('now'))
      ON CONFLICT(uid, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(uid, ctx.voiceMode ? '1' : '0');
  } catch {
    // Silently ignore — context is in-memory fallback
  }
}

/** Load persisted preferences from DB */
export function loadContextFromDb(uid: number): void {
  try {
    const voice = db.prepare(`SELECT value FROM memory WHERE uid=? AND key='ctx_voice_mode'`).get(uid) as { value: string } | undefined;
    if (voice) {
      updateContext(uid, { voiceMode: voice.value === '1' });
    }
  } catch {
    // Ignore
  }
}

/** Stats for admin */
export function getActiveSessionCount(): number {
  const cutoff = Date.now() - 15 * 60_000; // 15 min
  return [...contexts.values()].filter(c => c.lastActivity > cutoff).length;
}
