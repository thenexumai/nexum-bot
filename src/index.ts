import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Bot } from 'grammy';
import { CONFIG } from './core/config';
import { Logger } from './infra/logger';
import db, { initDB } from './core/db';
import { initByokDb } from './core/config';
import { setupBot } from './telegram/handler';
import { migrateEvolutionTables } from './core/migrations';
import { startMonitor } from './infra/monitor';
import { startReminderCron } from './tools/reminders';
import { SkillManager } from './core/skills/skill_manager';
import { UserModel } from './core/user_model/user_model';
import { LongTermMemory } from './core/evolution_memory/long_term_memory';

// ============================================================
//  BOT INSTANCE
// ============================================================
export const bot = new Bot(CONFIG.TELEGRAM_TOKEN);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ============================================================
//  PC AGENT STATE
// ============================================================
export const agentConnections = new Map<number, WebSocket>();
export const pendingRequests = new Map<string, (result: any) => void>();
const linkTokens = new Map<string, number>();

export const createLinkToken = (uid: number): string => {
    const token = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15);
    linkTokens.set(token, uid);
    setTimeout(() => linkTokens.delete(token), 10 * 60 * 1000);
    return token;
};

// ============================================================
//  REST API
// ============================================================
function setupApiRoutes() {
    app.use(express.json({ limit: '20mb' }));
    app.use(express.static(path.join(__dirname, '../src/public')));

    // Health
    app.get('/health', (_req, res) => res.json({
        ok: true, uptime: process.uptime(), version: '1.0.0',
        agents: agentConnections.size,
    }));

    // ── Tasks ──────────────────────────────────────────────────
    app.get('/api/tasks', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const rows = db.prepare('SELECT * FROM tasks WHERE uid = ? ORDER BY priority DESC, created_at DESC').all(uid);
        res.json(rows);
    });
    app.post('/api/tasks', (req, res) => {
        const { uid, title, description, priority, due_date } = req.body;
        if (!uid || !title) return res.status(400).json({ error: 'uid and title required' });
        const r = db.prepare('INSERT INTO tasks (uid, title, description, priority, due_date) VALUES (?,?,?,?,?)')
            .run(uid, title, description ?? null, priority ?? 'medium', due_date ?? null);
        res.json({ id: r.lastInsertRowid });
    });
    app.patch('/api/tasks/:id', (req, res) => {
        const { status, title, priority } = req.body;
        if (status) db.prepare('UPDATE tasks SET status=?, updated_at=datetime("now") WHERE id=?').run(status, req.params.id);
        if (title)  db.prepare('UPDATE tasks SET title=? WHERE id=?').run(title, req.params.id);
        if (priority) db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(priority, req.params.id);
        res.json({ ok: true });
    });
    app.delete('/api/tasks/:id', (req, res) => {
        db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Finance ────────────────────────────────────────────────
    app.get('/api/finance', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const rows = db.prepare('SELECT * FROM finance WHERE uid=? ORDER BY created_at DESC LIMIT 200').all(uid);
        res.json(rows);
    });
    app.post('/api/finance', (req, res) => {
        const { uid, type, amount, currency, category, note } = req.body;
        if (!uid || !type || !amount) return res.status(400).json({ error: 'uid, type, amount required' });
        const r = db.prepare('INSERT INTO finance (uid, type, amount, currency, category, note) VALUES (?,?,?,?,?,?)')
            .run(uid, type, amount, currency ?? 'USD', category ?? 'other', note ?? null);
        res.json({ id: r.lastInsertRowid });
    });
    app.delete('/api/finance/:id', (req, res) => {
        db.prepare('DELETE FROM finance WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Notes ──────────────────────────────────────────────────
    app.get('/api/notes', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const rows = db.prepare('SELECT * FROM notes WHERE uid=? ORDER BY pinned DESC, created_at DESC').all(uid);
        res.json(rows);
    });
    app.post('/api/notes', (req, res) => {
        const { uid, title, content, tags, pinned } = req.body;
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const r = db.prepare('INSERT INTO notes (uid, title, content, tags, pinned) VALUES (?,?,?,?,?)')
            .run(uid, title ?? 'Untitled', content ?? '', tags ?? '', pinned ? 1 : 0);
        res.json({ id: r.lastInsertRowid });
    });
    app.patch('/api/notes/:id', (req, res) => {
        const { title, content, tags, pinned } = req.body;
        db.prepare('UPDATE notes SET title=?, content=?, tags=?, pinned=? WHERE id=?')
            .run(title, content, tags, pinned ? 1 : 0, req.params.id);
        res.json({ ok: true });
    });
    app.delete('/api/notes/:id', (req, res) => {
        db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Calendar ───────────────────────────────────────────────
    app.get('/api/calendar', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const rows = db.prepare('SELECT * FROM calendar WHERE uid=? ORDER BY start ASC').all(uid);
        res.json(rows);
    });
    app.post('/api/calendar', (req, res) => {
        const { uid, title, start, end, all_day, color } = req.body;
        if (!uid || !title || !start) return res.status(400).json({ error: 'uid, title, start required' });
        const r = db.prepare('INSERT INTO calendar (uid, title, start, end, all_day, color) VALUES (?,?,?,?,?,?)')
            .run(uid, title, start, end ?? null, all_day ? 1 : 0, color ?? '#6c63ff');
        res.json({ id: r.lastInsertRowid });
    });
    app.delete('/api/calendar/:id', (req, res) => {
        db.prepare('DELETE FROM calendar WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Contacts ───────────────────────────────────────────────
    app.get('/api/contacts', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const q = String(req.query.q || '');
        let rows;
        if (q) {
            rows = db.prepare("SELECT * FROM contacts WHERE uid=? AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name ASC")
                .all(uid, `%${q}%`, `%${q}%`, `%${q}%`);
        } else {
            rows = db.prepare('SELECT * FROM contacts WHERE uid=? ORDER BY name ASC').all(uid);
        }
        res.json(rows);
    });
    app.post('/api/contacts', (req, res) => {
        const { uid, name, phone, email, company, notes } = req.body;
        if (!uid || !name) return res.status(400).json({ error: 'uid and name required' });
        const r = db.prepare('INSERT INTO contacts (uid, name, phone, email, company, notes) VALUES (?,?,?,?,?,?)')
            .run(uid, name, phone ?? null, email ?? null, company ?? null, notes ?? null);
        res.json({ id: r.lastInsertRowid });
    });
    app.delete('/api/contacts/:id', (req, res) => {
        db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Habits ─────────────────────────────────────────────────
    app.get('/api/habits', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const today = new Date().toISOString().slice(0, 10);
        const habits = db.prepare('SELECT * FROM habits WHERE uid=? ORDER BY created_at ASC').all(uid) as any[];
        const logs   = db.prepare("SELECT habit_id FROM habit_logs WHERE uid=? AND done_date=?").all(uid, today) as any[];
        const doneToday = new Set(logs.map((l: any) => l.habit_id));
        res.json(habits.map(h => ({ ...h, done_today: doneToday.has(h.id) })));
    });
    app.post('/api/habits', (req, res) => {
        const { uid, name, icon, frequency } = req.body;
        if (!uid || !name) return res.status(400).json({ error: 'uid and name required' });
        const r = db.prepare('INSERT INTO habits (uid, name, icon, frequency) VALUES (?,?,?,?)')
            .run(uid, name, icon ?? '✅', frequency ?? 'daily');
        res.json({ id: r.lastInsertRowid });
    });
    app.post('/api/habits/:id/check', (req, res) => {
        const id  = Number(req.params.id);
        const uid = Number(req.body.uid);
        const today = new Date().toISOString().slice(0, 10);
        try {
            db.prepare('INSERT INTO habit_logs (habit_id, uid, done_date) VALUES (?,?,?)').run(id, uid, today);
            const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id) as any;
            const newStreak = (habit?.streak || 0) + 1;
            const bestStreak = Math.max(newStreak, habit?.best_streak || 0);
            db.prepare('UPDATE habits SET streak=?, best_streak=?, last_done=? WHERE id=?')
                .run(newStreak, bestStreak, today, id);
            res.json({ ok: true, streak: newStreak });
        } catch {
            db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND done_date=?').run(id, today);
            const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id) as any;
            const newStreak = Math.max(0, (habit?.streak || 1) - 1);
            db.prepare('UPDATE habits SET streak=? WHERE id=?').run(newStreak, id);
            res.json({ ok: true, streak: newStreak, undone: true });
        }
    });
    app.delete('/api/habits/:id', (req, res) => {
        db.prepare('DELETE FROM habits WHERE id=?').run(req.params.id);
        db.prepare('DELETE FROM habit_logs WHERE habit_id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Memory / Session ───────────────────────────────────────
    app.delete('/api/memory', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        db.prepare("DELETE FROM memory WHERE uid=? AND key != 'preferences'").run(uid);
        res.json({ ok: true });
    });
    app.delete('/api/sessions', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        db.prepare('DELETE FROM sessions WHERE uid=?').run(uid);
        res.json({ ok: true });
    });

    // ── User info ──────────────────────────────────────────────
    app.get('/api/me', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const user = db.prepare('SELECT uid, first_name, subscription_plan, msg_count_today, lang FROM users WHERE uid=?').get(uid) as any;
        if (!user) return res.status(404).json({ error: 'user not found' });
        res.json(user);
    });

    // ── AI Chat (non-streaming fallback) ────────────────────────
    app.post('/api/chat', async (req, res) => {
        try {
            const { uid, messages, mode } = req.body as {
                uid?: number;
                messages: { role: string; content: string }[];
                mode?: string;
            };

            if (!messages?.length) return res.status(400).json({ error: 'messages required' });

            const { executeAIOnce } = await import('./agent/executor');
            const lastMsg = messages.filter((m: any) => m.role === 'user').pop();
            if (!lastMsg) return res.status(400).json({ error: 'no user message' });

            const history = messages
                .filter((m: any) => !m.content.startsWith('[SYSTEM]:'))
                .slice(-18);

            const query = mode === 'search'
                ? `[deep_search] ${lastMsg.content}`
                : lastMsg.content;

            const result = await executeAIOnce(query, uid ? Number(uid) : undefined, history);
            res.json({ content: result.content, sources: result.sources || [], tool_used: result.tool_used || null });
        } catch (e: any) {
            Logger.error('api/chat', e?.message || e);
            res.status(500).json({ error: e?.message || 'Internal error' });
        }
    });

    // ── AI Chat STREAMING (SSE) ─────────────────────────────────
    app.post('/api/chat/stream', async (req, res) => {
        try {
            const { uid, messages, mode, search, images } = req.body as {
                uid?: number;
                messages: { role: string; content: string }[];
                mode?: string;
                search?: boolean;
                images?: string[];
            };

            if (!messages?.length) {
                res.status(400).json({ error: 'messages required' });
                return;
            }

            // SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const sendEvent = (data: object) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            const lastMsg = messages.filter((m: any) => m.role === 'user').pop();
            if (!lastMsg) {
                sendEvent({ error: 'no user message' });
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }

            const history = messages
                .filter((m: any) => !m.content?.startsWith?.('[SYSTEM]:'))
                .slice(-18)
                .map((m: any) => ({ role: m.role, content: m.content }));

            // Handle deep search mode (returns full result + sources)
            const useSearch = search || mode === 'search';
            if (useSearch) {
                sendEvent({ delta: '🔍 Выполняю поиск...\n\n' });
                try {
                    const { executeAIOnce } = await import('./agent/executor');
                    const query = `[deep_search] ${lastMsg.content}`;
                    const result = await executeAIOnce(query, uid ? Number(uid) : undefined, history);

                    // Stream the full result in chunks
                    const chunks = (result.content as string).match(/.{1,50}/gs) || [];
                    // Clear the "searching" message
                    sendEvent({ clear: true });
                    for (const chunk of chunks) {
                        sendEvent({ delta: chunk });
                        await new Promise(r => setTimeout(r, 8));
                    }
                    if (result.sources?.length) {
                        sendEvent({ sources: result.sources });
                    }
                } catch (e: any) {
                    sendEvent({ delta: `\n\n⚠️ Ошибка поиска: ${e.message}` });
                }
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }

            // Standard streaming via router
            const { chatStream } = await import('./agent/router');
            const { getSoulContext } = await import('./soul/index');
            const { getContext } = await import('./state/user-context');

            const userCtx = uid ? getContext(Number(uid)) : null;
            const soulCtx = uid ? await getSoulContext(Number(uid)) : 'You are NEXUM AI, a helpful assistant.';

            const streamMessages: any[] = [
                { role: 'system', content: soulCtx },
                ...history,
            ];

            // Add image to last user message if present
            if (images?.length) {
                const lastUserIdx = streamMessages.map(m => m.role).lastIndexOf('user');
                if (lastUserIdx !== -1) {
                    streamMessages[lastUserIdx] = {
                        role: 'user',
                        content: [
                            { type: 'text', text: lastMsg.content },
                            ...images.slice(0, 4).map(img => ({
                                type: 'image_url',
                                image_url: { url: img },
                            })),
                        ],
                    };
                }
            }

            const uidNum = uid ? Number(uid) : 0;
            let tokenCount = 0;

            for await (const chunk of chatStream(streamMessages, uidNum)) {
                if (res.destroyed) break;
                sendEvent({ delta: chunk });
                tokenCount += chunk.length;
            }

            res.write('data: [DONE]\n\n');
            res.end();

            Logger.debug('api/stream', `Streamed ~${tokenCount} chars to UID ${uid}`);

        } catch (e: any) {
            Logger.error('api/chat/stream', e?.message || e);
            if (!res.headersSent) {
                res.status(500).json({ error: e?.message || 'Internal error' });
            } else {
                try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); } catch {}
            }
        }
    });

    // ── BYOK Settings (pass-through) ───────────────────────────
    app.get('/api/settings', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const byok = db.prepare('SELECT provider, is_active FROM byok_keys WHERE uid=?').all(uid);
        const prefs = db.prepare("SELECT value FROM memory WHERE uid=? AND key='preferences'").get(uid) as any;
        res.json({ byok, preferences: prefs?.value ? JSON.parse(prefs.value) : {} });
    });
}

// ============================================================
//  WEBSOCKET: PC Agent Bridge
// ============================================================

    // ════════════════════════════════════════════════════════
    //  NEXUM ECOSYSTEM API — единый uid для бота, браузера, агента
    // ════════════════════════════════════════════════════════

    // Генерация токена экосистемы при /start (браузер/агент используют его для привязки)
    const ecosystemTokens = new Map<string, { uid: number; expires: number }>();

    app.post('/api/ecosystem/token', (req, res) => {
        const uid = Number(req.body.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const token = require('crypto').randomBytes(24).toString('hex');
        ecosystemTokens.set(token, { uid, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 дней
        db.prepare(`
            INSERT INTO users (uid) VALUES (?) ON CONFLICT(uid) DO NOTHING
        `).run(uid);
        // Сохраняем токен в БД для персистентности
        db.prepare(`
            CREATE TABLE IF NOT EXISTS ecosystem_tokens (
                token TEXT PRIMARY KEY, uid INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
        db.prepare(`INSERT OR REPLACE INTO ecosystem_tokens (token, uid) VALUES (?, ?)`).run(token, uid);
        res.json({ token, uid });
    });

    // Резолв токена → uid (используется браузером и агентом)
    app.get('/api/ecosystem/resolve', (req, res) => {
        const token = String(req.query.token || '');
        if (!token) return res.status(400).json({ error: 'token required' });
        try {
            const row = db.prepare(`SELECT uid FROM ecosystem_tokens WHERE token=?`).get(token) as any;
            if (!row) return res.status(404).json({ error: 'token not found' });
            return res.json({ uid: row.uid });
        } catch {
            const cached = ecosystemTokens.get(token);
            if (!cached || Date.now() > cached.expires) return res.status(404).json({ error: 'expired' });
            return res.json({ uid: cached.uid });
        }
    });

    // ── Skills API (браузер + агент) ──────────────────────────
    app.get('/api/skills', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const skills = SkillManager.listSkills(uid);
        res.json(skills);
    });

    app.delete('/api/skills/:id', (req, res) => {
        db.prepare('DELETE FROM skills WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── User Profile / Model API ──────────────────────────────
    app.get('/api/profile', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const profile = UserModel.getProfile(uid);
        if (!profile) return res.json({ uid, profile_completeness: 0, message: 'No profile yet' });
        res.json(profile);
    });

    // ── Long-Term Memory API ──────────────────────────────────
    app.get('/api/ltm', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const ltm = db.prepare('SELECT * FROM long_term_memory WHERE uid=?').get(uid) as any;
        const facts = db.prepare('SELECT * FROM persistent_facts WHERE uid=? ORDER BY importance DESC LIMIT 30').all(uid);
        const insights = db.prepare('SELECT * FROM user_insights WHERE uid=? ORDER BY created_at DESC LIMIT 10').all(uid);
        res.json({ ltm: ltm || {}, facts, insights });
    });

    app.delete('/api/ltm', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        db.prepare('DELETE FROM long_term_memory WHERE uid=?').run(uid);
        db.prepare('DELETE FROM persistent_facts WHERE uid=?').run(uid);
        db.prepare('DELETE FROM user_insights WHERE uid=?').run(uid);
        res.json({ ok: true });
    });

    // ── Reminders API (браузер + агент) ──────────────────────
    app.get('/api/reminders', (req, res) => {
        const uid = Number(req.query.uid);
        if (!uid) return res.status(400).json({ error: 'uid required' });
        const rows = db.prepare(
            `SELECT * FROM reminders WHERE uid=? AND done=0 AND fire_at > datetime('now') ORDER BY fire_at`
        ).all(uid);
        res.json(rows);
    });

    app.post('/api/reminders', (req, res) => {
        const { uid, text, fire_at } = req.body;
        if (!uid || !text || !fire_at) return res.status(400).json({ error: 'uid, text, fire_at required' });
        const r = db.prepare('INSERT INTO reminders (chat_id, uid, text, fire_at) VALUES (?,?,?,?)').run(uid, uid, text, fire_at);
        res.json({ id: r.lastInsertRowid });
    });

    app.delete('/api/reminders/:id', (req, res) => {
        db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    });

    // ── Web Search API (браузер) ──────────────────────────────
    app.get('/api/search', async (req, res) => {
        const q = String(req.query.q || '');
        if (!q) return res.status(400).json({ error: 'q required' });
        try {
            const { webSearch } = await import('./tools/search');
            const results = await webSearch(q);
            res.json(results);
        } catch (e: any) {
            res.status(500).json({ error: e?.message });
        }
    });

function setupWebSocket() {
    wss.on('connection', (ws) => {
        let connectedUid: number | null = null;
        let isAlive = true;

        const pingInterval = setInterval(() => {
            if (!isAlive) return ws.terminate();
            isAlive = false;
            ws.ping();
        }, 30_000);

        ws.on('pong', () => { isAlive = true; });

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                if (msg.type === 'auth') {
                    const uid = linkTokens.get(msg.token);
                    if (!uid) {
                        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token. Use /link_pc in Telegram.' }));
                        ws.terminate();
                        return;
                    }
                    linkTokens.delete(msg.token);
                    connectedUid = uid;
                    agentConnections.set(uid, ws);
                    ws.send(JSON.stringify({ type: 'auth_ok', uid }));
                    Logger.success('wss', `PC Agent connected: UID ${uid}`);
                    try {
                        await bot.api.sendMessage(uid,
                            `🖥 *PC Агент подключён!*\n\nОС: ${msg.info?.os || 'unknown'}\nХост: ${msg.info?.hostname || 'unknown'}`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch { }
                    return;
                }

                if (!connectedUid) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                    return;
                }

                if (msg.type === 'result' && msg.requestId) {
                    const cb = pendingRequests.get(msg.requestId);
                    if (cb) { cb(msg); pendingRequests.delete(msg.requestId); }
                }
            } catch (e) {
                Logger.error('wss', 'Message error', e);
            }
        });

        ws.on('close', () => {
            clearInterval(pingInterval);
            if (connectedUid) {
                agentConnections.delete(connectedUid);
                Logger.warn('wss', `PC Agent disconnected: UID ${connectedUid}`);
                connectedUid = null;
            }
        });
    });
}

// ============================================================
//  BOOTSTRAP
// ============================================================
async function bootstrap() {
    Logger.info('system', '🚀 NEXUM v1.0 starting...');

    if (!CONFIG.TELEGRAM_TOKEN) {
        Logger.error('system', 'BOT_TOKEN not set! Exiting.');
        process.exit(1);
    }

    initDB();
    migrateEvolutionTables(db);
    initByokDb(db);
    SkillManager.init();
    UserModel.init();
    LongTermMemory.init();
    Logger.success('system', 'Skill + UserModel + LongTermMemory initialized ✅');
    Logger.success('system', 'Database ready ✅');

    setupApiRoutes();
    setupWebSocket();
    setupBot(bot);

    startMonitor();
    startReminderCron(bot);
    // Self-reminder cron — агент напоминает о важных задачах каждые 2 часа
    setInterval(async () => {
        try {
            const users = db.prepare("SELECT uid FROM users WHERE subscription_plan IN ('middle','pro')").all() as any[];
            for (const u of users) { await LongTermMemory.selfReminder(u.uid, bot).catch(() => {}); }
        } catch {}
    }, 2 * 60 * 60 * 1000);
    Logger.success('system', 'Background systems started ✅');

    await new Promise<void>((resolve) => {
        httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
            Logger.success('system', `NEXUM HTTP live → port ${CONFIG.PORT} 🌍`);
            resolve();
        });
    });

    bot.start({ drop_pending_updates: true }).catch((err) => {
        Logger.error('system', 'Bot polling error', err);
    });
    Logger.success('system', 'Telegram Bot online ✅');
}

bootstrap().catch((err) => {
    console.error('💥 Fatal bootstrap error:', err);
    process.exit(1);
});
