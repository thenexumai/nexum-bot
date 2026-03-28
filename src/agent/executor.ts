/**
 * NEXUM Agent Executor
 * Central pipeline: rate limit → intent detect → tool detect → context build → LLM → memory save
 */

import { getTariffConfig, hasFeature, canSendMessage } from '../core/billing';
import { db } from '../core/db';
import { getHistory, saveMessage, buildMemoryContext, autoExtract } from './memory';
import { chat, chatStreaming, type Message, type StreamCallback } from './router';
import { buildSystemPrompt } from './persona';
import { webSearch } from '../tools/search';
import { detectIntent, formatAmount, type FinanceIntent } from './intents';
import { createLogger } from '../infra/logger';

export { chatStreaming, type StreamCallback };

const log = createLogger('executor');

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildPrompt(uid: number, isGroup = false): string {
  const tariff = getTariffConfig(uid);
  const memoryContext = hasFeature(uid, 'hasMemory') ? buildMemoryContext(uid) : '';
  return buildSystemPrompt({ tariff, memoryContext, isGroup, uid });
}

// ── Search intent detection ───────────────────────────────────────────────────

function detectSearch(text: string): string | null {
  const lo = text.toLowerCase();
  const triggers = ['search ', 'find ', 'look up ', 'google ', 'what is the latest', 'current news'];
  if (!triggers.some(t => lo.includes(t))) return null;
  return text.replace(/^(search|find|google)\s+/i, '')
             .replace(/search for\s+/i, '')
             .replace(/look up\s+/i, '').trim();
}

// ── Finance intent handler ────────────────────────────────────────────────────

function handleFinanceIntent(uid: number, intent: FinanceIntent): string {
  try {
    db.prepare(`
      INSERT INTO finance (uid, type, amount, category, note, currency)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uid, intent.financeType, intent.amount, intent.category, intent.note, intent.currency);

    const sign = intent.financeType === 'income' ? '+' : '-';
    const formattedAmount = formatAmount(intent.amount, intent.currency);
    const categoryLabel = intent.category === 'other' ? '' : ` (${intent.category})`;

    log.info(`Finance recorded uid=${uid} type=${intent.financeType} amount=${intent.amount} ${intent.currency}`);

    return `✅ Записал в финансы: ${sign}${formattedAmount}${categoryLabel}`;
  } catch (e) {
    log.error(`Finance insert error: ${(e as Error).message}`);
    return '❌ Не удалось записать в финансы. Попробуй снова.';
  }
}

// ── Main execute ──────────────────────────────────────────────────────────────

export interface ExecuteOptions {
  isGroup?: boolean;
  skipLimitCheck?: boolean;
}

export async function execute(
  uid: number,
  userMessage: string,
  options: ExecuteOptions = {}
): Promise<string> {
  const { isGroup = false, skipLimitCheck = false } = options;

  if (!skipLimitCheck) {
    const limit = canSendMessage(uid);
    if (!limit.ok) return limit.reason!;
  }

  // ── Intent detection ───────────────────────────────────────────────────────
  const intent = detectIntent(userMessage);

  if (intent.type === 'finance') {
    const response = handleFinanceIntent(uid, intent);
    saveMessage(uid, 'user', userMessage);
    saveMessage(uid, 'assistant', response);
    return response;
  }

  // ── Tool: web search ───────────────────────────────────────────────────────
  const searchQuery = detectSearch(userMessage);
  if (searchQuery) {
    try {
      const results = await webSearch(searchQuery);
      if (results) {
        const prompt = `User asked: "${userMessage}"\n\nSearch results:\n${results}\n\nProvide a helpful, concise response.`;
        const history = getHistory(uid, 10);
        const messages: Message[] = [
          ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user', content: prompt },
        ];
        const response = await chat(uid, messages, buildPrompt(uid, isGroup));
        saveMessage(uid, 'user', userMessage);
        saveMessage(uid, 'assistant', response);
        return response;
      }
    } catch (e) {
      log.warn(`Search error: ${(e as Error).message}`);
    }
  }

  // ── Regular chat ───────────────────────────────────────────────────────────
  const history = getHistory(uid, 20);
  const messages: Message[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await chat(uid, messages, buildPrompt(uid, isGroup));
  saveMessage(uid, 'user', userMessage);
  saveMessage(uid, 'assistant', response);

  if (hasFeature(uid, 'hasMemory')) autoExtract(uid, userMessage);

  return response;
}

// ── Background subagents ──────────────────────────────────────────────────────

export interface SubagentRun {
  id: string;
  task: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  error?: string;
  started_at: string;
}

export async function runSubagent(uid: number, task: string): Promise<{ id: string }> {
  if (!hasFeature(uid, 'hasSubagents')) {
    throw new Error('Background tasks require Pro plan — /tariffs');
  }

  const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`INSERT INTO subagent_runs (id, uid, task, status) VALUES (?, ?, ?, 'pending')`).run(id, uid, task);

  (async () => {
    try {
      db.prepare(`UPDATE subagent_runs SET status='running' WHERE id=?`).run(id);
      const system = `You are a background task executor. Complete the task and return a clear, structured result.`;
      const result = await chat(uid, [{ role: 'user', content: task }], system);
      db.prepare(`UPDATE subagent_runs SET status='done', result=?, finished_at=datetime('now') WHERE id=?`).run(result, id);
    } catch (e) {
      db.prepare(`UPDATE subagent_runs SET status='error', error=?, finished_at=datetime('now') WHERE id=?`)
        .run((e as Error).message, id);
    }
  })();

  return { id };
}

export function getSubagentResult(id: string): SubagentRun | undefined {
  return db.prepare(`SELECT * FROM subagent_runs WHERE id=?`).get(id) as SubagentRun | undefined;
}

export function listSubagents(uid: number): SubagentRun[] {
  return db.prepare(
    `SELECT id, task, status, started_at FROM subagent_runs WHERE uid=? ORDER BY started_at DESC LIMIT 10`
  ).all(uid) as SubagentRun[];
}
