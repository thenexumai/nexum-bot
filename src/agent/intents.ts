import db from '../core/db';

interface Intent {
  type: 'finance' | 'task' | 'calendar' | 'note' | 'memory' | 'none';
  data?: Record<string, unknown>;
  saved?: boolean;
}

const INCOME_KEYWORDS = ['получил', 'заработал', 'пришло', 'пополнил', 'перевели', 'received', 'earned', 'got paid'];
const EXPENSE_KEYWORDS = ['потратил', 'купил', 'заплатил', 'оплатил', 'spent', 'bought', 'paid'];
const TASK_KEYWORDS = ['купить', 'сделать', 'сходить', 'не забыть', 'напомни', 'todo', 'buy', 'do', 'task'];
const CALENDAR_KEYWORDS = ['встреча', 'созвон', 'мероприятие', 'завтра', 'в понедельник', 'meeting', 'call', 'tomorrow', 'event'];
const NOTE_KEYWORDS = ['запомни', 'сохрани', 'запиши', 'пароль', 'важно', 'remember', 'save', 'note', 'password'];

const CATEGORY_MAP: Record<string, string> = {
  еда: 'food', food: 'food', ресторан: 'food', кафе: 'food',
  такси: 'transport', транспорт: 'transport', метро: 'transport', transport: 'transport',
  одежда: 'clothes', clothes: 'clothes',
  зарплата: 'salary', salary: 'salary',
  аренда: 'rent', rent: 'rent',
  коммуналка: 'utilities', utilities: 'utilities',
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(kw)) return cat;
  }
  return 'other';
}

function extractAmount(text: string): number | null {
  const match = text.match(/[\d\s]+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/\s/g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}

export function detectAndSaveIntent(text: string, uid: number): Intent {
  const lower = text.toLowerCase();

  // Finance - income
  if (INCOME_KEYWORDS.some(kw => lower.includes(kw))) {
    const amount = extractAmount(text);
    if (amount && amount > 0) {
      const category = detectCategory(text);
      db.prepare(
        'INSERT INTO finance (uid, type, amount, category, note) VALUES (?, ?, ?, ?, ?)'
      ).run(uid, 'income', amount, category, text.slice(0, 200));
      return { type: 'finance', data: { type: 'income', amount, category }, saved: true };
    }
  }

  // Finance - expense
  if (EXPENSE_KEYWORDS.some(kw => lower.includes(kw))) {
    const amount = extractAmount(text);
    if (amount && amount > 0) {
      const category = detectCategory(text);
      db.prepare(
        'INSERT INTO finance (uid, type, amount, category, note) VALUES (?, ?, ?, ?, ?)'
      ).run(uid, 'expense', amount, category, text.slice(0, 200));
      return { type: 'finance', data: { type: 'expense', amount, category }, saved: true };
    }
  }

  // Tasks
  if (TASK_KEYWORDS.some(kw => lower.includes(kw))) {
    const title = text.slice(0, 150);
    db.prepare('INSERT INTO tasks (uid, title, status, priority) VALUES (?, ?, ?, ?)').run(
      uid, title, 'todo', 'medium'
    );
    return { type: 'task', data: { title }, saved: true };
  }

  // Calendar
  if (CALENDAR_KEYWORDS.some(kw => lower.includes(kw))) {
    const start = new Date();
    if (lower.includes('завтра') || lower.includes('tomorrow')) start.setDate(start.getDate() + 1);
    db.prepare(
      'INSERT INTO calendar_events (uid, title, start_time) VALUES (?, ?, ?)'
    ).run(uid, text.slice(0, 150), start.toISOString());
    return { type: 'calendar', data: { title: text.slice(0, 80) }, saved: true };
  }

  // Notes
  if (NOTE_KEYWORDS.some(kw => lower.includes(kw))) {
    db.prepare('INSERT INTO notes (uid, content) VALUES (?, ?)').run(uid, text.slice(0, 500));
    return { type: 'note', data: { content: text.slice(0, 80) }, saved: true };
  }

  return { type: 'none' };
}

export function intentSummary(intent: Intent, lang: 'ru' | 'en'): string | null {
  if (!intent.saved) return null;
  const ru: Record<string, string> = {
    finance: intent.data?.type === 'income'
      ? `💰 Доход ${intent.data.amount} записан`
      : `💸 Расход ${intent.data?.amount} записан`,
    task: `✅ Задача добавлена`,
    calendar: `📅 Событие добавлено в календарь`,
    note: `📝 Заметка сохранена`,
  };
  const en: Record<string, string> = {
    finance: intent.data?.type === 'income'
      ? `💰 Income ${intent.data.amount} saved`
      : `💸 Expense ${intent.data?.amount} saved`,
    task: `✅ Task added`,
    calendar: `📅 Event added to calendar`,
    note: `📝 Note saved`,
  };
  return (lang === 'en' ? en : ru)[intent.type] ?? null;
}
