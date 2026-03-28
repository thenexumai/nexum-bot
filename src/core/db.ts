/**
 * NEXUM Database
 * better-sqlite3 — fully synchronous, no data races.
 * All migrations are idempotent (CREATE TABLE IF NOT EXISTS + ALTER IF NOT EXISTS).
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { createLogger } from '../infra/logger';

const log = createLogger('db');

const dbPath = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB page cache

log.info(`Opened database at ${dbPath}`);

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid        INTEGER PRIMARY KEY,
    username   TEXT,
    first_name TEXT,
    lang       TEXT DEFAULT 'auto',
    tariff     TEXT DEFAULT 'free',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conv_uid_created ON conversations(uid, created_at);

  CREATE TABLE IF NOT EXISTS memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(uid, key)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    title      TEXT DEFAULT '',
    content    TEXT NOT NULL,
    pinned     INTEGER DEFAULT 0,
    tags       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uid         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    project     TEXT DEFAULT 'General',
    priority    TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    status      TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
    due_date    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uid         INTEGER NOT NULL,
    name        TEXT NOT NULL,
    emoji       TEXT DEFAULT '●',
    frequency   TEXT DEFAULT 'daily',
    streak      INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_done   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    uid      INTEGER NOT NULL,
    done_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'UZS',
    balance    REAL DEFAULT 0,
    icon       TEXT DEFAULT '💰',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS finance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    type       TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
    amount     REAL NOT NULL CHECK(amount > 0),
    category   TEXT DEFAULT 'other',
    note       TEXT DEFAULT '',
    account_id INTEGER,
    currency   TEXT DEFAULT 'UZS',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_finance_uid ON finance(uid, created_at);

  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    text       TEXT NOT NULL,
    fire_at    TEXT NOT NULL,
    repeat     TEXT DEFAULT 'none',
    done       INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uid         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    start_at    TEXT NOT NULL,
    end_at      TEXT,
    all_day     INTEGER DEFAULT 0,
    color       TEXT DEFAULT '#6366f1',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    name       TEXT NOT NULL,
    phone      TEXT DEFAULT '',
    email      TEXT DEFAULT '',
    company    TEXT DEFAULT '',
    notes      TEXT DEFAULT '',
    avatar     TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pc_agents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uid         INTEGER NOT NULL UNIQUE,
    device_id   TEXT,
    device_name TEXT,
    platform    TEXT,
    last_seen   TEXT,
    status      TEXT DEFAULT 'offline',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS link_codes (
    code       TEXT PRIMARY KEY,
    uid        INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used       INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_api_keys (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    provider   TEXT NOT NULL,
    api_key    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(uid, provider)
  );

  CREATE TABLE IF NOT EXISTS subagent_runs (
    id          TEXT PRIMARY KEY,
    uid         INTEGER NOT NULL,
    task        TEXT NOT NULL,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','done','error')),
    result      TEXT,
    error       TEXT,
    started_at  TEXT DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tool_results (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    tool_name  TEXT NOT NULL,
    input      TEXT,
    output     TEXT,
    success    INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tool_results_uid ON tool_results(uid, created_at);
`);

// ── User helpers ──────────────────────────────────────────────────────────────

export function ensureUser(uid: number, username?: string, firstName?: string): void {
  db.prepare(`
    INSERT INTO users (uid, username, first_name, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(uid) DO UPDATE SET
      username   = COALESCE(excluded.username, username),
      first_name = COALESCE(excluded.first_name, first_name),
      updated_at = excluded.updated_at
  `).run(uid, username ?? null, firstName ?? null);
}

export function getUser(uid: number): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM users WHERE uid=?').get(uid) as Record<string, unknown> | undefined;
}

// ── BYOK helpers ──────────────────────────────────────────────────────────────

export function getUserApiKey(uid: number, provider: string): string | null {
  const row = db.prepare('SELECT api_key FROM user_api_keys WHERE uid=? AND provider=?')
    .get(uid, provider) as { api_key: string } | undefined;
  return row?.api_key ?? null;
}

export function setUserApiKey(uid: number, provider: string, key: string): void {
  db.prepare(`INSERT OR REPLACE INTO user_api_keys (uid, provider, api_key) VALUES (?, ?, ?)`)
    .run(uid, provider, key);
}

export function deleteUserApiKey(uid: number, provider: string): void {
  db.prepare('DELETE FROM user_api_keys WHERE uid=? AND provider=?').run(uid, provider);
}

export function listUserApiKeys(uid: number): { provider: string; created_at: string }[] {
  return db.prepare('SELECT provider, created_at FROM user_api_keys WHERE uid=? ORDER BY provider')
    .all(uid) as { provider: string; created_at: string }[];
}
