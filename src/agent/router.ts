/**
 * NEXUM Agent Router — multi-provider with streaming
 * Priority: BYOK → Cerebras → Groq → Gemini → DeepSeek → Together → OpenRouter → Claude → Grok
 */

import { getProviderKey, type AiProvider } from '../core/config';
import { db } from '../core/db';
import { createLogger } from '../infra/logger';

const log = createLogger('router');

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type StreamCallback = (token: string) => void;

// ── Provider configs ──────────────────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  baseUrl: string;
  model: string;
  provider: AiProvider;
  format: 'openai' | 'anthropic' | 'google';
}

const PROVIDERS: ProviderConfig[] = [
  { name: 'Cerebras',   provider: 'cerebras',   baseUrl: 'https://api.cerebras.ai/v1',                          model: 'llama-3.3-70b',              format: 'openai' },
  { name: 'Groq',       provider: 'groq',       baseUrl: 'https://api.groq.com/openai/v1',                      model: 'llama-3.3-70b-versatile',    format: 'openai' },
  { name: 'Gemini',     provider: 'gemini',     baseUrl: 'https://generativelanguage.googleapis.com/v1beta',    model: 'gemini-2.0-flash',           format: 'google' },
  { name: 'DeepSeek',   provider: 'deepseek',   baseUrl: 'https://api.deepseek.com/v1',                         model: 'deepseek-chat',              format: 'openai' },
  { name: 'Together',   provider: 'together',   baseUrl: 'https://api.together.xyz/v1',                         model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', format: 'openai' },
  { name: 'SambaNova',  provider: 'sambanova',  baseUrl: 'https://api.sambanova.ai/v1',                         model: 'Meta-Llama-3.3-70B-Instruct', format: 'openai' },
  { name: 'OpenRouter', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',                        model: 'deepseek/deepseek-chat',     format: 'openai' },
  { name: 'Grok',       provider: 'grok',       baseUrl: 'https://api.x.ai/v1',                                 model: 'grok-3-mini',                format: 'openai' },
  { name: 'Claude',     provider: 'claude',     baseUrl: 'https://api.anthropic.com/v1',                        model: 'claude-sonnet-4-5',          format: 'anthropic' },
];

// ── OpenAI-compatible chat ─────────────────────────────────────────────────────

async function callOpenAI(
  cfg: ProviderConfig,
  key: string,
  messages: Message[],
  onToken?: StreamCallback,
): Promise<string> {
  const stream = !!onToken;

  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(cfg.provider === 'openrouter' ? { 'HTTP-Referer': 'https://nexum.ai', 'X-Title': 'NEXUM' } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
      stream,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${cfg.name} ${resp.status}: ${err.slice(0, 120)}`);
  }

  if (!stream || !onToken) {
    const data = await resp.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? '';
  }

  // Streaming
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break;
      try {
        const j = JSON.parse(raw) as { choices: { delta: { content?: string } }[] };
        const token = j.choices[0]?.delta?.content ?? '';
        if (token) { full += token; onToken(token); }
      } catch { /* skip malformed */ }
    }
  }
  return full;
}

// ── Anthropic chat ────────────────────────────────────────────────────────────

async function callAnthropic(
  key: string,
  messages: Message[],
  onToken?: StreamCallback,
): Promise<string> {
  const system = messages.find(m => m.role === 'system')?.content ?? '';
  const filtered = messages.filter(m => m.role !== 'system');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system,
      messages: filtered,
      stream: !!onToken,
    }),
  });

  if (!resp.ok) throw new Error(`Claude ${resp.status}`);

  if (!onToken) {
    const data = await resp.json() as { content: { text: string }[] };
    return data.content[0]?.text ?? '';
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const j = JSON.parse(line.slice(6)) as { type: string; delta?: { text: string } };
        if (j.type === 'content_block_delta' && j.delta?.text) {
          full += j.delta.text;
          onToken(j.delta.text);
        }
      } catch { /* skip */ }
    }
  }
  return full;
}

// ── Gemini chat ───────────────────────────────────────────────────────────────

async function callGemini(key: string, messages: Message[]): Promise<string> {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const system = messages.find(m => m.role === 'system')?.content;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
      }),
    },
  );

  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json() as { candidates: { content: { parts: { text: string }[] } }[] };
  return data.candidates[0]?.content?.parts[0]?.text ?? '';
}

// ── Main chat function ────────────────────────────────────────────────────────

export async function chat(messages: Message[], byokKeys?: Record<string, string>): Promise<string> {
  return chatStreaming(messages, undefined, byokKeys);
}

export async function chatStreaming(
  messages: Message[],
  onToken?: StreamCallback,
  byokKeys?: Record<string, string>,
): Promise<string> {
  const errors: string[] = [];

  // Try BYOK first
  if (byokKeys) {
    for (const [provider, key] of Object.entries(byokKeys)) {
      if (!key) continue;
      try {
        const cfg = PROVIDERS.find(p => p.provider === provider);
        if (!cfg) continue;
        log.debug(`Using BYOK: ${cfg.name}`);
        if (cfg.format === 'anthropic') return await callAnthropic(key, messages, onToken);
        if (cfg.format === 'google') return await callGemini(key, messages);
        return await callOpenAI(cfg, key, messages, onToken);
      } catch (e) {
        errors.push(`BYOK ${provider}: ${(e as Error).message}`);
      }
    }
  }

  // Try system keys in priority order
  for (const cfg of PROVIDERS) {
    const key = getProviderKey(cfg.provider);
    if (!key) continue;

    try {
      log.debug(`Trying provider: ${cfg.name}`);
      if (cfg.format === 'anthropic') return await callAnthropic(key, messages, onToken);
      if (cfg.format === 'google') return await callGemini(key, messages);
      return await callOpenAI(cfg, key, messages, onToken);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${cfg.name}: ${msg}`);
      log.warn(`Provider ${cfg.name} failed: ${msg}`);
    }
  }

  log.error(`All providers failed:\n${errors.join('\n')}`);
  throw new Error('All AI providers failed. Check your API keys.');
}
