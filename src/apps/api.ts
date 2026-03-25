// API для мини-апов NEXUM

import express from 'express';
import { db } from '../core/db';

const router = express.Router();

// ============================================
// 🔐 AUTH — проверка Telegram initData
// ============================================

function validateInitData(initData: string): { userId: number; valid: boolean } {
  try {
    const params = new URLSearchParams(initData);
    const user = params.get('user');
    if (!user) return { userId: 0, valid: false };
    const userData = JSON.parse(user);
    return { userId: userData.id, valid: true };
  } catch {
    return { userId: 0, valid: false };
  }
}

// ============================================
// 💰 FINANCE API
// ============================================

// Получить все транзакции
router.get('/finance/transactions', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.all('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC', [auth.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ transactions: rows || [] });
  });
});

// Добавить транзакцию
router.post('/finance/transactions', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  const { type, amount, category, description } = req.body;
  db.run(
    'INSERT INTO transactions (user_id, type, amount, category, description) VALUES (?, ?, ?, ?, ?)',
    [auth.userId, type, amount, category, description],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Получить баланс
router.get('/finance/balance', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.get(
    `SELECT 
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
     FROM transactions WHERE user_id=?`,
    [auth.userId],
    (err, row: any) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({
        balance: (row?.income || 0) - (row?.expense || 0),
        income: row?.income || 0,
        expense: row?.expense || 0
      });
    }
  );
});

// ============================================
// ✅ TASKS API
// ============================================

// Получить все задачи
router.get('/tasks', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.all('SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC', [auth.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ tasks: rows || [] });
  });
});

// Добавить задачу
router.post('/tasks', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  const { text } = req.body;
  db.run('INSERT INTO tasks (user_id, text) VALUES (?, ?)', [auth.userId, text], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, id: this.lastID });
  });
});

// Обновить задачу (выполнено/нет)
router.patch('/tasks/:id', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  const { completed } = req.body;
  db.run('UPDATE tasks SET completed=? WHERE id=? AND user_id=?', [completed ? 1 : 0, req.params.id, auth.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

// Удалить задачу
router.delete('/tasks/:id', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.run('DELETE FROM tasks WHERE id=? AND user_id=?', [req.params.id, auth.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

// ============================================
// 📝 NOTES API
// ============================================

router.get('/notes', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.all('SELECT * FROM notes WHERE user_id=? ORDER BY created_at DESC', [auth.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ notes: rows || [] });
  });
});

router.post('/notes', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  const { text } = req.body;
  db.run('INSERT INTO notes (user_id, text) VALUES (?, ?)', [auth.userId, text], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, id: this.lastID });
  });
});

// ============================================
// 🎯 HABITS API
// ============================================

router.get('/habits', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  db.all('SELECT * FROM habits WHERE user_id=?', [auth.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ habits: rows || [] });
  });
});

router.post('/habits', (req, res) => {
  const auth = validateInitData(req.headers['x-tg-authorization'] as string || '');
  if (!auth.valid) return res.status(401).json({ error: 'Unauthorized' });

  const { name } = req.body;
  db.run('INSERT INTO habits (user_id, name) VALUES (?, ?)', [auth.userId, name], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, id: this.lastID });
  });
});

export default router;
