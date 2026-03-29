import { getNextKey } from '../core/config';
import logger from '../infra/logger';
import db from '../core/db';

interface Message { role: 'user' | 'assistant'; content: string; }

interface ExecutorOptions {
  uid: number;
  messages: Message[];
  systemPrompt?: string;
  byokProvider?: string;
  byokKey?: string;
  onToken?: (token: string) => void;
}

// Get BYOK key for user
function getByokKey(uid: number, provider: string): string | null {
  const user = db.prepare('SELECT byok_keys FROM users WHERE uid = ?').get(uid) as
    { byok_keys: string } | undefined;
  if (!user) return null;
  const keys = JSON.parse(user.byok_keys ?? '{}');
  return keys[provider] ?? null;
}

// ── Provider adapters ─────────────────────────────────────────────────────────

async function callGroq(key: string, messages: Message[], system?: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_tokens: 2048,
    }),
  });
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

async function callGemini(key: string, messages: Message[], system?: string): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: 2048 },
      }),
    }
  );
  const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
  return data.candidates[0].content.parts[0].text;
}

async function callDeepSeek(key: string, messages: Message[], system?: string): Promise<string> {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_tokens: 2048,
    }),
  });
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

async function callClaude(key: string, messages: Message[], system?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system: system ?? undefined,
      messages,
    }),
  });
  const data = await res.json() as { content: { type: string; text: string }[] };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}

async function callOpenRouter(key: string, messages: Message[], system?: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexum.ai',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_tokens: 2048,
    }),
  });
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

// ── Provider order and fallback ──────────────────────────────────────────────

type ProviderFn = (key: string, messages: Message[], system?: string) => Promise<string>;

const PROVIDERS: Array<{ name: string; fn: ProviderFn; keyGetter: () => string | null }> = [
  { name: 'groq',       fn: callGroq,       keyGetter: () => getNextKey('groq') },
  { name: 'gemini',     fn: callGemini,     keyGetter: () => getNextKey('gemini') },
  { name: 'deepseek',   fn: callDeepSeek,   keyGetter: () => getNextKey('deepseek') },
  { name: 'claude',     fn: callClaude,     keyGetter: () => getNextKey('claude') },
  { name: 'openrouter', fn: callOpenRouter, keyGetter: () => getNextKey('openrouter') },
];

export async function executeAI(options: ExecutorOptions): Promise<string> {
  const { uid, messages, systemPrompt, onToken } = options;

  // 1. Try BYOK first
  const byokProviders = ['claude', 'groq', 'gemini', 'deepseek', 'openrouter'];
  for (const prov of byokProviders) {
    const key = getByokKey(uid, prov);
    if (key) {
      const fn = PROVIDERS.find(p => p.name === prov)?.fn;
      if (fn) {
        try {
          logger.debug('executor', `Using BYOK ${prov} for uid=${uid}`);
          const result = await fn(key, messages, systemPrompt);
          if (onToken) onToken(result);
          return result;
        } catch (e) {
          logger.warn('executor', `BYOK ${prov} failed`, e);
        }
      }
    }
  }

  // 2. Rotate through system providers
  for (const provider of PROVIDERS) {
    const key = provider.keyGetter();
    if (!key) continue;
    try {
      logger.debug('executor', `Trying ${provider.name}`);
      const result = await provider.fn(key, messages, systemPrompt);
      if (onToken) onToken(result);
      return result;
    } catch (e) {
      logger.warn('executor', `${provider.name} failed, trying next`, e);
    }
  }

  throw new Error('All AI providers failed');
}

// ── Session helpers ──────────────────────────────────────────────────────────

export function getSession(uid: number): Message[] {
  const row = db.prepare('SELECT messages FROM sessions WHERE uid = ?').get(uid) as
    { messages: string } | undefined;
  return row ? JSON.parse(row.messages) : [];
}

export function addToSession(uid: number, role: 'user' | 'assistant', content: string) {
  const messages = getSession(uid);
  messages.push({ role, content });
  const trimmed = messages.slice(-40); // keep last 40 messages
  db.prepare(
    "INSERT OR REPLACE INTO sessions (uid, messages, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(uid, JSON.stringify(trimmed));
}

export function clearSession(uid: number) {
  db.prepare("DELETE FROM sessions WHERE uid = ?").run(uid);
}
