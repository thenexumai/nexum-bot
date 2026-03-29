import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import logger from '../infra/logger';

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid               INTEGER PRIMARY KEY,
      username          TEXT,
      first_name        TEXT,
      subscription_plan TEXT NOT NULL DEFAULT 'free',
      subscription_expires_at TEXT,
      lang              TEXT NOT NULL DEFAULT 'ru',
      byok_keys         TEXT DEFAULT '{}',
      msg_count_today   INTEGER DEFAULT 0,
      msg_date          TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finance (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        INTEGER NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount     REAL NOT NULL,
      currency   TEXT DEFAULT 'UZS',
      category   TEXT DEFAULT 'other',
      note       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uid         INTEGER NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      priority    TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      due_date    TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        INTEGER NOT NULL,
      title      TEXT,
      content    TEXT NOT NULL,
      tags       TEXT DEFAULT '[]',
      pinned     INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        INTEGER NOT NULL,
      title      TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT,
      all_day    INTEGER DEFAULT 0,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        INTEGER NOT NULL,
      name       TEXT NOT NULL,
      phone      TEXT,
      email      TEXT,
      company    TEXT,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS habits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uid         INTEGER NOT NULL,
      name        TEXT NOT NULL,
      frequency   TEXT DEFAULT 'daily',
      streak      INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      last_check  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id    INTEGER NOT NULL,
      text       TEXT NOT NULL,
      fire_at    TEXT NOT NULL,
      done       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory (
      uid        INTEGER NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (uid, key)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      uid        INTEGER PRIMARY KEY,
      messages   TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      uid       INTEGER,
      action    TEXT NOT NULL,
      details   TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evolution_fixes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      error_hash  TEXT UNIQUE,
      error_msg   TEXT,
      file_path   TEXT,
      line_num    INTEGER,
      diff_patch  TEXT,
      explanation TEXT,
      status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at  TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pc_links (
      uid       INTEGER PRIMARY KEY,
      code      TEXT UNIQUE,
      connected INTEGER DEFAULT 0,
      agent_info TEXT,
      linked_at TEXT DEFAULT (datetime('now'))
    );
  `);

  logger.success('db', `Database initialised at ${config.dbPath}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getOrCreateUser(uid: number, username?: string, firstName?: string) {
  const existing = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
  if (existing) return existing as Record<string, unknown>;
  db.prepare(
    'INSERT INTO users (uid, username, first_name) VALUES (?, ?, ?)'
  ).run(uid, username ?? null, firstName ?? null);
  return db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as Record<string, unknown>;
}

export function incrementMsgCount(uid: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const user = db.prepare('SELECT msg_count_today, msg_date FROM users WHERE uid = ?').get(uid) as
    { msg_count_today: number; msg_date: string } | undefined;
  if (!user) return 0;
  if (user.msg_date !== today) {
    db.prepare('UPDATE users SET msg_count_today = 1, msg_date = ? WHERE uid = ?').run(today, uid);
    return 1;
  }
  const newCount = user.msg_count_today + 1;
  db.prepare('UPDATE users SET msg_count_today = ? WHERE uid = ?').run(newCount, uid);
  return newCount;
}

export default db;
