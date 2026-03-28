/**
 * NEXUM Intent Detection
 * Распознаёт намерения пользователя: финансы, задачи, заметки, календарь.
 * Используется в executor.ts перед обычным чатом.
 */

export type IntentType = 'finance' | 'task' | 'note' | 'calendar' | null;

export type FinanceType = 'income' | 'expense';

export interface FinanceIntent {
  type: 'finance';
  financeType: FinanceType;
  amount: number;
  currency: string;
  category: string;
  note: string;
}

export interface TaskIntent {
  type: 'task';
  title: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export interface NoteIntent {
  type: 'note';
  content: string;
  title: string;
}

export interface CalendarIntent {
  type: 'calendar';
  title: string;
  startAt: string;
  description: string;
}

export type Intent = FinanceIntent | TaskIntent | NoteIntent | CalendarIntent | { type: null };

// ── Finance keyword maps ──────────────────────────────────────────────────────

const INCOME_TRIGGERS = [
  'зарплата', 'salary', 'получил', 'получила', 'пришла', 'пришло', 'пришёл',
  'заработал', 'заработала', 'доход', 'income', 'поступление', 'перевели',
  'выплатили', 'выплата', 'бонус', 'bonus', 'аванс', 'дивиденды', 'фриланс',
  'продал', 'продала', 'выручка', 'прибыль',
];

const EXPENSE_TRIGGERS = [
  'потратил', 'потратила', 'купил', 'купила', 'заплатил', 'заплатила',
  'расход', 'expense', 'оплатил', 'оплатила', 'снял', 'сняла', 'списали',
  'кофе', 'обед', 'такси', 'uber', 'yandex', 'еда', 'продукты', 'аренда',
  'коммуналка', 'интернет', 'подписка',
];

const CATEGORY_MAP: Record<string, string> = {
  зарплата: 'salary', salary: 'salary',
  аванс: 'salary', бонус: 'bonus', bonus: 'bonus',
  фриланс: 'freelance',
  дивиденды: 'dividends',
  еда: 'food', обед: 'food', продукты: 'food', кофе: 'food',
  такси: 'transport', uber: 'transport', yandex: 'transport',
  аренда: 'rent',
  коммуналка: 'utilities', интернет: 'utilities',
  подписка: 'subscription',
  прибыль: 'business', выручка: 'business',
};

// ── Amount extraction ─────────────────────────────────────────────────────────

function extractAmount(text: string): number | null {
  // Matches: 5000000, 5_000_000, 5.000.000, 5,000,000, 5к, 5K, 5M, 5млн, 5тыс
  const cleanText = text
    .replace(/(\d)[_\s](\d)/g, '$1$2')   // 5 000 → 5000
    .replace(/(\d),(\d{3})/g, '$1$2');    // 5,000,000 → 5000000

  const patterns = [
    /(\d+(?:\.\d+)?)\s*млн/i,   // 5 млн → 5000000
    /(\d+(?:\.\d+)?)\s*тыс/i,  // 5 тыс → 5000
    /(\d+(?:\.\d+)?)\s*[kкK]/i, // 5k → 5000
    /(\d+(?:\.\d+)?)\s*[mMм]/i, // 5M → 5000000
    /(\d{4,}(?:\.\d+)?)/,        // plain 5000000
    /(\d+(?:\.\d+)?)/,           // plain number
  ];

  for (const p of patterns) {
    const m = cleanText.match(p);
    if (m) {
      let v = parseFloat(m[1]);
      const full = m[0].toLowerCase();
      if (full.includes('млн') || (full.includes('m') && !full.includes('тыс'))) v *= 1_000_000;
      else if (full.includes('тыс') || full.includes('k') || full.includes('к')) v *= 1_000;
      if (v > 0) return v;
    }
  }
  return null;
}

function extractCurrency(text: string): string {
  if (/\$|usd|dollar/i.test(text)) return 'USD';
  if (/€|eur|euro/i.test(text)) return 'EUR';
  if (/руб|rub|₽/i.test(text)) return 'RUB';
  return 'UZS';
}

function detectCategory(text: string): string {
  const lo = text.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (lo.includes(kw)) return cat;
  }
  return 'other';
}

// ── Task keywords ─────────────────────────────────────────────────────────────

const TASK_TRIGGERS = [
  'нужно сделать', 'надо сделать', 'задача:', 'task:', 'добавь задачу',
  'создай задачу', 'поставь задачу', 'напомни сделать', 'не забыть',
  'todo:', 'todo ', 'сделать до',
];

// ── Note keywords ─────────────────────────────────────────────────────────────

const NOTE_TRIGGERS = [
  'запомни:', 'запиши:', 'заметка:', 'note:', 'сохрани:', 'запомни это',
  'запиши это', 'добавь заметку', 'создай заметку',
];

// ── Calendar keywords ─────────────────────────────────────────────────────────

const CALENDAR_TRIGGERS = [
  'встреча', 'собрание', 'митинг', 'meeting', 'напомни в ', 'напомни мне в ',
  'добавь в календарь', 'calendar:', 'событие:', 'event:',
  'запланируй', 'назначь встречу',
];

// ── Main detectIntent ─────────────────────────────────────────────────────────

export function detectIntent(text: string): Intent {
  const lo = text.toLowerCase();

  // ── Finance ─────────────────────────────────────────────────────────────────
  const hasIncomeTrigger = INCOME_TRIGGERS.some(t => lo.includes(t));
  const hasExpenseTrigger = EXPENSE_TRIGGERS.some(t => lo.includes(t));

  if (hasIncomeTrigger || hasExpenseTrigger) {
    const amount = extractAmount(text);
    if (amount !== null) {
      const financeType: FinanceType = hasExpenseTrigger && !hasIncomeTrigger ? 'expense' : 'income';
      const currency = extractCurrency(text);
      const category = detectCategory(lo);

      // Build note from the original message (trim to 120 chars)
      const note = text.length > 120 ? text.slice(0, 117) + '…' : text;

      return { type: 'finance', financeType, amount, currency, category, note };
    }
  }

  // ── Task ────────────────────────────────────────────────────────────────────
  if (TASK_TRIGGERS.some(t => lo.includes(t))) {
    const title = text
      .replace(/нужно сделать|надо сделать|задача:|task:|добавь задачу|создай задачу|поставь задачу|напомни сделать|не забыть|todo:|todo |сделать до/gi, '')
      .trim() || 'Новая задача';

    const priority = /срочно|urgent|asap|важно|high/i.test(text) ? 'high'
      : /не срочно|low|не важно/i.test(text) ? 'low'
      : 'medium';

    return { type: 'task', title, priority };
  }

  // ── Note ────────────────────────────────────────────────────────────────────
  if (NOTE_TRIGGERS.some(t => lo.includes(t))) {
    const content = text
      .replace(/запомни:|запиши:|заметка:|note:|сохрани:|запомни это|запиши это|добавь заметку|создай заметку/gi, '')
      .trim() || text;

    const title = content.split(/[.!\n]/)[0].slice(0, 60) || 'Заметка';
    return { type: 'note', content, title };
  }

  // ── Calendar ────────────────────────────────────────────────────────────────
  if (CALENDAR_TRIGGERS.some(t => lo.includes(t))) {
    const title = text
      .replace(/добавь в календарь|calendar:|событие:|event:|запланируй|назначь встречу/gi, '')
      .trim()
      .split(/[.!\n]/)[0]
      .slice(0, 80) || 'Событие';

    // Extract simple time like "в 15:00" or "завтра"
    const timeMatch = text.match(/в (\d{1,2}:\d{2})/);
    const now = new Date();
    if (/завтра/i.test(text)) now.setDate(now.getDate() + 1);
    if (timeMatch) {
      const [h, m] = timeMatch[1].split(':').map(Number);
      now.setHours(h, m, 0, 0);
    }

    return {
      type: 'calendar',
      title,
      startAt: now.toISOString(),
      description: text,
    };
  }

  return { type: null };
}

// ── Format helpers ────────────────────────────────────────────────────────────

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ' + currency;
}
