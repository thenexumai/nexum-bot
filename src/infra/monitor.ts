/**
 * NEXUM Monitor — runtime health monitoring
 * Tracks memory usage, uptime, API errors, and system health.
 */

import db from '../core/db';
import { createLogger } from './logger';

const log = createLogger('monitor');

interface HealthSnapshot {
  timestamp: string;
  uptime: number;
  memoryMb: number;
  heapUsedMb: number;
  dbOk: boolean;
  activeUsers24h: number;
  totalMessages: number;
  errorCount: number;
}

let errorCount = 0;
let lastSnapshot: HealthSnapshot | null = null;

export function recordError(): void {
  errorCount++;
}

export function getHealthSnapshot(): HealthSnapshot {
  const mem = process.memoryUsage();
  let dbOk = false;
  let activeUsers24h = 0;
  let totalMessages = 0;

  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
    activeUsers24h = (db.prepare(`
      SELECT COUNT(DISTINCT uid) AS c FROM conversations
      WHERE created_at > datetime('now', '-1 day')
    `).get() as { c: number }).c;
    totalMessages = (db.prepare('SELECT COUNT(*) AS c FROM conversations').get() as { c: number }).c;
  } catch {
    // db not ready
  }

  lastSnapshot = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memoryMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    dbOk,
    activeUsers24h,
    totalMessages,
    errorCount,
  };

  return lastSnapshot;
}

export function getLastSnapshot(): HealthSnapshot | null {
  return lastSnapshot;
}

export function startMonitor(intervalMs = 60_000): NodeJS.Timeout {
  log.info('Monitor started');
  const timer = setInterval(() => {
    const snap = getHealthSnapshot();
    if (snap.memoryMb > 400) {
      log.warn(`High memory usage: ${snap.memoryMb}MB`);
    }
    if (!snap.dbOk) {
      log.error('Database health check failed!');
    }
  }, intervalMs);

  timer.unref(); // Don't keep process alive
  return timer;
}

export function formatHealthReport(snap: HealthSnapshot): string {
  const upStr = formatUptime(snap.uptime);
  return [
    `🟢 *NEXUM Health Report*`,
    ``,
    `⏱ Uptime: ${upStr}`,
    `💾 Memory: ${snap.memoryMb}MB (heap: ${snap.heapUsedMb}MB)`,
    `🗄 Database: ${snap.dbOk ? '✅ OK' : '❌ ERROR'}`,
    `👥 Active users (24h): ${snap.activeUsers24h}`,
    `💬 Total messages: ${snap.totalMessages}`,
    `⚠️ Errors since start: ${snap.errorCount}`,
    `📅 Checked: ${snap.timestamp.replace('T', ' ').slice(0, 19)}`,
  ].join('\n');
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
