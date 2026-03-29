/**
 * NEXUM DB Migration: Evolution Tables
 * Run this to add evolution_errors and evolution_fixes tables.
 * Called automatically from db.ts initDb().
 */

import type { Database } from 'better-sqlite3';

export function migrateEvolutionTables(db: Database): void {
  // Evolution errors table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS evolution_errors (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      message     TEXT NOT NULL,
      stack       TEXT,
      context     TEXT,
      occurrences INTEGER DEFAULT 1,
      first_seen  TEXT DEFAULT (datetime('now')),
      last_seen   TEXT DEFAULT (datetime('now')),
      resolved    INTEGER DEFAULT 0
    )
  `).run();

  // Evolution fixes table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS evolution_fixes (
      id            TEXT PRIMARY KEY,
      error_id      TEXT NOT NULL,
      analysis      TEXT NOT NULL,
      suggested_fix TEXT NOT NULL,
      file_path     TEXT,
      line_numbers  TEXT,
      status        TEXT DEFAULT 'pending',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Sessions table (for session persistence)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      uid         INTEGER PRIMARY KEY,
      messages    TEXT NOT NULL DEFAULT '[]',
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `).run();
}
