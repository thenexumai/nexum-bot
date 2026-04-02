import crypto from 'crypto';
import db from './db';

/**
 * PC AGENT ПЕРСОНАЛИЗАЦИЯ
 * 
 * Каждый пользователь Pro плана может подключить свой PC Agent.
 * Генерируется уникальный токен для каждого пользователя.
 */

export interface PcAgentToken {
    uid: number;
    token: string;
    created_at: string;
    expires_at: string | null;
    is_active: boolean;
    pc_name?: string;
    pc_os?: string;
    last_seen?: string;
}

/**
 * Генерирует персонализированный токен для PC Agent пользователя
 * Токен формата: nexum_<uid>_<random32chars>
 */
export function generatePcAgentToken(uid: number, expiresInDays?: number): string {
    // Формат токена: nexum_<uid>_<timestamp>_<random>
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    const token = `nexum_${uid}_${timestamp}_${random}`;
    
    const createdAt = new Date().toISOString();
    const expiresAt = expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null; // null = бессрочный для Pro пользователей
    
    // Деактивируем старые токены пользователя
    db.prepare(`
        UPDATE pc_agent_tokens 
        SET is_active = 0 
        WHERE uid = ? AND is_active = 1
    `).run(uid);
    
    // Сохраняем новый токен
    db.prepare(`
        INSERT INTO pc_agent_tokens (uid, token, created_at, expires_at, is_active)
        VALUES (?, ?, ?, ?, 1)
    `).run(uid, token, createdAt, expiresAt);
    
    return token;
}

/**
 * Проверяет валидность токена и возвращает UID владельца
 */
export function validatePcAgentToken(token: string): number | null {
    try {
        const row = db.prepare(`
            SELECT uid, expires_at, is_active 
            FROM pc_agent_tokens 
            WHERE token = ?
        `).get(token) as any;
        
        if (!row || !row.is_active) return null;
        
        // Проверяем срок действия
        if (row.expires_at) {
            const expiresAt = new Date(row.expires_at);
            if (expiresAt < new Date()) {
                // Токен истек
                db.prepare('UPDATE pc_agent_tokens SET is_active = 0 WHERE token = ?').run(token);
                return null;
            }
        }
        
        // Обновляем last_seen
        db.prepare(`
            UPDATE pc_agent_tokens 
            SET last_seen = ? 
            WHERE token = ?
        `).run(new Date().toISOString(), token);
        
        return row.uid;
    } catch {
        return null;
    }
}

/**
 * Получает активный токен пользователя
 */
export function getUserPcAgentToken(uid: number): PcAgentToken | null {
    try {
        const row = db.prepare(`
            SELECT * FROM pc_agent_tokens 
            WHERE uid = ? AND is_active = 1
            ORDER BY created_at DESC
            LIMIT 1
        `).get(uid) as any;
        
        return row || null;
    } catch {
        return null;
    }
}

/**
 * Обновляет информацию о PC
 */
export function updatePcAgentInfo(token: string, pcName: string, pcOs: string): void {
    db.prepare(`
        UPDATE pc_agent_tokens 
        SET pc_name = ?, pc_os = ?, last_seen = ?
        WHERE token = ?
    `).run(pcName, pcOs, new Date().toISOString(), token);
}

/**
 * Отзывает токен (деактивирует)
 */
export function revokePcAgentToken(uid: number): void {
    db.prepare(`
        UPDATE pc_agent_tokens 
        SET is_active = 0 
        WHERE uid = ?
    `).run(uid);
}

/**
 * Получает список всех активных PC Agent соединений
 */
export function getActivePcAgents(): PcAgentToken[] {
    try {
        return db.prepare(`
            SELECT * FROM pc_agent_tokens 
            WHERE is_active = 1
            ORDER BY last_seen DESC
        `).all() as PcAgentToken[];
    } catch {
        return [];
    }
}

/**
 * Проверяет имеет ли пользователь доступ к PC Agent (Pro подписка)
 */
export function canUsePcAgent(uid: number): boolean {
    try {
        const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
        return user?.subscription_plan === 'pro';
    } catch {
        return false;
    }
}

/**
 * Инициализация таблицы PC Agent токенов
 */
export function initPcAgentTokensTable(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS pc_agent_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            is_active INTEGER DEFAULT 1,
            pc_name TEXT,
            pc_os TEXT,
            last_seen TEXT,
            FOREIGN KEY (uid) REFERENCES users(uid)
        );
        
        CREATE INDEX IF NOT EXISTS idx_pc_agent_tokens_uid ON pc_agent_tokens(uid);
        CREATE INDEX IF NOT EXISTS idx_pc_agent_tokens_token ON pc_agent_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_pc_agent_tokens_active ON pc_agent_tokens(is_active);
    `);
}
