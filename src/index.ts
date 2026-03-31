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

// ============================================================
//  BOT INSTANCE (exported for other modules)
// ============================================================
export const bot = new Bot(CONFIG.TELEGRAM_TOKEN);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ============================================================
//  PC AGENT GLOBAL STATE
// ============================================================
export const agentConnections = new Map<number, WebSocket>();
export const pendingRequests = new Map<string, (result: any) => void>();

// One-time link tokens: token → uid
const linkTokens = new Map<string, number>();

export const createLinkToken = (uid: number): string => {
    const token = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15);
    linkTokens.set(token, uid);
    setTimeout(() => linkTokens.delete(token), 10 * 60 * 1000); // 10 min
    return token;
};

// ============================================================
//  REST API — full CRUD for all Mini Apps
// ============================================================
function setupApiRoutes() {
    app.use(express.json());
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

    // ── AI Chat ────────────────────────────────────────────────
    app.post('/api/chat', async (req, res) => {
        try {
            const { uid, messages, mode } = req.body as {
                uid?: number;
                messages: { role: string; content: string }[];
                mode?: string;
            };

            if (!messages?.length) return res.status(400).json({ error: 'messages required' });

            const { executeAI } = await import('./agent/executor');
            const lastMsg = messages.filter((m: any) => m.role === 'user').pop();
            if (!lastMsg) return res.status(400).json({ error: 'no user message' });

            const history = messages
                .filter((m: any) => !m.content.startsWith('[SYSTEM]:'))
                .slice(-18);

            const query = mode === 'search'
                ? `[deep_search] ${lastMsg.content}`
                : lastMsg.content;

            const result = await executeAI(query, uid ? Number(uid) : undefined, history);
            res.json({ content: result.content, sources: result.sources || [], tool_used: result.tool_used || null });
        } catch (e: any) {
            Logger.error('api/chat', e?.message || e);
            res.status(500).json({ error: e?.message || 'Internal error' });
        }
    });
}

// ============================================================
//  WEBSOCKET: PC Agent Bridge
// ============================================================
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
                    Logger.success('wss', `PC Agent connected: UID ${uid} | ${msg.info?.os || 'unknown'}`);
                    try {
                        await bot.api.sendMessage(uid,
                            `🖥 *PC Агент подключён!*\n\nОС: ${msg.info?.os || 'unknown'} ${msg.info?.os_version || ''}\nХост: ${msg.info?.hostname || 'unknown'}\n\nТеперь можешь управлять компьютером через NEXUM.`,
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

    // 1. Database
    initDB();
    migrateEvolutionTables(db);
    initByokDb(db);
    Logger.success('system', 'Database ready ✅');

    // 2. API + WebSocket routes
    setupApiRoutes();
    setupWebSocket();

    // 3. Telegram Bot setup (don't start long-polling yet)
    setupBot(bot);

    // 4. Background systems
    startMonitor();
    startReminderCron(bot);
    Logger.success('system', 'Background systems started ✅');

    // 5. HTTP Server — START FIRST so /health responds immediately
    await new Promise<void>((resolve) => {
        httpServer.listen(CONFIG.PORT, '0.0.0.0', () => {
            Logger.success('system', `NEXUM HTTP live → port ${CONFIG.PORT} 🌍`);
            resolve();
        });
    });

    // 6. Start Telegram bot AFTER HTTP is listening
    // FIX: bot.start() blocks forever — run in background, don't await
    bot.start({ drop_pending_updates: true }).catch((err) => {
        Logger.error('system', 'Bot polling error', err);
    });
    Logger.success('system', 'Telegram Bot online ✅');
}

bootstrap().catch((err) => {
    console.error('💥 Fatal bootstrap error:', err);
    process.exit(1);
});
