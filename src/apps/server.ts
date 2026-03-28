/**
 * NEXUM App Server
 * Express HTTP + WebSocket for PC Agent connections.
 * All mini-app REST APIs are here.
 */

import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { db } from '../core/db';
import { config } from '../core/config';
import { registerConnection } from '../agent/pcagent_protocol';
import { useLinkCode, updateDeviceStatus } from '../agent/pairing';
import { createLogger } from '../infra/logger';
import { getUserPrefs, setUserLang, setUserTheme } from '../core/preferences';
import type { Lang } from '../i18n/index';

const log = createLogger('server');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function startServer(): express.Application {
  const app    = express();
  const server = createServer(app);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(PUBLIC_DIR));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => res.json({ ok: true, service: 'nexum' }));
  app.get('/health', (_req, res) => res.json({
    ok: true,
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  app.get('/ready', (_req, res) => {
    try { db.prepare('SELECT 1').get(); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  // ── Mini-app pages ──────────────────────────────────────────────────────────
  for (const page of ['finance','tasks','notes','habits','calendar','contacts','agent','apps','settings']) {
    app.get(`/${page}`, (_req, res) => {
      res.sendFile(path.join(PUBLIC_DIR, `${page}.html`));
    });
  }

  // ── REST API ────────────────────────────────────────────────────────────────
  setupFinanceApi(app);
  setupTasksApi(app);
  setupNotesApi(app);
  setupHabitsApi(app);
  setupCalendarApi(app);
  setupContactsApi(app);
  setupUserApi(app);
  setupPrefsApi(app);
  setupMemoryApi(app);

  // 404 handler for API routes
  app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // ── WebSocket — PC Agent ────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const params    = new URL(req.url ?? '', 'http://localhost').searchParams;
    const code      = params.get('code');
    const deviceId  = params.get('device_id') ?? `dev_${Date.now()}`;
    const devName   = params.get('device_name') ?? 'PC';
    const platform  = params.get('platform') ?? 'Unknown';

    if (!code) { ws.close(4001, 'Missing link code'); return; }

    const uid = useLinkCode(code, deviceId, devName, platform);
    if (!uid) { ws.close(4002, 'Invalid or expired code'); return; }

    registerConnection(uid, ws as Parameters<typeof registerConnection>[1]);
    log.info(`PC Agent connected uid=${uid} device=${devName}`);

    ws.on('close', () => updateDeviceStatus(uid, 'offline'));

    // Keep last_seen fresh
    const hb = setInterval(() => {
      if (ws.readyState === ws.OPEN) updateDeviceStatus(uid, 'online');
      else clearInterval(hb);
    }, 30_000);
  });

  server.listen(config.port, () => log.info(`HTTP+WS on port ${config.port}`));
  return app;
}

// ── User Preferences API ─────────────────────────────────────────────────────

function setupPrefsApi(app: express.Application): void {
  app.get('/api/user-prefs/:uid', (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    if (!uid) { res.status(400).json({ error: 'Invalid uid' }); return; }

    const prefs = getUserPrefs(uid);
    const user = db.prepare('SELECT username, first_name, tariff FROM users WHERE uid=?').get(uid) as
      { username: string; first_name: string; tariff: string } | undefined;

    res.json({
      lang: prefs.lang,
      theme: prefs.theme,
      voice: prefs.voice,
      plan: user?.tariff ?? 'free',
      username: user?.username ?? '',
      first_name: user?.first_name ?? '',
    });
  });

  app.post('/api/user-prefs/:uid', (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    if (!uid) { res.status(400).json({ error: 'Invalid uid' }); return; }

    const { lang, theme } = req.body as { lang?: string; theme?: string };
    if (lang && (lang === 'en' || lang === 'ru')) {
      setUserLang(uid, lang as Lang);
    }
    if (theme && (theme === 'dark' || theme === 'light')) {
      setUserTheme(uid, theme as 'dark' | 'light');
    }

    res.json({ ok: true });
  });
}

// ── Memory API ───────────────────────────────────────────────────────────────

function setupMemoryApi(app: express.Application): void {
  app.get('/api/memory/:uid', (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    if (!uid) { res.status(400).json({ error: 'Invalid uid' }); return; }

    const facts = db.prepare(
      `SELECT key, value FROM memory WHERE uid=? AND key NOT LIKE '__pref_%' ORDER BY updated_at DESC`
    ).all(uid);
    res.json(facts);
  });

  app.delete('/api/memory/all/:uid', (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    if (!uid) { res.status(400).json({ error: 'Invalid uid' }); return; }

    db.prepare(`DELETE FROM memory WHERE uid=? AND key NOT LIKE '__pref_%'`).run(uid);
    db.prepare(`DELETE FROM conversations WHERE uid=?`).run(uid);
    res.json({ ok: true });
  });
}

// ── Finance ───────────────────────────────────────────────────────────────────

function setupFinanceApi(app: express.Application): void {
  app.get('/api/finance', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    const transactions = db.prepare('SELECT * FROM finance WHERE uid=? ORDER BY created_at DESC LIMIT 200').all(uid);
    const summary      = db.prepare('SELECT type, SUM(amount) AS total FROM finance WHERE uid=? GROUP BY type').all(uid);
    res.json({ transactions, summary });
  });

  app.post('/api/finance', (req, res) => {
    const { uid, type, amount, category, note, currency } = req.body as Record<string, unknown>;
    if (!uid || !type || amount == null) { res.status(400).json({ error: 'uid, type, amount required' }); return; }
    const r = db.prepare('INSERT INTO finance (uid, type, amount, category, note, currency) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, type, amount, category ?? 'other', note ?? '', currency ?? 'UZS');
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/finance/:id', (req, res) => {
    db.prepare('DELETE FROM finance WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function setupTasksApi(app: express.Application): void {
  app.get('/api/tasks', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare("SELECT * FROM tasks WHERE uid=? ORDER BY status, priority DESC, created_at DESC").all(uid));
  });

  app.post('/api/tasks', (req, res) => {
    const { uid, title, description, project, priority, due_date } = req.body as Record<string, unknown>;
    if (!uid || !title) { res.status(400).json({ error: 'uid, title required' }); return; }
    const r = db.prepare('INSERT INTO tasks (uid, title, description, project, priority, due_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, title, description ?? '', project ?? 'General', priority ?? 'medium', due_date ?? null);
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const { status, title, priority } = req.body as Record<string, string | undefined>;
    if (status)   db.prepare("UPDATE tasks SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
    if (title)    db.prepare("UPDATE tasks SET title=?, updated_at=datetime('now') WHERE id=?").run(title, req.params.id);
    if (priority) db.prepare("UPDATE tasks SET priority=?, updated_at=datetime('now') WHERE id=?").run(priority, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function setupNotesApi(app: express.Application): void {
  app.get('/api/notes', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare('SELECT * FROM notes WHERE uid=? ORDER BY pinned DESC, updated_at DESC').all(uid));
  });

  app.post('/api/notes', (req, res) => {
    const { uid, title, content, tags } = req.body as Record<string, unknown>;
    if (!uid || !content) { res.status(400).json({ error: 'uid, content required' }); return; }
    const r = db.prepare('INSERT INTO notes (uid, title, content, tags) VALUES (?, ?, ?, ?)')
      .run(uid, title ?? '', content, tags ?? '');
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/notes/:id', (req, res) => {
    const { title, content, pinned } = req.body as Record<string, unknown>;
    if (content !== undefined) db.prepare("UPDATE notes SET content=?, updated_at=datetime('now') WHERE id=?").run(content, req.params.id);
    if (title !== undefined)   db.prepare("UPDATE notes SET title=?, updated_at=datetime('now') WHERE id=?").run(title, req.params.id);
    if (pinned !== undefined)  db.prepare("UPDATE notes SET pinned=?, updated_at=datetime('now') WHERE id=?").run(pinned, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/notes/:id', (req, res) => {
    db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── Habits ────────────────────────────────────────────────────────────────────

function setupHabitsApi(app: express.Application): void {
  app.get('/api/habits', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare('SELECT * FROM habits WHERE uid=? ORDER BY name').all(uid));
  });

  app.post('/api/habits', (req, res) => {
    const { uid, name, emoji, frequency } = req.body as Record<string, unknown>;
    if (!uid || !name) { res.status(400).json({ error: 'uid, name required' }); return; }
    const r = db.prepare('INSERT INTO habits (uid, name, emoji, frequency) VALUES (?, ?, ?, ?)').run(uid, name, emoji ?? '●', frequency ?? 'daily');
    res.json({ id: r.lastInsertRowid });
  });

  app.post('/api/habits/:id/done', (req, res) => {
    const { uid } = req.body as { uid: number };
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    db.prepare('INSERT INTO habit_logs (habit_id, uid) VALUES (?, ?)').run(req.params.id, uid);
    db.prepare("UPDATE habits SET last_done=datetime('now'), streak=streak+1 WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/habits/:id', (req, res) => {
    db.prepare('DELETE FROM habits WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function setupCalendarApi(app: express.Application): void {
  app.get('/api/calendar', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare('SELECT * FROM calendar_events WHERE uid=? ORDER BY start_at').all(uid));
  });

  app.post('/api/calendar', (req, res) => {
    const { uid, title, description, start_at, end_at, all_day, color } = req.body as Record<string, unknown>;
    if (!uid || !title || !start_at) { res.status(400).json({ error: 'uid, title, start_at required' }); return; }
    const r = db.prepare('INSERT INTO calendar_events (uid, title, description, start_at, end_at, all_day, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uid, title, description ?? '', start_at, end_at ?? null, all_day ?? 0, color ?? '#6366f1');
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/calendar/:id', (req, res) => {
    db.prepare('DELETE FROM calendar_events WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── Contacts ──────────────────────────────────────────────────────────────────

function setupContactsApi(app: express.Application): void {
  app.get('/api/contacts', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare('SELECT * FROM contacts WHERE uid=? ORDER BY name').all(uid));
  });

  app.post('/api/contacts', (req, res) => {
    const { uid, name, phone, email, company, notes } = req.body as Record<string, unknown>;
    if (!uid || !name) { res.status(400).json({ error: 'uid, name required' }); return; }
    const r = db.prepare('INSERT INTO contacts (uid, name, phone, email, company, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, name, phone ?? '', email ?? '', company ?? '', notes ?? '');
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/contacts/:id', (req, res) => {
    const fields = req.body as Record<string, string>;
    for (const [key, val] of Object.entries(fields)) {
      if (['name','phone','email','company','notes'].includes(key)) {
        db.prepare(`UPDATE contacts SET ${key}=?, updated_at=datetime('now') WHERE id=?`).run(val, req.params.id);
      }
    }
    res.json({ ok: true });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
}

// ── User API ──────────────────────────────────────────────────────────────────

function setupUserApi(app: express.Application): void {
  app.get('/api/user/:uid', (req, res) => {
    const uid  = parseInt(req.params.uid, 10);
    const user = db.prepare('SELECT uid, username, first_name, tariff, created_at FROM users WHERE uid=?').get(uid);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  });

  app.get('/api/reminders', (req, res) => {
    const uid = parseInt(req.query.uid as string, 10);
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
    res.json(db.prepare("SELECT * FROM reminders WHERE uid=? AND done=0 ORDER BY fire_at").all(uid));
  });
}
