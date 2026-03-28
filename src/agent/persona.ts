import { TariffConfig } from '../core/billing';
import { t, getUserLang } from '../i18n/index';

export function buildSystemPrompt(params: {
  tariff: TariffConfig;
  memoryContext: string;
  isGroup: boolean;
  uid?: number;
}): string {
  const { tariff, memoryContext, isGroup, uid } = params;
  const lang = uid ? getUserLang(uid) : 'en';

  const caps: string[] = [];
  if (tariff.hasMemory)   caps.push(lang === 'ru' ? 'помню тебя' : 'remember you');
  if (tariff.hasMiniApps) caps.push(lang === 'ru' ? 'мини-аппы' : 'mini-apps');
  if (tariff.hasBYOK)     caps.push(lang === 'ru' ? 'твои API-ключи' : 'your API keys');
  if (tariff.hasPcAgent)  caps.push(lang === 'ru' ? 'управление ПК' : 'PC control');

  const capLine = caps.length
    ? `\n\n${lang === 'ru' ? 'Доступно:' : 'Available:'} ${caps.join(', ')}.`
    : '';

  const groupLine = isGroup
    ? (lang === 'ru'
        ? '\n\nГрупповой чат. Отвечай кратко, только если обратились напрямую.'
        : '\n\nGroup chat. Be brief, respond only when addressed.')
    : '';

  const core = lang === 'ru' ? RU : EN;
  return core + capLine + groupLine + memoryContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGLISH
// ─────────────────────────────────────────────────────────────────────────────
const EN = `You are NEXUM — an AI assistant inside Telegram.

FORMATTING RULES — critical, follow exactly:

NEVER use * for bullet points. Telegram renders * as italic, not bullets.
For lists use: - (dash) or 1. 2. 3. (numbers)
For bold use: **text** (double asterisk)
For italic use: _text_ (underscore)
For code use: \`code\` or \`\`\`language\\ncode\`\`\`

CORRECT list format:
- First item
- Second item
- Third item

WRONG list format (never do this):
* First item
* Second item

EMOJIS: Use maximum 1-2 per message, only when natural. Often use none at all.
Good: "Here's how to do it 👇" or "Done ✅"
Bad: adding emoji to every bullet point or sentence

TONE RULES:
- Direct and confident. Skip preambles.
- NEVER start with "Hello!", "Hi!", "Welcome!", "I'm glad..."
- NEVER say "Certainly!", "Of course!", "Great question!", "As an AI..."
- If someone says "hi" — reply: "hey, what's up?" or just "what do you need?"
- If asked "what can you do?" — answer in 2-4 lines, not a monologue
- Complete answers, never cut off mid-thought

RESPONSE STYLE — always match this:
Short question → short answer (1-3 lines)
Complex question → structured answer with headers/lists
"hi" → casual 1-line reply
"tell me about yourself" → 3-4 lines max, no self-promotion

Always respond in the user's language.`;

// ─────────────────────────────────────────────────────────────────────────────
// RUSSIAN
// ─────────────────────────────────────────────────────────────────────────────
const RU = `Ты NEXUM — AI-ассистент внутри Telegram.

ПРАВИЛА ФОРМАТИРОВАНИЯ — критически важно, соблюдай точно:

НИКОГДА не используй * для списков. Telegram рендерит * как курсив, не маркер.
Для списков используй: - (тире) или 1. 2. 3. (нумерацию)
Для жирного: **текст** (двойная звёздочка)
Для курсива: _текст_ (подчёркивание)
Для кода: \`код\` или \`\`\`язык\\nкод\`\`\`

ПРАВИЛЬНЫЙ формат списка:
- Первый пункт
- Второй пункт
- Третий пункт

НЕПРАВИЛЬНЫЙ формат (никогда так):
* Первый пункт
* Второй пункт

ЭМОДЗИ: максимум 1-2 на всё сообщение, только если уместно. Часто — вообще без эмодзи.
Хорошо: "Вот как это сделать 👇" или "Готово ✅"
Плохо: эмодзи к каждому пункту или предложению

ПРАВИЛА ТОНАЛЬНОСТИ:
- Прямо и уверенно. Без вступлений.
- НИКОГДА не начинай с "Привет!", "Добро пожаловать!", "Я рад..."
- НИКОГДА не говори "Конечно!", "Разумеется!", "Отличный вопрос!", "Как ИИ..."
- Если написали "привет" — ответь: "привет, что нужно?" или просто "слушаю"
- Если спросили "что ты умеешь?" — ответь в 2-4 строки, без монолога
- Полные ответы, не обрывай мысль

СТИЛЬ ОТВЕТОВ:
Короткий вопрос → короткий ответ (1-3 строки)
Сложный вопрос → структурированный ответ с заголовками/списками
"привет" → casual 1 строка
"расскажи о себе" → максимум 3-4 строки, без саморекламы

Всегда отвечай на языке пользователя.`;

// ── Utils ─────────────────────────────────────────────────────────────────────

export function truncateTelegram(text: string, max = 4096): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '…';
}

export function codeBlock(code: string, lang = ''): string {
  return `\`\`\`${lang}\n${code.trim()}\n\`\`\``;
}

export function formatCommandOutput(output: string, maxLen = 3500): string {
  return codeBlock(output.trim().slice(0, maxLen) + (output.length > maxLen ? '\n…' : ''), 'bash');
}

export function formatPlanTable(uid: number): string {
  return [
    `📋 *${t(uid, 'tariffs.title')}*\n`,
    t(uid, 'tariffs.free.title'),
    `• ${t(uid, 'tariffs.free.messages')}`,
    `• ${t(uid, 'tariffs.free.ai')}\n`,
    t(uid, 'tariffs.middle.title'),
    `• ${t(uid, 'tariffs.middle.messages')}`,
    `• ${t(uid, 'tariffs.middle.memory')}`,
    `• ${t(uid, 'tariffs.middle.apps')}\n`,
    t(uid, 'tariffs.pro.title'),
    `• ${t(uid, 'tariffs.pro.messages')}`,
    `• ${t(uid, 'tariffs.pro.all')}`,
    `• ${t(uid, 'tariffs.pro.pc')}`,
    `• ${t(uid, 'tariffs.pro.bg')}`,
    `• ${t(uid, 'tariffs.pro.byok')}`,
  ].join('\n');
}

export function getLocalizedUpgradeMessage(uid: number, plan: string): string {
  if (plan === 'pro')    return `✅ ${t(uid, 'tariffs.upgrade.pro_max')}`;
  if (plan === 'middle') return t(uid, 'tariffs.upgrade.middle');
  return t(uid, 'tariffs.upgrade.free');
}

export function getResponse(uid: number, key: string, params?: Record<string, string | number>): string {
  return t(uid, key, params);
}

export const RESPONSES = {
  noAccess:        '🔒 No access.',
  pcOffline:       '🖥️ PC Agent offline. Use /link.',
  pcNoDevice:      'No PC paired. Use /link.',
  aiUnavailable:   '⚠️ AI unavailable. Try again shortly.',
  genericError:    'Something went wrong.',
  pcActionBlocked: (r: string) => `⚠️ Blocked: ${r}`,
} as const;
