import Database, { Database as DatabaseType } from 'better-sqlite3';
import { Logger } from '../infra/logger';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'nexum.db');

// FIX TS4023: explicit type annotation so TS doesn't need to name BetterSqlite3.Database
const db: DatabaseType = new Database(dbPath);

// WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const initDB = () => {
    Logger.info('db', `Opening database: ${dbPath}`);

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            uid                   INTEGER PRIMARY KEY,
            username              TEXT,
            first_name            TEXT,
            subscription_plan     TEXT    DEFAULT 'free',
            subscription_expires_at DATETIME,
            lang                  TEXT    DEFAULT 'ru',
            msg_count_today       INTEGER DEFAULT 0,
            msg_date              TEXT    DEFAULT '',
            byok_keys             TEXT    DEFAULT '{}',
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS finance (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER NOT NULL,
            type       TEXT NOT NULL CHECK(type IN ('income','expense')),
            amount     REAL NOT NULL,
            currency   TEXT DEFAULT 'USD',
            category   TEXT DEFAULT 'other',
            note       TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            uid         INTEGER NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            status      TEXT DEFAULT 'todo',
            priority    TEXT DEFAULT 'medium',
            due_date    DATETIME,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER NOT NULL,
            title      TEXT,
            content    TEXT,
            tags       TEXT,
            pinned     INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS calendar (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER NOT NULL,
            title      TEXT NOT NULL,
            start      DATETIME NOT NULL,
            end        DATETIME,
            all_day    INTEGER DEFAULT 0,
            color      TEXT DEFAULT '#6c63ff',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER NOT NULL,
            name       TEXT NOT NULL,
            phone      TEXT,
            email      TEXT,
            company    TEXT,
            notes      TEXT,
            avatar     TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS habits (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            uid          INTEGER NOT NULL,
            name         TEXT NOT NULL,
            icon         TEXT DEFAULT '✅',
            frequency    TEXT DEFAULT 'daily',
            streak       INTEGER DEFAULT 0,
            best_streak  INTEGER DEFAULT 0,
            last_done    TEXT DEFAULT '',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS habit_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id   INTEGER NOT NULL,
            uid        INTEGER NOT NULL,
            done_date  TEXT NOT NULL,
            UNIQUE(habit_id, done_date)
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id    INTEGER NOT NULL,
            uid        INTEGER,
            text       TEXT NOT NULL,
            fire_at    DATETIME NOT NULL,
            done       INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS memory (
            uid        INTEGER NOT NULL,
            key        TEXT NOT NULL,
            value      TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (uid, key),
            FOREIGN KEY (uid) REFERENCES users(uid)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            uid        INTEGER PRIMARY KEY,
            messages   TEXT NOT NULL DEFAULT '[]',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS byok_keys (
            uid        INTEGER NOT NULL,
            provider   TEXT NOT NULL,
            key        TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (uid, provider)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER,
            action     TEXT NOT NULL,
            details    TEXT,
            timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
        );

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
        );

        CREATE TABLE IF NOT EXISTS pc_links (
            uid        INTEGER PRIMARY KEY,
            code       TEXT NOT NULL,
            connected  INTEGER DEFAULT 0,
            agent_info TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            uid        INTEGER NOT NULL,
            title      TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time   DATETIME,
            all_day    INTEGER DEFAULT 0,
            notes      TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );
    `);

    Logger.success('db', 'Database initialized ✅');
};

// ============================================================
//  USER HELPERS
// ============================================================

export const getOrCreateUser = (
    uid: number,
    username?: string,
    firstName?: string
): any => {
    let user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;
    if (!user) {
        db.prepare(`
            INSERT OR IGNORE INTO users (uid, username, first_name, msg_count_today, msg_date)
            VALUES (?, ?, ?, 0, '')
        `).run(uid, username || '', firstName || '');
        user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;
    }
    return user;
};

// Alias used by handler.ts
export const ensureUserDb = (uid: number, username?: string, firstName?: string): void => {
    getOrCreateUser(uid, username, firstName);
};

export const incrementMsgCount = (uid: number): number => {
    const today = new Date().toISOString().slice(0, 10);
    const user = db.prepare('SELECT msg_count_today, msg_date FROM users WHERE uid = ?').get(uid) as any;

    if (!user) return 0;

    if (user.msg_date !== today) {
        db.prepare('UPDATE users SET msg_count_today = 1, msg_date = ? WHERE uid = ?').run(today, uid);
        return 1;
    }

    db.prepare('UPDATE users SET msg_count_today = msg_count_today + 1 WHERE uid = ?').run(uid);
    return (user.msg_count_today || 0) + 1;
};

export default db;
