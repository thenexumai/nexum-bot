import dotenv from 'dotenv';
dotenv.config();

export type AiProvider = 'cerebras' | 'groq' | 'deepseek' | 'gemini' | 'together' | 'openrouter' | 'sambanova' | 'grok' | 'claude';

// ============================================================
//  NEXUM CONFIG — matches ACTUAL Railway env variable names
//  (CB1-CB6, GR1-GR7, G1-G7, DS1-DS6, etc.)
// ============================================================
export const CONFIG = {
    TELEGRAM_TOKEN: process.env.BOT_TOKEN || '',
    PUBLIC_BOT_TOKEN: process.env.PUBLIC_BOT || '',
    ADMIN_IDS: (process.env.ADMIN_IDS || '387182659').split(',').map(Number),
    PORT: parseInt(process.env.NODE_PORT || process.env.PORT || '3000'),
    DATABASE_PATH: process.env.DB_PATH || './data/nexum.db',
    WEBAPP_URL: process.env.WEBAPP_URL || '',
    SERPER_KEYS: [
        process.env.SERPER_KEY,
        process.env.SERPER_KEY2,
        process.env.SERPER_KEY3,
    ].filter(Boolean) as string[],

    // AI Provider keys — matches Railway variable names exactly
    PROVIDERS: {
        cerebras:   keysFrom('CB', 6),
        groq:       keysFrom('GR', 7),
        deepseek:   keysFrom('DS', 6),
        gemini:     keysFrom('G', 7),
        together:   keysFrom('TO', 7),
        openrouter: keysFrom('OR', 7),
        sambanova:  keysFrom('SN', 5),
        grok:       keysFrom('GK', 2),
        claude:     keysFrom('CL', 1),
    } as Record<AiProvider, string[]>,
};

function keysFrom(prefix: string, count: number): string[] {
    const keys: string[] = [];
    for (let i = 1; i <= count; i++) {
        const val = process.env[`${prefix}${i}`];
        if (val) keys.push(val);
    }
    return keys;
}

export const isAdmin = (uid: number) => CONFIG.ADMIN_IDS.includes(uid);

/** Round-robin key selection */
export const getProviderKey = (provider: AiProvider, uid?: number): string => {
    // Pro users: check their own BYOK key first
    if (uid) {
        const byok = getUserByokKey(uid, provider);
        if (byok) return byok;
    }
    const keys = CONFIG.PROVIDERS[provider];
    if (!keys.length) return '';
    return keys[Math.floor(Date.now() / 1000) % keys.length];
};

export const getSerperKey = (): string => {
    const keys = CONFIG.SERPER_KEYS;
    if (!keys.length) return '';
    return keys[Math.floor(Date.now() / 1000) % keys.length];
};

// ============================================================
//  MODEL FALLBACK CHAIN (Free tier — only free APIs)
//  Order matters: fastest/cheapest first, Claude last
// ============================================================
export interface ModelConfig {
    provider: AiProvider;
    model: string;
    maxTokens: number;
    supportsTools: boolean;
    format: 'openai' | 'anthropic' | 'google';
    baseUrl: string;
    isFree: boolean; // free-tier friendly
}

export const FREE_MODEL_CHAIN: ModelConfig[] = [
    {
        provider: 'cerebras',
        model: 'llama-3.3-70b',
        maxTokens: 8000,
        supportsTools: true,
        format: 'openai',
        baseUrl: 'https://api.cerebras.ai/v1',
        isFree: true,
    },
    {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 8000,
        supportsTools: true,
        format: 'openai',
        baseUrl: 'https://api.groq.com/openai/v1',
        isFree: true,
    },
    {
        provider: 'deepseek',
        model: 'deepseek-chat',
        maxTokens: 4000,
        supportsTools: true,
        format: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        isFree: true,
    },
    {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        maxTokens: 8000,
        supportsTools: true,
        format: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        isFree: true,
    },
    {
        provider: 'together',
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        maxTokens: 4000,
        supportsTools: false,
        format: 'openai',
        baseUrl: 'https://api.together.xyz/v1',
        isFree: true,
    },
    {
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash-001',
        maxTokens: 4000,
        supportsTools: true,
        format: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1',
        isFree: true,
    },
    {
        provider: 'sambanova',
        model: 'Meta-Llama-3.3-70B-Instruct',
        maxTokens: 4000,
        supportsTools: false,
        format: 'openai',
        baseUrl: 'https://fast-api.snova.ai/v1',
        isFree: true,
    },
    // Claude — only if user has their own key (Pro BYOK)
    {
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 8000,
        supportsTools: true,
        format: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        isFree: false, // requires Pro BYOK or system key
    },
];

/** Get available models for a user (respects BYOK + free tier) */
export const getModelChain = (uid: number, isPro: boolean): ModelConfig[] => {
    return FREE_MODEL_CHAIN.filter(m => {
        if (m.isFree) return CONFIG.PROVIDERS[m.provider].length > 0;
        // Non-free models require pro + their own key
        return isPro && !!getUserByokKey(uid, m.provider);
    });
};

// ============================================================
//  BYOK (Bring Your Own Key) — stored in SQLite per user
//  Pro users can add keys for ANY provider
// ============================================================
let _db: any = null;
const setDb = (db: any) => { _db = db; };
export { setDb as initByokDb };

export const getUserByokKey = (uid: number, provider: AiProvider): string => {
    if (!_db) return '';
    try {
        const row = _db.prepare('SELECT key FROM byok_keys WHERE uid = ? AND provider = ?').get(uid, provider) as any;
        return row?.key || '';
    } catch { return ''; }
};

export const setUserByokKey = (uid: number, provider: AiProvider, key: string): void => {
    if (!_db) return;
    _db.prepare(`
        INSERT INTO byok_keys (uid, provider, key, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uid, provider) DO UPDATE SET key = excluded.key
    `).run(uid, provider, key, Date.now());
};

export const deleteUserByokKey = (uid: number, provider: AiProvider): void => {
    if (!_db) return;
    _db.prepare('DELETE FROM byok_keys WHERE uid = ? AND provider = ?').run(uid, provider);
};

export const listUserByokKeys = (uid: number): { provider: string; hasKey: boolean }[] => {
    if (!_db) return [];
    const rows = _db.prepare('SELECT provider FROM byok_keys WHERE uid = ?').all(uid) as any[];
    const withKeys = new Set(rows.map((r: any) => r.provider));
    return (Object.keys(CONFIG.PROVIDERS) as AiProvider[]).map(p => ({
        provider: p,
        hasKey: withKeys.has(p),
    }));
};
