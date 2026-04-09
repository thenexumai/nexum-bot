/**
 * Groq provider — llama-4-scout + fallback llama-3.3-70b
 */
import fetch from 'node-fetch';
import { CONFIG } from '../config';
import { Logger } from '../../infra/logger';

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function groqChat(
    messages: GroqMessage[],
    opts: { model?: string; temperature?: number; max_tokens?: number } = {}
): Promise<string> {
    const keys = CONFIG.PROVIDERS.groq;
    if (!keys?.length) throw new Error('Groq ключи не настроены');

    const key = keys[Math.floor(Date.now() / 1000) % keys.length];
    const model = opts.model || 'meta-llama/llama-4-scout-17b-16e-instruct';

    Logger.info('groq', `→ ${model}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: opts.temperature ?? 0.7,
                max_tokens: opts.max_tokens ?? 2048,
            }),
            signal: controller.signal as any,
        });

        if (!res.ok) {
            const err = await res.text();
            // Если модель не поддерживается — fallback на llama-3.3
            if (res.status === 400 && err.includes('model')) {
                Logger.warn('groq', `Model ${model} unavailable, falling back to llama-3.3-70b-versatile`);
                return groqChat(messages, { ...opts, model: 'llama-3.3-70b-versatile' });
            }
            throw new Error(`Groq HTTP ${res.status}: ${err.slice(0, 300)}`);
        }

        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Groq: пустой ответ');

        Logger.info('groq', `✓ ${content.length} chars`);
        return content;
    } finally {
        clearTimeout(timer);
    }
}
