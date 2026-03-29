import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { config } from '../core/config';
import db from '../core/db';
import logger from '../infra/logger';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../src/public')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/',       (_req, res) => res.send('NEXUM OK'));
app.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.0', uptime: process.uptime() }));
app.get('/ready',  (_req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

// ── Mini-app HTML routes ──────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '../../src/public');
for (const page of ['finance','tasks','notes','calendar','contacts','habits','settings','agent']) {
  app.get(`/app/${page}`, (_req, res) =>
    res.sendFile(path.join(publicDir, `${page}.html`))
  );
}

// ── REST API: Finance ─────────────────────────────────────────────────────────
app.get('/api/finance', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM finance WHERE uid = ? ORDER BY created_at DESC LIMIT 100').all(uid);
  res.json(rows);
});
app.post('/api/finance', (req, res) => {
  const { uid, type, amount, currency, category, note } = req.body;
  if (!uid || !type || !amount) { res.status(400).json({ error: 'uid, type, amount required' }); return; }
  const r = db.prepare('INSERT INTO finance (uid, type, amount, currency, category, note) VALUES (?,?,?,?,?,?)')
    .run(uid, type, amount, currency ?? 'UZS', category ?? 'other', note ?? null);
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/finance/:id', (req, res) => {
  db.prepare('DELETE FROM finance WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST API: Tasks ───────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM tasks WHERE uid = ? ORDER BY priority DESC, created_at DESC').all(uid);
  res.json(rows);
});
app.post('/api/tasks', (req, res) => {
  const { uid, title, description, priority, due_date } = req.body;
  if (!uid || !title) { res.status(400).json({ error: 'uid and title required' }); return; }
  const r = db.prepare('INSERT INTO tasks (uid, title, description, priority, due_date) VALUES (?,?,?,?,?)')
    .run(uid, title, description ?? null, priority ?? 'medium', due_date ?? null);
  res.json({ id: r.lastInsertRowid });
});
app.patch('/api/tasks/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST API: Notes ───────────────────────────────────────────────────────────
app.get('/api/notes', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM notes WHERE uid = ? ORDER BY pinned DESC, created_at DESC').all(uid);
  res.json(rows);
});
app.post('/api/notes', (req, res) => {
  const { uid, title, content, tags } = req.body;
  if (!uid || !content) { res.status(400).json({ error: 'uid and content required' }); return; }
  const r = db.prepare('INSERT INTO notes (uid, title, content, tags) VALUES (?,?,?,?)')
    .run(uid, title ?? null, content, JSON.stringify(tags ?? []));
  res.json({ id: r.lastInsertRowid });
});
app.patch('/api/notes/:id', (req, res) => {
  const { pinned } = req.body;
  db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST API: Calendar ────────────────────────────────────────────────────────
app.get('/api/calendar', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM calendar_events WHERE uid = ? ORDER BY start_time ASC').all(uid);
  res.json(rows);
});
app.post('/api/calendar', (req, res) => {
  const { uid, title, start_time, end_time, all_day, notes } = req.body;
  if (!uid || !title || !start_time) { res.status(400).json({ error: 'uid, title, start_time required' }); return; }
  const r = db.prepare('INSERT INTO calendar_events (uid, title, start_time, end_time, all_day, notes) VALUES (?,?,?,?,?,?)')
    .run(uid, title, start_time, end_time ?? null, all_day ? 1 : 0, notes ?? null);
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/calendar/:id', (req, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST API: Contacts ────────────────────────────────────────────────────────
app.get('/api/contacts', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM contacts WHERE uid = ? ORDER BY name ASC').all(uid);
  res.json(rows);
});
app.post('/api/contacts', (req, res) => {
  const { uid, name, phone, email, company, notes } = req.body;
  if (!uid || !name) { res.status(400).json({ error: 'uid and name required' }); return; }
  const r = db.prepare('INSERT INTO contacts (uid, name, phone, email, company, notes) VALUES (?,?,?,?,?,?)')
    .run(uid, name, phone ?? null, email ?? null, company ?? null, notes ?? null);
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── REST API: Habits ──────────────────────────────────────────────────────────
app.get('/api/habits', (req, res) => {
  const uid = Number(req.query.uid);
  if (!uid) { res.status(400).json({ error: 'uid required' }); return; }
  const rows = db.prepare('SELECT * FROM habits WHERE uid = ? ORDER BY streak DESC').all(uid);
  res.json(rows);
});
app.post('/api/habits', (req, res) => {
  const { uid, name, frequency } = req.body;
  if (!uid || !name) { res.status(400).json({ error: 'uid and name required' }); return; }
  const r = db.prepare('INSERT INTO habits (uid, name, frequency) VALUES (?,?,?)').run(uid, name, frequency ?? 'daily');
  res.json({ id: r.lastInsertRowid });
});
app.post('/api/habits/:id/check', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id) as
    { streak: number; best_streak: number; last_check: string } | undefined;
  if (!habit) { res.status(404).json({ error: 'Not found' }); return; }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = habit.last_check === yesterday ? habit.streak + 1 : 1;
  const best = Math.max(habit.best_streak, newStreak);
  db.prepare('UPDATE habits SET streak = ?, best_streak = ?, last_check = ? WHERE id = ?')
    .run(newStreak, best, today, req.params.id);
  res.json({ streak: newStreak, best_streak: best });
});

// ── WebSocket: PC Agent ───────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// uid → WebSocket connection
const agentConnections = new Map<number, WebSocket>();
// requestId → resolve callback
const pendingRequests = new Map<string, (result: Record<string, unknown>) => void>();

wss.on('connection', (ws) => {
  let connectedUid: number | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

      // Auth/pairing
      if (msg.type === 'auth') {
        const code = String(msg.code);
        const row = db.prepare('SELECT uid FROM pc_links WHERE code = ?').get(code) as
          { uid: number } | undefined;
        if (!row) { ws.send(JSON.stringify({ type: 'auth_failed' })); return; }

        connectedUid = row.uid;
        agentConnections.set(connectedUid, ws);
        db.prepare('UPDATE pc_links SET connected = 1, agent_info = ? WHERE uid = ?')
          .run(JSON.stringify(msg.info ?? {}), connectedUid);
        ws.send(JSON.stringify({ type: 'auth_ok', uid: connectedUid }));
        logger.success('server', `PC Agent connected: uid=${connectedUid}`);
        return;
      }

      // Result from agent
      if (msg.type === 'result' && msg.requestId) {
        const cb = pendingRequests.get(String(msg.requestId));
        if (cb) {
          pendingRequests.delete(String(msg.requestId));
          cb(msg as Record<string, unknown>);
        }
      }
    } catch (e) {
      logger.error('server', 'WS message parse error', e);
    }
  });

  ws.on('close', () => {
    if (connectedUid !== null) {
      agentConnections.delete(connectedUid);
      db.prepare('UPDATE pc_links SET connected = 0 WHERE uid = ?').run(connectedUid);
      logger.info('server', `PC Agent disconnected: uid=${connectedUid}`);
    }
  });
});

// Export for Telegram commands
export async function emitToAgent(
  uid: number,
  command: Record<string, unknown>,
  timeoutMs = 30_000
): Promise<Record<string, unknown> | null> {
  const ws = agentConnections.get(uid);
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const payload = { ...command, requestId };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ error: 'Timeout' });
    }, timeoutMs);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    ws.send(JSON.stringify(payload));
  });
}

export function startServer() {
  httpServer.listen(config.port, () => {
    logger.success('server', `HTTP + WebSocket server listening on port ${config.port}`);
  });
}

export { app };
