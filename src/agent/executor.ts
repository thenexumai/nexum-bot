// NEXUM Agent Executor — OpenClaw-style autonomous agent

import { chat } from './router';
import { getMemories, getHistory, saveMessage, autoExtract } from './memory';
import { config } from '../core/config';
import { db } from '../core/db';
import { webSearch } from '../tools/search';

// ── Tool definitions (OpenClaw-style) ────────────────────────────────────────

interface Tool {
  name: string;
  description: string;
  handler: (uid: number, args: string) => Promise<string>;
}

const TOOLS: Tool[] = [
  {
    name: 'search',
    description: 'Search the web. Args: query string',
    handler: async (_uid, args) => webSearch(args),
  },
  {
    name: 'note_save',
    description: 'Save a note. Args: title|content',
    handler: async (uid, args) => {
      const [title, content] = args.split('|').map(s => s.trim());
      if (!title || !content) return 'Error: use "title|content"';
      db.prepare('INSERT INTO notes (uid, title, content) VALUES (?,?,?)').run(uid, title, content);
      return `Note saved: "${title}"`;
    },
  },
  {
    name: 'task_create',
    description: 'Create a task. Args: title|priority(optional)',
    handler: async (uid, args) => {
      const [title, priority = 'medium'] = args.split('|').map(s => s.trim());
      db.prepare('INSERT INTO tasks (uid, title, priority) VALUES (?,?,?)').run(uid, title, priority);
      return `Task created: "${title}" [${priority}]`;
    },
  },
  {
    name: 'finance_add',
    description: 'Add a finance entry. Args: type(income/expense)|amount|category|note',
    handler: async (uid, args) => {
      const [type, amount, category = 'other', note = ''] = args.split('|').map(s => s.trim());
      db.prepare('INSERT INTO finance (uid, type, amount, category, note) VALUES (?,?,?,?,?)').run(uid, type, parseFloat(amount), category, note);
      return `Finance entry added: ${type} ${amount} (${category})`;
    },
  },
  {
    name: 'memory_save',
    description: 'Save a fact about the user. Args: key|value',
    handler: async (uid, args) => {
      const [key, value] = args.split('|').map(s => s.trim());
      const { saveMemory } = await import('./memory');
      saveMemory(uid, key, value);
      return `Remembered: ${key} = ${value}`;
    },
  },
  {
    name: 'reminder_set',
    description: 'Set a reminder. Args: text|minutes_from_now',
    handler: async (uid, args) => {
      const [text, minsStr] = args.split('|').map(s => s.trim());
      const mins = parseInt(minsStr) || 30;
      const fireAt = new Date(Date.now() + mins * 60000).toISOString();
      const chatId = db.prepare('SELECT uid FROM users WHERE uid=?').get(uid) as any;
      db.prepare('INSERT INTO reminders (uid, chat_id, text, fire_at) VALUES (?,?,?,?)').run(uid, uid, text, fireAt);
      return `Reminder set for ${mins} minutes: "${text}"`;
    },
  },
];

// ── System prompt builder ─────────────────────────────────────────────────────

export function buildSystemPrompt(uid: number): string {
  const memories = getMemories(uid).filter(m => !['voice_mode', 'voice_lang', 'voice_idx'].includes(m.key));
  const isAdmin = config.adminIds.includes(uid);

  const sections: string[] = [];

  sections.push(`# Личность
Ты NEXUM — личный AI-ассистент. Умный, быстрый, полезный. Говоришь как умный друг, не как робот.
Отвечаешь на языке пользователя. Без лишних слов. Без "Конечно!", "Отлично!", "Я понял!".`);

  if (isAdmin) {
    sections.push(`# Роль
Это ADMIN. Полный доступ ко всем командам системы.`);
  }

  if (memories.length > 0) {
    sections.push(`# Что я знаю о пользователе
${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`);
  }

  sections.push(`# Инструменты — используй АВТОМАТИЧЕСКИ когда нужно

Когда пользователь говорит о деньгах, доходах, расходах — СРАЗУ вызови finance_add.
Когда упоминает задачу, дело, нужно сделать — СРАЗУ вызови task_create.
Когда хочет запомнить что-то или сохранить заметку — СРАЗУ вызови note_save.
Когда спрашивает что-то актуальное — СРАЗУ вызови search.
Когда говорит что-то о себе (имя, город, работа) — СРАЗУ вызови memory_save.

Синтаксис вызова: [TOOL:название|аргументы]

Доступные инструменты:
- [TOOL:search|запрос] — поиск в интернете
- [TOOL:finance_add|income|сумма|категория|описание] — записать доход
- [TOOL:finance_add|expense|сумма|категория|описание] — записать расход
- [TOOL:task_create|название|приоритет] — создать задачу (приоритет: high/medium/low)
- [TOOL:note_save|заголовок|текст] — сохранить заметку
- [TOOL:memory_save|ключ|значение] — запомнить факт о пользователе
- [TOOL:reminder_set|текст|минуты] — поставить напоминание

Примеры:
Пользователь: "пришла зарплата 5000"
Ответ: Записал твою зарплату! [TOOL:finance_add|income|5000|salary|Зарплата]

Пользователь: "нужно купить молоко"
Ответ: Добавил в задачи! [TOOL:task_create|Купить молоко|low]

Пользователь: "потратил 200 на еду"
Ответ: Записал расход! [TOOL:finance_add|expense|200|food|Еда]

ВАЖНО: Сначала скажи что делаешь, потом вызови инструмент. Не жди подтверждения — действуй сразу.`);

  return sections.join('\n\n');
}

// ── Tool call parser ──────────────────────────────────────────────────────────

async function executeToolCalls(uid: number, text: string): Promise<{ text: string; toolResults: string[] }> {
  const toolRegex = /\[TOOL:([^\]|]+)\|?([^\]]*)\]/g;
  const results: string[] = [];
  let processedText = text;

  let match;
  while ((match = toolRegex.exec(text)) !== null) {
    const [fullMatch, toolName, args] = match;
    const tool = TOOLS.find(t => t.name === toolName.trim());
    if (!tool) continue;

    try {
      const result = await tool.handler(uid, args || '');
      results.push(`[${toolName}]: ${result}`);
      processedText = processedText.replace(fullMatch, `\n> ${result}\n`);
    } catch (e: any) {
      const err = `[${toolName}]: Error — ${e.message}`;
      results.push(err);
      processedText = processedText.replace(fullMatch, '');
    }
  }

  return { text: processedText.trim(), toolResults: results };
}

// ── Main execute function ─────────────────────────────────────────────────────

export async function execute(userId: number, input: string, hasImage = false): Promise<string> {
  try {
    // Auto-extract facts from user message
    autoExtract(userId, input);

    const systemPrompt = buildSystemPrompt(userId);
    const history = getHistory(userId, 20);

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: input },
    ];

    let response = await chat(userId, messages, systemPrompt, hasImage);

    // Execute any tool calls in response
    const { text: processedResponse } = await executeToolCalls(userId, response);
    const finalResponse = processedResponse || response;

    // If tools were called, do a follow-up with results
    if (processedResponse !== response && processedResponse.includes('>')) {
      const followUpMessages = [
        ...messages,
        { role: 'assistant' as const, content: response },
        { role: 'user' as const, content: `Tool results received. Summarize what was done and what the result is for the user.` },
      ];
      const followUp = await chat(userId, followUpMessages, systemPrompt);
      saveMessage(userId, 'user', input);
      saveMessage(userId, 'assistant', followUp);
      return followUp;
    }

    saveMessage(userId, 'user', input);
    saveMessage(userId, 'assistant', finalResponse);

    return finalResponse;
  } catch (error: any) {
    console.error('Execute error:', error);
    return `Ошибка: ${error.message || 'Что-то пошло не так. Попробуй ещё раз.'}`;
  }
}

// ── Subagent runner (OpenClaw-style background tasks) ─────────────────────────

export async function runSubagent(uid: number, task: string, bot: any): Promise<string> {
  const runId = require('crypto').randomUUID().slice(0, 8);

  db.prepare(`INSERT INTO subagent_runs (id, uid, task, status) VALUES (?,?,?,'running')`).run(runId, uid, task);

  // Notify user
  try {
    await bot.api.sendMessage(uid, `Started background task [${runId}]:\n${task.slice(0, 100)}`);
  } catch {}

  // Run async
  (async () => {
    try {
      const systemPrompt = buildSystemPrompt(uid) + '\n\nYou are running as a background subagent. Complete the task autonomously.';
      const messages = [{ role: 'user' as const, content: task }];
      const result = await chat(uid, messages, systemPrompt);

      db.prepare(`UPDATE subagent_runs SET status='done', result=?, finished_at=datetime('now') WHERE id=?`).run(result.slice(0, 2000), runId);

      await bot.api.sendMessage(uid, `Subagent [${runId}] done:\n\n${result.slice(0, 3000)}`);
    } catch (e: any) {
      db.prepare(`UPDATE subagent_runs SET status='error', error=?, finished_at=datetime('now') WHERE id=?`).run(e.message, runId);
      await bot.api.sendMessage(uid, `Subagent [${runId}] failed: ${e.message}`).catch(() => {});
    }
  })();

  return runId;
}

export default { execute, buildSystemPrompt, runSubagent };
