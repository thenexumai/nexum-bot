// NEXUM App Server — HTTP + WebSocket (PC Agent relay)

import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Bot } from 'grammy';
import { config } from '../core/config';
import { db } from '../core/db';
import { registerConnection } from '../agent/pcagent_protocol';
import { useLinkCode, updateAgentStatus } from '../agent/pairing';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function startServer(bot: Bot): express.Application {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => res.send('NEXUM OK'));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Mini-apps ───────────────────────────────────────────────────────────────
  const pages = ['finance', 'tasks', 'notes', 'habits', 'calendar', 'contacts', 'agent', 'apps'];
  for (const page of pages) {
    app.get(`/${page}`, (_req, res) => {
      res.sendFile(path.join(PUBLIC_DIR, `${page}.html`));
    });
  }

  // ── REST API for mini-apps ──────────────────────────────────────────────────

  // Finance
  app.get('/api/finance', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const rows = (db as any).prepare(
      'SELECT * FROM finance WHERE uid=? ORDER BY created_at DESC LIMIT 100'
    ).all(uid) || [];
    const summary = (db as any).prepare(
      'SELECT type, SUM(amount) as total FROM finance WHERE uid=? GROUP BY type'
    ).all(uid) || [];
    res.json({ transactions: rows, summary });
  });

  app.post('/api/finance', (req, res) => {
    const { uid, type, amount, category, note, currency } = req.body;
    if (!uid || !type || amount == null) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO finance (uid, type, amount, category, note, currency) VALUES (?,?,?,?,?,?)'
    ).run(uid, type, amount, category || 'other', note || '', currency || 'UZS');
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/finance/:id', (req, res) => {
    (db as any).prepare('DELETE FROM finance WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Tasks
  app.get('/api/tasks', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const rows = (db as any).prepare(
      'SELECT * FROM tasks WHERE uid=? ORDER BY status, priority, created_at DESC'
    ).all(uid) || [];
    res.json(rows);
  });

  app.post('/api/tasks', (req, res) => {
    const { uid, title, description, project, priority, due_date } = req.body;
    if (!uid || !title) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO tasks (uid, title, description, project, priority, due_date) VALUES (?,?,?,?,?,?)'
    ).run(uid, title, description || '', project || 'General', priority || 'medium', due_date || null);
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const { status, title, priority } = req.body;
    if (status) (db as any).prepare("UPDATE tasks SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
    if (title)  (db as any).prepare("UPDATE tasks SET title=?, updated_at=datetime('now') WHERE id=?").run(title, req.params.id);
    if (priority) (db as any).prepare("UPDATE tasks SET priority=?, updated_at=datetime('now') WHERE id=?").run(priority, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    (db as any).prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Notes
  app.get('/api/notes', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const rows = (db as any).prepare(
      'SELECT * FROM notes WHERE uid=? ORDER BY pinned DESC, updated_at DESC'
    ).all(uid) || [];
    res.json(rows);
  });

  app.post('/api/notes', (req, res) => {
    const { uid, title, content, tags } = req.body;
    if (!uid || !content) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO notes (uid, title, content, tags) VALUES (?,?,?,?)'
    ).run(uid, title || '', content, tags || '');
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/notes/:id', (req, res) => {
    const { title, content, pinned } = req.body;
    if (content !== undefined) (db as any).prepare("UPDATE notes SET content=?, updated_at=datetime('now') WHERE id=?").run(content, req.params.id);
    if (title !== undefined)   (db as any).prepare("UPDATE notes SET title=?, updated_at=datetime('now') WHERE id=?").run(title, req.params.id);
    if (pinned !== undefined)  (db as any).prepare("UPDATE notes SET pinned=? WHERE id=?").run(pinned ? 1 : 0, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/notes/:id', (req, res) => {
    (db as any).prepare('DELETE FROM notes WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Habits
  app.get('/api/habits', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const rows = (db as any).prepare(
      'SELECT * FROM habits WHERE uid=? ORDER BY streak DESC, created_at'
    ).all(uid) || [];
    res.json(rows);
  });

  app.post('/api/habits', (req, res) => {
    const { uid, name, emoji, frequency } = req.body;
    if (!uid || !name) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO habits (uid, name, emoji, frequency) VALUES (?,?,?,?)'
    ).run(uid, name, emoji || '●', frequency || 'daily');
    res.json({ id: r.lastInsertRowid });
  });

  app.post('/api/habits/:id/done', (req, res) => {
    const id = req.params.id;
    const today = new Date().toISOString().split('T')[0];
    const habit = (db as any).prepare('SELECT * FROM habits WHERE id=?').get(id) as any;
    if (!habit) return res.status(404).json({ error: 'not found' });

    const alreadyDone = (db as any).prepare(
      `SELECT id FROM habit_logs WHERE habit_id=? AND date(done_at)=?`
    ).get(id, today);
    if (alreadyDone) return res.json({ ok: true, already: true });

    (db as any).prepare('INSERT INTO habit_logs (habit_id, uid, done_at) VALUES (?,?,datetime("now"))').run(id, habit.uid);

    const lastDate = habit.last_done ? new Date(habit.last_done + 'Z') : null;
    const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
    const newStreak = lastDate && habit.last_done >= yesterday ? habit.streak + 1 : 1;
    const bestStreak = Math.max(newStreak, habit.best_streak || 0);

    (db as any).prepare(
      'UPDATE habits SET streak=?, best_streak=?, last_done=? WHERE id=?'
    ).run(newStreak, bestStreak, today, id);

    res.json({ ok: true, streak: newStreak });
  });

  app.delete('/api/habits/:id', (req, res) => {
    (db as any).prepare('DELETE FROM habits WHERE id=?').run(req.params.id);
    (db as any).prepare('DELETE FROM habit_logs WHERE habit_id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Calendar
  app.get('/api/calendar', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const rows = (db as any).prepare(
      'SELECT * FROM calendar_events WHERE uid=? ORDER BY start_at'
    ).all(uid) || [];
    res.json(rows);
  });

  app.post('/api/calendar', (req, res) => {
    const { uid, title, description, start_at, end_at, all_day, color } = req.body;
    if (!uid || !title || !start_at) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO calendar_events (uid, title, description, start_at, end_at, all_day, color) VALUES (?,?,?,?,?,?,?)'
    ).run(uid, title, description || '', start_at, end_at || null, all_day ? 1 : 0, color || '#6366f1');
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/calendar/:id', (req, res) => {
    (db as any).prepare('DELETE FROM calendar_events WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // Contacts
  app.get('/api/contacts', (req, res) => {
    const uid = parseInt(req.query.uid as string);
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const q = req.query.q as string;
    const rows = q
      ? (db as any).prepare("SELECT * FROM contacts WHERE uid=? AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name").all(uid, `%${q}%`, `%${q}%`, `%${q}%`)
      : (db as any).prepare('SELECT * FROM contacts WHERE uid=? ORDER BY name').all(uid);
    res.json(rows || []);
  });

  app.post('/api/contacts', (req, res) => {
    const { uid, name, phone, email, company, notes } = req.body;
    if (!uid || !name) return res.status(400).json({ error: 'missing fields' });
    const r = (db as any).prepare(
      'INSERT INTO contacts (uid, name, phone, email, company, notes) VALUES (?,?,?,?,?,?)'
    ).run(uid, name, phone || '', email || '', company || '', notes || '');
    res.json({ id: r.lastInsertRowid });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    (db as any).prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── PC Agent WebSocket ──────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: '/ws/agent' });

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url || '', `http://localhost`).searchParams;
    const code = params.get('code');
    const deviceId = params.get('device_id') || 'unknown';
    const deviceName = params.get('device_name') || 'PC';
    const platform = params.get('platform') || 'unknown';

    if (!code) { ws.close(1008, 'code required'); return; }

    const uid = useLinkCode(code, deviceId, deviceName, platform);
    if (!uid) { ws.close(1008, 'invalid or expired code'); return; }

    console.log(`[ws] PC Agent connected uid=${uid} device=${deviceName}`);
    registerConnection(uid, ws);

    ws.on('close', () => {
      updateAgentStatus(uid, 'offline');
      console.log(`[ws] PC Agent disconnected uid=${uid}`);
      // Notify user
      bot.api.sendMessage(uid, '⚫ PC Agent disconnected.').catch(() => {});
    });

    // Notify user
    bot.api.sendMessage(uid, `🟢 PC Agent connected: *${deviceName}* (${platform})`, { parse_mode: 'Markdown' }).catch(() => {});
  });

  // ── Start listening ──────────────────────────────────────────────────────────
  server.listen(config.port, () => {
    console.log(`[server] HTTP+WS on port ${config.port}`);
  });

  return app;
}
