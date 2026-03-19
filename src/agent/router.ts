// NEXUM AI Router — multi-provider с полным fallback и реальным стримингом токенов

import { config, getKey } from '../core/config';
import { db } from '../core/db';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

// Колбек для стриминга токенов — как в OpenClaw
export type TokenCallback = (token: string) => void;

function getUserApiKey(uid: number, provider: string): string | null {
  const row = db.prepare('SELECT api_key FROM user_api_keys WHERE uid=? AND provider=?').get(uid, provider) as any;
  return row?.api_key || null;
}

async function cerebras(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048, temperature: 0.7 }),
  });
  if (!r.ok) throw new Error(`Cerebras ${r.status}: ${await r.text().catch(()=>'')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function groq(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048, temperature: 0.7 }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text().catch(()=>'')}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function gemini(msgs: Message[], key: string, system: string, vision = false): Promise<string> {
  const model = 'gemini-1.5-flash';
  const contents = msgs.map(m => {
    if (typeof m.content === 'string') return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
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
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, systemInstruction: { role: 'user', parts: [{ text: system }] } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  return ((await r.json()) as any).candidates[0].content.parts[0].text;
}

async function deepseek(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function claudeAI(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 2048, system, messages: msgs }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}`);
  return ((await r.json()) as any).content[0].text;
}

async function grokAI(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'grok-2-1212', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`Grok ${r.status}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function openrouter(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'anthropic/claude-3-haiku', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function sambanova(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'Meta-Llama-3.3-70B-Instruct', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`SambaNova ${r.status}`);
  return ((await r.json()) as any).choices[0].message.content;
}

async function together(msgs: Message[], key: string, system: string): Promise<string> {
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'meta-llama/Llama-3-70b-chat-hf', messages: [{ role:'system', content:system }, ...msgs], max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`Together ${r.status}`);
  return ((await r.json()) as any).choices[0].message.content;
}

// Main chat function with full fallback chain
export async function chat(uid: number, messages: Message[], system: string, hasImage = false): Promise<string> {
  const errors: string[] = [];

  // 1. User's own API keys (highest priority)
  const userPairs: Array<[string, () => Promise<string>]> = [];
  const uCerebras = getUserApiKey(uid, 'cerebras'); if (uCerebras) userPairs.push(['cerebras',   () => cerebras(messages, uCerebras, system)]);
  const uGroq     = getUserApiKey(uid, 'groq');     if (uGroq)     userPairs.push(['groq',        () => groq(messages, uGroq, system)]);
  const uGemini   = getUserApiKey(uid, 'gemini');   if (uGemini)   userPairs.push(['gemini',      () => gemini(messages, uGemini, system, hasImage)]);
  const uOR       = getUserApiKey(uid, 'openrouter'); if (uOR)     userPairs.push(['openrouter',  () => openrouter(messages, uOR, system)]);
  const uDS       = getUserApiKey(uid, 'deepseek'); if (uDS)       userPairs.push(['deepseek',    () => deepseek(messages, uDS, system)]);
  const uClaude   = getUserApiKey(uid, 'claude');   if (uClaude)   userPairs.push(['claude',      () => claudeAI(messages, uClaude, system)]);
  const uGrok     = getUserApiKey(uid, 'grok');     if (uGrok)     userPairs.push(['grok',        () => grokAI(messages, uGrok, system)]);

  for (const [name, fn] of userPairs) {
    try { console.log(`[ai] user_key provider=${name} uid=${uid}`); return await fn(); }
    catch (e: any) { errors.push(`user_${name}: ${e.message?.slice(0,60)}`); }
  }

  // 2. Vision for images
  if (hasImage) {
    const gKey = getKey('gemini');
    if (gKey) {
      try { return await gemini(messages, gKey, system, true); }
      catch (e: any) { errors.push(`gemini_vision: ${e.message?.slice(0,60)}`); }
    }
    const textMessages = messages.map(m => ({
      ...m,
      content: Array.isArray(m.content)
        ? (m.content as any[]).find((c: any) => c.type === 'text')?.text || 'Describe what you see'
        : m.content,
    }));
    return await chat(uid, textMessages, system + '\n[Note: image could not be processed]', false);
  }

  // 3. System keys with full fallback chain
  const k = (p: keyof typeof config.ai) => getKey(p);
  const chain: Array<[string, () => Promise<string>]> = [];
  if (k('cerebras'))   chain.push(['cerebras',   () => cerebras(messages,   k('cerebras')!,  system)]);
  if (k('groq'))       chain.push(['groq',        () => groq(messages,       k('groq')!,      system)]);
  if (k('gemini'))     chain.push(['gemini',      () => gemini(messages,     k('gemini')!,    system)]);
  if (k('grok'))       chain.push(['grok',        () => grokAI(messages,     k('grok')!,      system)]);
  if (k('sambanova'))  chain.push(['sambanova',   () => sambanova(messages,  k('sambanova')!, system)]);
  if (k('together'))   chain.push(['together',    () => together(messages,   k('together')!,  system)]);
  if (k('openrouter')) chain.push(['openrouter',  () => openrouter(messages, k('openrouter')!,system)]);
  if (k('deepseek'))   chain.push(['deepseek',    () => deepseek(messages,   k('deepseek')!,  system)]);
  if (k('claude'))     chain.push(['claude',      () => claudeAI(messages,   k('claude')!,    system)]);

  for (const [name, fn] of chain) {
    try { console.log(`[ai] system provider=${name}`); return await fn(); }
    catch (e: any) { errors.push(`${name}: ${e.message?.slice(0,60)}`); }
  }

  console.error('[ai] all providers failed:', errors);
  throw new Error(`Все AI провайдеры недоступны.\n${errors.slice(0,3).join(', ')}`);
}

// ── Streaming chat — токены приходят через onToken колбек (как OpenClaw) ──────
// Используем Groq/Cerebras которые поддерживают SSE streaming

export async function chatStreaming(
  uid: number,
  messages: Message[],
  system: string,
  onToken: TokenCallback,
): Promise<string> {
  // Try Groq streaming first (fastest SSE)
  const groqKey = getUserApiKey(uid, 'groq') || getKey('groq');
  if (groqKey) {
    try {
      return await streamGroq(messages, groqKey, system, onToken);
    } catch (e: any) {
      console.warn('[stream] groq failed, fallback to non-streaming:', e.message?.slice(0,60));
    }
  }

  // Try Cerebras streaming
  const cbKey = getUserApiKey(uid, 'cerebras') || getKey('cerebras');
  if (cbKey) {
    try {
      return await streamCerebras(messages, cbKey, system, onToken);
    } catch (e: any) {
      console.warn('[stream] cerebras failed:', e.message?.slice(0,60));
    }
  }

  // Fallback — non-streaming, simulate token delivery
  const result = await chat(uid, messages, system);
  // Simulate streaming by delivering result in chunks
  const words = result.split(' ');
  let acc = '';
  for (const word of words) {
    acc += (acc ? ' ' : '') + word;
    onToken(acc);
    await new Promise(r => setTimeout(r, 20));
  }
  return result;
}

async function streamGroq(msgs: Message[], key: string, system: string, onToken: TokenCallback): Promise<string> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text().catch(() => '')}`);
  return readSSEStream(r, onToken);
}

async function streamCerebras(msgs: Message[], key: string, system: string, onToken: TokenCallback): Promise<string> {
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      stream: true,
    }),
  });
  if (!r.ok) throw new Error(`Cerebras ${r.status}: ${await r.text().catch(() => '')}`);
  return readSSEStream(r, onToken);
}

// Parse SSE stream — standard OpenAI format used by Groq/Cerebras/etc
async function readSSEStream(response: Response, onToken: TokenCallback): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          onToken(full); // Pass accumulated text like OpenClaw does
        }
      } catch { /* ignore parse errors */ }
    }
  }

  return full || 'Нет ответа';
}
