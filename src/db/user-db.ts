// User Database — сохранение юзеров, подписок, API ключей

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "nexum.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    telegram_id INTEGER UNIQUE,
    username TEXT,
    plan TEXT DEFAULT 'free',
    api_keys TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    plan TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pairing_codes (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE,
    user_id INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

export const createUser = (telegramId: number, username: string) => {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username) VALUES (?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(telegramId, username);
};

export const getUser = (telegramId: number) => {
  const stmt = db.prepare("SELECT * FROM users WHERE telegram_id = ?");
  return stmt.get(telegramId);
};

export const updatePlan = (telegramId: number, plan: string) => {
  const stmt = db.prepare("UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?");
  return stmt.run(plan, telegramId);
};

export const generatePairingCode = (telegramId: number): string => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 мин
  
  const stmt = db.prepare("INSERT INTO pairing_codes (code, user_id, expires_at) VALUES (?, ?, ?)");
  stmt.run(code, telegramId, expiresAt.toISOString());
  
  return code;
};

export const verifyPairingCode = (code: string): number | null => {
  const stmt = db.prepare(`
    SELECT user_id FROM pairing_codes 
    WHERE code = ? AND expires_at > CURRENT_TIMESTAMP
  `);
  const result = stmt.get(code) as any;
  return result?.user_id || null;
};

export default db;
