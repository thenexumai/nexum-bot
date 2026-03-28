/**
 * NEXUM AI Router
 *
 * Multi-provider with real SSE streaming support.
 * BYOK keys → system fallback chain.
 *
 * Streaming works like OpenClaw:
 *  - tokens arrive via SSE from the LLM
 *  - each token delta is appended to accumulated text
 *  - onChunk(accumulated) is called after each token
 *  - Telegram edits the message in-place → text appears to grow
 */

import { getProviderKey, type AiProvider } from '../core/config';
import { getUserApiKey } from '../core/db';
import { createLogger } from '../infra/logger';

const log = createLogger('router');

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export type StreamCallback = (accumulated: string) => void;

// ── Real SSE streaming for OpenAI-compatible providers ───────────────────────

async function streamOpenAICompat(
  baseUrl: string,
  key: string,
  model: string,
  msgs: Message[],
  system: string,
  name: string,
  onChunk: StreamCallback
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${name} ${response.status}: ${body.slice(0, 150)}`);
  }

  if (!response.body) throw new Error(`${name}: no response body`);

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer      = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data) as {
          choices: [{ delta: { content?: string }; finish_reason?: string }];
        };
        const delta = parsed.choices[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          onChunk(accumulated);
        }
      } catch {
        // Malformed SSE chunk — skip silently
      }
    }
  }

  return accumulated || '';
}

// Non-streaming fallback (for providers that don't support stream=true well)
async function callOpenAICompat(
  baseUrl: string, key: string, model: string,
  msgs: Message[], system: string, name: string
): Promise<string> {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...msgs],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 150)}`);
  return ((await r.json()) as { choices: [{ message: { content: string } }] }).choices[0].message.content;
}

// ── Gemini (doesn't support standard SSE format easily — use non-streaming) ──

async function callGemini(
  msgs: Message[], key: string, system: string, vision = false
): Promise<string> {
  const contents = msgs.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    }
    return {
      role: 'user',
      parts: (m.content as ContentPart[]).map(c => {
        if (c.type === 'image_url' && c.image_url) {
          const b64  = c.image_url.url.replace(/^data:[^;]+;base64,/, '');
          const mime = c.image_url.url.match(/^data:([^;]+)/)?.[1] ?? 'image/jpeg';
          return { inlineData: { mimeType: mime, data: b64 } };
        }
        return { text: c.text ?? '' };
      }),
    };
  });

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { role: 'user', parts: [{ text: system }] },
      }),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text().catch(() => '')).slice(0, 150)}`);
  return ((await r.json()) as { candidates: [{ content: { parts: [{ text: string }] } }] })
    .candidates[0].content.parts[0].text;
}

// ── Claude (Anthropic SSE streaming) ─────────────────────────────────────────

async function streamClaude(
  msgs: Message[], key: string, system: string,
  onChunk: StreamCallback
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      stream: true,
      messages: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude ${response.status}: ${body.slice(0, 150)}`);
  }

  if (!response.body) throw new Error('Claude: no response body');

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer      = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          accumulated += parsed.delta.text;
          onChunk(accumulated);
        }
      } catch { /* skip */ }
    }
  }

  return accumulated || '';
}

// ── Provider streaming map ────────────────────────────────────────────────────

// Providers confirmed to support stream=true well
const STREAMING_PROVIDERS: Partial<Record<AiProvider, {
  stream: (msgs: Message[], key: string, system: string, onChunk: StreamCallback) => Promise<string>;
  call:   (msgs: Message[], key: string, system: string) => Promise<string>;
}>> = {
  cerebras: {
    stream: (m, k, s, cb) => streamOpenAICompat('https://api.cerebras.ai/v1', k, 'llama-3.3-70b', m, s, 'Cerebras', cb),
    call:   (m, k, s)     => callOpenAICompat('https://api.cerebras.ai/v1', k, 'llama-3.3-70b', m, s, 'Cerebras'),
  },
  groq: {
    stream: (m, k, s, cb) => streamOpenAICompat('https://api.groq.com/openai/v1', k, 'llama-3.3-70b-versatile', m, s, 'Groq', cb),
    call:   (m, k, s)     => callOpenAICompat('https://api.groq.com/openai/v1', k, 'llama-3.3-70b-versatile', m, s, 'Groq'),
  },
  deepseek: {
    stream: (m, k, s, cb) => streamOpenAICompat('https://api.deepseek.com/v1', k, 'deepseek-chat', m, s, 'DeepSeek', cb),
    call:   (m, k, s)     => callOpenAICompat('https://api.deepseek.com/v1', k, 'deepseek-chat', m, s, 'DeepSeek'),
  },
  grok: {
    stream: (m, k, s, cb) => streamOpenAICompat('https://api.x.ai/v1', k, 'grok-2-1212', m, s, 'Grok', cb),
    call:   (m, k, s)     => callOpenAICompat('https://api.x.ai/v1', k, 'grok-2-1212', m, s, 'Grok'),
  },
  openrouter: {
    stream: (m, k, s, cb) => streamOpenAICompat('https://openrouter.ai/api/v1', k, 'anthropic/claude-3-haiku', m, s, 'OpenRouter', cb),
    call:   (m, k, s)     => callOpenAICompat('https://openrouter.ai/api/v1', k, 'anthropic/claude-3-haiku', m, s, 'OpenRouter'),
  },
  claude: {
    stream: (m, k, s, cb) => streamClaude(m, k, s, cb),
    call:   (m, k, s)     => callOpenAICompat('https://api.anthropic.com/v1', k, 'claude-3-haiku-20240307', m, s, 'Claude'),
  },
  // Non-streaming (use call only, onChunk gets full result at end)
  gemini: {
    stream: async (m, k, s, cb) => { const r = await callGemini(m, k, s); cb(r); return r; },
    call:   (m, k, s)           => callGemini(m, k, s),
  },
  sambanova: {
    stream: async (m, k, s, cb) => streamOpenAICompat('https://api.sambanova.ai/v1', k, 'Meta-Llama-3.3-70B-Instruct', m, s, 'SambaNova', cb),
    call:   (m, k, s)           => callOpenAICompat('https://api.sambanova.ai/v1', k, 'Meta-Llama-3.3-70B-Instruct', m, s, 'SambaNova'),
  },
  together: {
    stream: async (m, k, s, cb) => streamOpenAICompat('https://api.together.xyz/v1', k, 'meta-llama/Llama-3-70b-chat-hf', m, s, 'Together', cb),
    call:   (m, k, s)           => callOpenAICompat('https://api.together.xyz/v1', k, 'meta-llama/Llama-3-70b-chat-hf', m, s, 'Together'),
  },
};

// Priority order
const FALLBACK_ORDER: AiProvider[] = ['cerebras','groq','sambanova','together','gemini','deepseek','grok','openrouter','claude'];
const BYOK_ORDER:     AiProvider[] = ['cerebras','groq','gemini','deepseek','claude','grok','openrouter'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Non-streaming chat. Used for commands, tools, background tasks.
 */
export async function chat(
  uid: number,
  messages: Message[],
  system: string,
  hasImage = false
): Promise<string> {
  const errors: string[] = [];

  // 1. BYOK first
  for (const provider of BYOK_ORDER) {
    const key = getUserApiKey(uid, provider);
    if (!key) continue;
    const p = STREAMING_PROVIDERS[provider];
    if (!p) continue;
    // For vision, only Gemini
    if (hasImage && provider !== 'gemini') continue;
    try {
      log.debug(`BYOK call uid=${uid} provider=${provider}`);
      return await p.call(messages, key, system);
    } catch (e) {
      errors.push(`byok_${provider}: ${(e as Error).message?.slice(0, 60)}`);
    }
  }

  // 2. Vision → Gemini only
  if (hasImage) {
    const k = getProviderKey('gemini');
    if (k) {
      try { return await callGemini(messages, k, system, true); }
      catch (e) { errors.push(`gemini_vision: ${(e as Error).message?.slice(0, 60)}`); }
    }
    const textMsgs = messages.map(m => ({
      ...m,
      content: Array.isArray(m.content)
        ? (m.content as ContentPart[]).filter(c => c.type === 'text').map(c => c.text ?? '').join(' ')
        : m.content,
    }));
    return chat(uid, textMsgs, system, false);
  }

  // 3. System fallback
  for (const provider of FALLBACK_ORDER) {
    const key = getProviderKey(provider);
    if (!key) continue;
    const p = STREAMING_PROVIDERS[provider];
    if (!p) continue;
    try {
      log.debug(`SYS call uid=${uid} provider=${provider}`);
      return await p.call(messages, key, system);
    } catch (e) {
      errors.push(`sys_${provider}: ${(e as Error).message?.slice(0, 60)}`);
    }
  }

  throw new Error(`All AI providers unavailable. ${errors.slice(-3).join('; ')}`);
}

/**
 * Real SSE streaming chat.
 * onChunk is called with ACCUMULATED text after each token — not deltas.
 * Telegram edits in-place → text grows visibly, OpenClaw-style.
 */
export async function chatStreaming(
  uid: number,
  messages: Message[],
  system: string,
  onChunk: StreamCallback
): Promise<string> {
  const errors: string[] = [];

  // 1. BYOK first
  for (const provider of BYOK_ORDER) {
    const key = getUserApiKey(uid, provider);
    if (!key) continue;
    const p = STREAMING_PROVIDERS[provider];
    if (!p) continue;
    try {
      log.debug(`BYOK stream uid=${uid} provider=${provider}`);
      return await p.stream(messages, key, system, onChunk);
    } catch (e) {
      errors.push(`byok_${provider}: ${(e as Error).message?.slice(0, 60)}`);
    }
  }

  // 2. System fallback with streaming
  for (const provider of FALLBACK_ORDER) {
    const key = getProviderKey(provider);
    if (!key) continue;
    const p = STREAMING_PROVIDERS[provider];
    if (!p) continue;
    try {
      log.debug(`SYS stream uid=${uid} provider=${provider}`);
      return await p.stream(messages, key, system, onChunk);
    } catch (e) {
      errors.push(`sys_${provider}: ${(e as Error).message?.slice(0, 60)}`);
    }
  }

  throw new Error(`All AI providers unavailable. ${errors.slice(-3).join('; ')}`);
}

// ── Post-processing: fix common model formatting issues ───────────────────────

/**
 * Fix formatting issues that models produce but Telegram renders wrong.
 * - "* item" (single asterisk bullets) → "- item"
 * - Trim excessive blank lines
 */
export function fixTelegramFormatting(text: string): string {
  return text
    // Single * at start of line used as bullet → replace with -
    // But NOT ** (bold) and NOT * inside text
    .replace(/^(\s*)\* /gm, '$1- ')
    // Max 2 consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
