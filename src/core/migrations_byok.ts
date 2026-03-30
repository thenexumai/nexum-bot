import Database from 'better-sqlite3';

// Run this migration to add BYOK and session tables
export function migrateByokTables(db: Database.Database) {
    db.exec(`
        -- BYOK: user's own API keys (Pro feature)
        CREATE TABLE IF NOT EXISTS byok_keys (
            uid         INTEGER NOT NULL,
            provider    TEXT    NOT NULL,
            key         TEXT    NOT NULL,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (uid, provider)
        );

        -- User conversation sessions / pending states
        CREATE TABLE IF NOT EXISTS user_sessions (
            uid         INTEGER PRIMARY KEY,
            state       TEXT,
            data        TEXT,
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);
}
