/**
 * NEXUM Self-Evolution: Error Detector
 * Monitors runtime errors and prepares them for analysis.
 */

import { db } from '../core/db';
import { createLogger } from '../infra/logger';

const log = createLogger('evolution:detector');

export interface CapturedError {
  id: string;
  timestamp: number;
  source: string;       // 'telegram' | 'api' | 'db' | 'agent' | 'tool'
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
}

const errorBuffer = new Map<string, CapturedError>();
const MAX_BUFFER = 100;

function makeErrorKey(source: string, message: string): string {
  // Normalize dynamic parts (IDs, line numbers) for deduplication
  const normalized = message
    .replace(/\d+/g, 'N')
    .replace(/['"](.*?)['"]/g, '"X"')
    .slice(0, 120);
  return `${source}:${normalized}`;
}

export function captureError(
  source: string,
  error: Error | string,
  context?: Record<string, unknown>,
): string {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'object' ? error.stack : undefined;
  const key = makeErrorKey(source, message);

  if (errorBuffer.has(key)) {
    const existing = errorBuffer.get(key)!;
    existing.occurrences++;
    existing.lastSeen = Date.now();
    return existing.id;
  }

  // Evict oldest if buffer full
  if (errorBuffer.size >= MAX_BUFFER) {
    const oldest = [...errorBuffer.entries()].sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0];
    errorBuffer.delete(oldest[0]);
  }

  const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const captured: CapturedError = {
    id,
    timestamp: Date.now(),
    source,
    message,
    stack,
    context,
    occurrences: 1,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    resolved: false,
  };

  errorBuffer.set(key, captured);
  log.warn(`Error captured [${source}] ${message}`);

  // Persist to DB
  try {
    db.prepare(`
      INSERT OR IGNORE INTO evolution_errors
        (id, source, message, stack, context, occurrences, first_seen, last_seen, resolved)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), 0)
    `).run(id, source, message, stack ?? null, context ? JSON.stringify(context) : null);
  } catch {
    // Table might not exist yet — ignore
  }

  return id;
}

export function getUnresolvedErrors(): CapturedError[] {
  return [...errorBuffer.values()].filter(e => !e.resolved);
}

export function markResolved(id: string): void {
  for (const e of errorBuffer.values()) {
    if (e.id === id) { e.resolved = true; break; }
  }
  try {
    db.prepare(`UPDATE evolution_errors SET resolved=1 WHERE id=?`).run(id);
  } catch { /* ignore */ }
}

export function getTopErrors(limit = 5): CapturedError[] {
  return [...errorBuffer.values()]
    .filter(e => !e.resolved)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);
}

/** Install global uncaught exception handler */
export function installGlobalErrorHandler(): void {
  process.on('uncaughtException', (err) => {
    captureError('process', err, { type: 'uncaughtException' });
    log.error(`Uncaught exception: ${err.message}`);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError('process', err, { type: 'unhandledRejection' });
    log.error(`Unhandled rejection: ${err.message}`);
  });

  log.info('Global error handler installed');
}
