// NEXUM Agent Executor — routes messages through tools and LLM

import { config } from '../core/config';
import { db } from '../core/db';
import { getHistory, saveMessage, buildMemoryContext, autoExtract } from './memory';
import { chat } from './router';
import { hasFeature, canSendMessage, getTariffConfig } from '../core/billing';
import { webSearch } from '../tools/search';

export interface ExecuteOptions {
  bot?: any;
  isGroup?: boolean;
  skipLimitCheck?: boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(uid: number, isGroup = false): string {
  const tariff = getTariffConfig(uid);
  const memCtx = hasFeature(uid, 'hasMemory') ? buildMemoryContext(uid) : '';

  const base = `You are NEXUM — a powerful AI assistant inside Telegram.
You are helpful, concise, and smart. You respond in the same language the user writes in.
Current user plan: ${tariff.plan.toUpperCase()}.
${tariff.hasPcAgent ? 'User has PC Agent available.' : ''}
${tariff.hasBYOK ? 'User has brought their own API keys.' : ''}`;

  const groupNote = isGroup
    ? '\n\nYou are in a group chat. Be brief and relevant. Only respond when directly addressed.'
    : '';

  return base + groupNote + memCtx;
}

// ── Tool detector ─────────────────────────────────────────────────────────────

interface ToolCall {
  tool: string;
  args: string;
}

function detectToolCall(text: string): ToolCall | null {
  const lower = text.toLowerCase();

  // Web search triggers
  if (
    lower.startsWith('search ') ||
    lower.startsWith('find ') ||
    lower.includes('search for ') ||
    lower.includes('look up ') ||
    lower.includes('what is the latest') ||
    lower.includes('current news') ||
    lower.includes('google ')
  ) {
    const query = text
      .replace(/^(search|find|google)\s+/i, '')
      .replace(/search for\s+/i, '')
      .replace(/look up\s+/i, '')
      .trim();
    return { tool: 'search', args: query };
  }

  return null;
}

// ── Main execute function ─────────────────────────────────────────────────────

export async function execute(
  uid: number,
  userMessage: string,
  options: ExecuteOptions = {}
): Promise<string> {
  const { bot, isGroup = false, skipLimitCheck = false } = options;

  // Check rate limit
  if (!skipLimitCheck) {
    const limit = canSendMessage(uid);
    if (!limit.ok) return limit.reason!;
  }

  // Detect and handle tool calls
  const toolCall = detectToolCall(userMessage);
  if (toolCall) {
    if (toolCall.tool === 'search') {
      try {
        const results = await webSearch(toolCall.args);
        if (results) {
          // Pass search results to LLM for summarization
          const searchPrompt = `User asked: "${userMessage}"\n\nSearch results:\n${results}\n\nPlease provide a helpful, well-organized response based on these search results.`;
          const history = getHistory(uid, 10);
          const messages = [
            ...history.map(h => ({ role: h.role as any, content: h.content })),
            { role: 'user' as const, content: searchPrompt },
          ];
          const system = buildSystemPrompt(uid, isGroup);
          const response = await chat(uid, messages, system);
          saveMessage(uid, 'user', userMessage);
          saveMessage(uid, 'assistant', response);
          return response;
        }
      } catch (e: any) {
        console.error('[executor] search error:', e.message);
        // Fall through to regular chat
      }
    }
  }

  // Regular chat
  const history = getHistory(uid, 20);
  const messages = [
    ...history.map(h => ({ role: h.role as any, content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];
  const system = buildSystemPrompt(uid, isGroup);

  const response = await chat(uid, messages, system);
  saveMessage(uid, 'user', userMessage);
  saveMessage(uid, 'assistant', response);

  if (hasFeature(uid, 'hasMemory')) {
    autoExtract(uid, userMessage);
  }

  return response;
}

// ── Background subagent ───────────────────────────────────────────────────────

export interface SubagentResult {
  id: string;
  status: 'done' | 'error';
  result?: string;
  error?: string;
}

export async function runSubagent(
  uid: number,
  task: string
): Promise<{ id: string }> {
  if (!hasFeature(uid, 'hasSubagents')) {
    throw new Error('Subagents require Pro plan. See /tariffs');
  }

  const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  (db as any).prepare(
    `INSERT INTO subagent_runs (id, uid, task, status) VALUES (?,?,?,'pending')`
  ).run(id, uid, task);

  // Run async
  (async () => {
    try {
      const system = `You are a background AI task executor. Complete the following task thoroughly and return a detailed result.\nTask: ${task}`;
      const messages = [{ role: 'user' as const, content: `Please complete this task: ${task}` }];
      const result = await chat(uid, messages, system);

      (db as any).prepare(
        `UPDATE subagent_runs SET status='done', result=?, finished_at=datetime('now') WHERE id=?`
      ).run(result, id);
    } catch (e: any) {
      (db as any).prepare(
        `UPDATE subagent_runs SET status='error', error=?, finished_at=datetime('now') WHERE id=?`
      ).run(e.message, id);
    }
  })();

  return { id };
}

export function getSubagentResult(id: string): any {
  return (db as any).prepare(`SELECT * FROM subagent_runs WHERE id=?`).get(id);
}

export function listSubagents(uid: number): any[] {
  return (db as any).prepare(
    `SELECT id, task, status, started_at FROM subagent_runs WHERE uid=? ORDER BY started_at DESC LIMIT 10`
  ).all(uid) as any[] || [];
}
