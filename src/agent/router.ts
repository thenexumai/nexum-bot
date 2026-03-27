// NEXUM AI Router — multi-provider with fallback chain and streaming

import { config, getKey } from '../core/config';
import { db } from '../core/db';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export type StreamCallback = (accumulated: string) => void;

function getUserApiKey(uid: number, provider: string): string | null {
  const row = (db as any).prepare(
    'SELECT api_key FROM user_api_keys WHERE uid=? AND provider=?'
  ).get(uid, provider) as any;
  return row?.api_key || null;
}

// ── Provider implementations ──────────────────────────────────────────────────

async function callCerebras(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`Cerebras ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callGroq(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callGemini(msgs: Message[], key: string, system: string, vision = false): Promise<string> {
  const model = vision ? 'gemini-1.5-flash' : 'gemini-1.5-flash';
  const contents = msgs.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    }
    const parts = (m.content as any[]).map((c: any) => {
      if (c.type === 'image_url') {
        const b64 = c.image_url.url.replace(/^data:[^;]+;base64,/, '');
        const mime = c.image_url.url.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
        return { inlineData: { mimeType: mime, data: b64 } };
      }
      return { text: c.text || '' };
    });
    return { role: 'user', parts };
  });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { role: 'user', parts: [{ text: system }] },
      }),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).candidates[0].content.parts[0].text;
}

async function callDeepSeek(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callClaude(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      system,
      messages: msgs.filter(m => m.role !== 'system'),
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).content[0].text;
}

async function callGrok(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-2-1212',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
    }),
  });
  if (!r.ok) throw new Error(`Grok ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callOpenRouter(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-3-haiku',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callSambanova(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Meta-Llama-3.3-70B-Instruct',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
    }),
  });
  if (!r.ok) throw new Error(`SambaNova ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function callTogether(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/Llama-3-70b-chat-hf',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
    }),
  });
  if (!r.ok) throw new Error(`Together ${r.status}: ${await r.text().catch(() => '')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

// ── Main chat function ────────────────────────────────────────────────────────

export async function chat(
  uid: number,
  messages: Message[],
  system: string,
  hasImage = false
): Promise<string> {
  const errors: string[] = [];

  // 1. User's own API keys take highest priority (BYOK)
  const userProviders: Array<[string, () => Promise<string>]> = [];

  const uCerebras = getUserApiKey(uid, 'cerebras');
  if (uCerebras) userProviders.push(['cerebras', () => callCerebras(messages, uCerebras, system)]);

  const uGroq = getUserApiKey(uid, 'groq');
  if (uGroq) userProviders.push(['groq', () => callGroq(messages, uGroq, system)]);

  const uGemini = getUserApiKey(uid, 'gemini');
  if (uGemini) userProviders.push(['gemini', () => callGemini(messages, uGemini, system, hasImage)]);

  const uDeepSeek = getUserApiKey(uid, 'deepseek');
  if (uDeepSeek) userProviders.push(['deepseek', () => callDeepSeek(messages, uDeepSeek, system)]);

  const uClaude = getUserApiKey(uid, 'claude');
  if (uClaude) userProviders.push(['claude', () => callClaude(messages, uClaude, system)]);

  const uGrok = getUserApiKey(uid, 'grok');
  if (uGrok) userProviders.push(['grok', () => callGrok(messages, uGrok, system)]);

  const uOR = getUserApiKey(uid, 'openrouter');
  if (uOR) userProviders.push(['openrouter', () => callOpenRouter(messages, uOR, system)]);

  for (const [name, fn] of userProviders) {
    try {
      console.log(`[ai] byok provider=${name} uid=${uid}`);
      return await fn();
    } catch (e: any) {
      errors.push(`byok_${name}: ${e.message?.slice(0, 60)}`);
    }
  }

  // 2. Vision path (images need Gemini)
  if (hasImage) {
    const gKey = getKey('gemini');
    if (gKey) {
      try { return await callGemini(messages, gKey, system, true); }
      catch (e: any) { errors.push(`sys_gemini_vision: ${e.message?.slice(0, 60)}`); }
    }
    // Fall through to text-only with image stripped
    const textMsgs = messages.map(m => ({
      ...m,
      content: Array.isArray(m.content)
        ? (m.content as any[]).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
        : m.content,
    }));
    return chat(uid, textMsgs, system, false);
  }

  // 3. System key fallback chain (fastest to most capable)
  const systemProviders: Array<[string, () => Promise<string>]> = [];

  const cbKey = getKey('cerebras');
  if (cbKey) systemProviders.push(['cerebras', () => callCerebras(messages, cbKey, system)]);

  const grKey = getKey('groq');
  if (grKey) systemProviders.push(['groq', () => callGroq(messages, grKey, system)]);

  const snKey = getKey('sambanova');
  if (snKey) systemProviders.push(['sambanova', () => callSambanova(messages, snKey, system)]);

  const toKey = getKey('together');
  if (toKey) systemProviders.push(['together', () => callTogether(messages, toKey, system)]);

  const gKey2 = getKey('gemini');
  if (gKey2) systemProviders.push(['gemini', () => callGemini(messages, gKey2, system)]);

  const dsKey = getKey('deepseek');
  if (dsKey) systemProviders.push(['deepseek', () => callDeepSeek(messages, dsKey, system)]);

  const gkKey = getKey('grok');
  if (gkKey) systemProviders.push(['grok', () => callGrok(messages, gkKey, system)]);

  const orKey = getKey('openrouter');
  if (orKey) systemProviders.push(['openrouter', () => callOpenRouter(messages, orKey, system)]);

  const clKey = getKey('claude');
  if (clKey) systemProviders.push(['claude', () => callClaude(messages, clKey, system)]);

  for (const [name, fn] of systemProviders) {
    try {
      console.log(`[ai] sys provider=${name} uid=${uid}`);
      return await fn();
    } catch (e: any) {
      errors.push(`sys_${name}: ${e.message?.slice(0, 60)}`);
    }
  }

  // All failed
  const errSummary = errors.slice(-3).join('; ');
  throw new Error(`All AI providers failed. Last errors: ${errSummary}`);
}

// ── Streaming wrapper (simulated — polls completion) ─────────────────────────
// Real token streaming is complex across providers; we simulate with a single call
// and invoke the callback once with the full result.

export async function chatStreaming(
  uid: number,
  messages: Message[],
  system: string,
  onUpdate: StreamCallback
): Promise<string> {
  const result = await chat(uid, messages, system, false);
  // Simulate progressive streaming for better UX
  const words = result.split(' ');
  let accumulated = '';
  const chunkSize = Math.max(5, Math.floor(words.length / 10));

  for (let i = 0; i < words.length; i += chunkSize) {
    accumulated = words.slice(0, i + chunkSize).join(' ');
    onUpdate(accumulated);
    if (i + chunkSize < words.length) {
      await new Promise(r => setTimeout(r, 80));
    }
  }

  onUpdate(result);
  return result;
}
