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

// ── System prompt builder (OpenClaw-style) ────────────────────────────────────

export function buildSystemPrompt(uid: number): string {
  const memories = getMemories(uid).filter(m => !['voice_mode', 'voice_lang', 'voice_idx'].includes(m.key));
  const isAdmin = config.adminIds.includes(uid);

  const sections: string[] = [];

  sections.push(`# Identity
You are NEXUM — a personal autonomous AI assistant running in Telegram.
You are fast, precise, and genuinely helpful. You speak like a smart friend, not a corporate bot.
You have tools you can use to take real actions for the user.`);

  sections.push(`# Personality
- Be direct and efficient. No filler phrases.
- Respond in the user's language (auto-detect).
- Use markdown for code and structure when helpful.
- Don't start responses with "Of course!", "Sure!", "Great question!" etc.
- Keep responses concise unless detail is needed.
- Remember context from the conversation.`);

  if (isAdmin) {
    sections.push(`# Role
You are talking to the ADMIN. The admin has full system access.
Admin can use all commands including /admin_* commands, broadcast, view all user stats.`);
  }

  if (memories.length > 0) {
    sections.push(`# What I know about this user
${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`);
  }

  sections.push(`# Tools available
You can call tools by writing [TOOL:tool_name|args] anywhere in your response.
Available tools:
${TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Example: To search the web write [TOOL:search|latest AI news]
Example: To save a note write [TOOL:note_save|Meeting notes|Discussed project timeline]

After tool output is returned to you, incorporate it naturally into your response.`);

  sections.push(`# Context
Telegram bot. Messages can include text, images, voice, documents.
WEBAPP_URL: ${config.webappUrl}`);

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
