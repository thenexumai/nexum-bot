import sqlite3 = require('sqlite3');
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'nexum.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new sqlite3.Database(DB_PATH);

// Enable pragmas
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');
});

// ── Core schema ──────────────────────────────────────────────────────────────
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
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conv_uid ON conversations(uid);

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uid         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    project     TEXT DEFAULT 'General',
    priority    TEXT DEFAULT 'medium',
    status      TEXT DEFAULT 'todo',
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
    habit_id INTEGER NOT NULL,
    uid      INTEGER NOT NULL,
    done_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    name       TEXT NOT NULL,
    currency   TEXT DEFAULT 'UZS',
    balance    REAL DEFAULT 0,
    icon       TEXT DEFAULT '$',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS finance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    type       TEXT NOT NULL,
    amount     REAL NOT NULL,
    category   TEXT DEFAULT 'other',
    note       TEXT DEFAULT '',
    account_id INTEGER,
    currency   TEXT DEFAULT 'UZS',
    created_at TEXT DEFAULT (datetime('now'))
  );

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

  CREATE TABLE IF NOT EXISTS websites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    name       TEXT NOT NULL,
    html       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_tools (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    uid             INTEGER NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    trigger_pattern TEXT NOT NULL,
    code            TEXT NOT NULL,
    active          INTEGER DEFAULT 1,
    usage_count     INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
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
    device_id  TEXT,
    platform   TEXT,
    expires_at TEXT NOT NULL,
    used       INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS vector_memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid        INTEGER NOT NULL,
    content    TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    embedding  TEXT,
    norm       REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vm_uid ON vector_memories(uid);

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
    status      TEXT DEFAULT 'pending',
    result      TEXT,
    error       TEXT,
    tool_calls  TEXT DEFAULT '[]',
    started_at  TEXT DEFAULT (datetime('now')),
    finished_at TEXT
  );
`);

// ── Safe migrations ───────────────────────────────────────────────────────────
const migrations = [
  `ALTER TABLE pc_agents ADD COLUMN device_id TEXT`,
  `ALTER TABLE finance   ADD COLUMN account_id INTEGER`,
  `ALTER TABLE finance   ADD COLUMN currency TEXT DEFAULT 'UZS'`,
  `ALTER TABLE tasks     ADD COLUMN description TEXT DEFAULT ''`,
  `ALTER TABLE reminders ADD COLUMN repeat TEXT DEFAULT 'none'`,
  `ALTER TABLE users     ADD COLUMN lang TEXT DEFAULT 'auto'`,
  `ALTER TABLE users     ADD COLUMN tariff TEXT DEFAULT 'free'`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch { /* already exists */ }
}

// ── Statement wrapper (better-sqlite3 compatible sync API) ───────────────────

export interface RunResult {
  lastInsertRowid: number | string;
  changes: number;
}

export class Statement {
  private sql: string;
  
  constructor(sql: string) {
    this.sql = sql;
  }
  
  run(...params: any[]): RunResult {
    let result: RunResult | null = null;
    let error: Error | null = null;
    db.run(this.sql, params, function(err) {
      if (err) error = err;
      else result = { lastInsertRowid: this.lastID, changes: this.changes };
    });
    if (error) throw error!;
    return result!;
  }
  
  get(...params: any[]): any {
    let row: any = null;
    db.get(this.sql, params, (err, r) => { if (!err) row = r; });
    return row;
  }
  
  all(...params: any[]): any[] {
    let rows: any[] = [];
    db.all(this.sql, params, (err, r) => { if (!err) rows = r || []; });
    return rows;
  }
}

// Add prepare to Database interface
declare module 'sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
  }
}

// Extend db with prepare method
(db as any).prepare = function(sql: string): Statement {
  return new Statement(sql);
};

// ── Helper functions ─────────────────────────────────────────────────────────

export function ensureUser(uid: number, username?: string, firstName?: string) {
  db.prepare(`INSERT OR REPLACE INTO users (uid, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now'))`).run(uid, username || null, firstName || null);
}

export function getUserApiKey(uid: number, provider: string): string | null {
  const row: any = db.prepare('SELECT api_key FROM user_api_keys WHERE uid=? AND provider=?').get(uid, provider);
  return row?.api_key || null;
}

export function setUserApiKey(uid: number, provider: string, key: string) {
  db.prepare(`INSERT OR REPLACE INTO user_api_keys (uid, provider, api_key) VALUES (?,?,?)`).run(uid, provider, key);
}
