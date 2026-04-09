/**
 * OpenRouter provider — openai/gpt-oss-120b и другие модели
 */
import fetch from 'node-fetch';
import { CONFIG } from '../config';
import { Logger } from '../../infra/logger';

export interface ORMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface OROptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export async function openrouterChat(
    messages: ORMessage[],
    opts: OROptions = {}
): Promise<string> {
    const keys = CONFIG.PROVIDERS.openrouter;
    if (!keys || !keys.length) throw new Error('OpenRouter ключи не настроены (OR1-OR7 в env)');

    const key = keys[Math.floor(Math.random() * keys.length)];
    const model = opts.model || DEFAULT_MODEL;

    Logger.info('openrouter', `→ ${model} (${messages.length} msgs)`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://nexum.app',
                'X-Title': 'NEXUM AI',
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
            throw new Error(`OpenRouter HTTP ${res.status}: ${err.slice(0, 300)}`);
        }

        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('OpenRouter: пустой ответ');

        Logger.info('openrouter', `✓ ${content.length} chars`);
        return content;
    } finally {
        clearTimeout(timer);
    }
}

/** Fallback: попробовать OpenRouter, потом Groq */
export async function smartChat(
    messages: ORMessage[],
    opts: OROptions = {}
): Promise<{ text: string; provider: string }> {
    // Попытка 1: OpenRouter gpt-oss-120b
    if (CONFIG.PROVIDERS.openrouter?.length) {
        try {
            const text = await openrouterChat(messages, { ...opts, model: opts.model || DEFAULT_MODEL });
            return { text, provider: 'openrouter' };
        } catch (e) {
            Logger.warn('smartChat', `OpenRouter failed: ${e}, trying Groq...`);
        }
    }

    // Попытка 2: Groq
    if (CONFIG.PROVIDERS.groq?.length) {
        try {
            const { groqChat } = await import('./groq');
            const text = await groqChat(messages as any, opts);
            return { text, provider: 'groq' };
        } catch (e) {
            Logger.warn('smartChat', `Groq failed: ${e}`);
        }
    }

    throw new Error('Все AI провайдеры недоступны');
}
