import { Logger } from '../infra/logger';
import { getProviderKey, getModelChain, FREE_MODEL_CHAIN, ModelConfig } from '../core/config';
import db from '../core/db';

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: any;
    tool_call_id?: string;
    name?: string;
    tool_calls?: any[];
}

// ============================================================
//  UNIFIED AI ROUTER with automatic fallback chain
//  Tries providers in order until one succeeds
// ============================================================

export async function chatUnified(
    messages: Message[],
    uid: number,
    tools?: any[]
): Promise<Message> {
    // Get user plan for BYOK support
    const userRow = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
    const isPro = userRow?.subscription_plan === 'pro';

    const chain = getModelChain(uid, isPro);

    if (chain.length === 0) {
        Logger.error('router', 'No AI providers available!');
        return { role: 'assistant', content: '❌ Нет доступных AI провайдеров. Добавь API ключ через /byok' };
    }

    const errors: string[] = [];

    for (const cfg of chain) {
        const key = getProviderKey(cfg.provider, uid);
        if (!key) continue;

        try {
            Logger.debug('router', `Trying ${cfg.provider} (${cfg.model})`);

            let result: Message;
            if (cfg.format === 'openai') {
                result = await callOpenAI(cfg, key, messages, tools);
            } else if (cfg.format === 'google') {
                result = await callGemini(cfg, key, messages, tools);
            } else if (cfg.format === 'anthropic') {
                result = await callAnthropic(cfg, key, messages, tools);
            } else {
                continue;
            }

            Logger.debug('router', `✅ ${cfg.provider} responded`);
            return result;

        } catch (err: any) {
            const msg = err?.message || String(err);
            Logger.warn('router', `${cfg.provider} failed: ${msg}`);
            errors.push(`${cfg.provider}: ${msg}`);

            // Don't retry on auth errors
            if (msg.includes('401') || msg.includes('invalid_api_key')) continue;
            // Rate limit — try next
            if (msg.includes('429') || msg.includes('rate_limit')) continue;
        }
    }

    Logger.error('router', `All providers failed: ${errors.join(' | ')}`);
    return {
        role: 'assistant',
        content: '⚠️ Все AI провайдеры временно недоступны. Попробуй позже или добавь свой ключ через /byok'
    };
}

// ============================================================
//  PROVIDER IMPLEMENTATIONS
// ============================================================

async function callOpenAI(cfg: ModelConfig, key: string, messages: Message[], tools?: any[]): Promise<Message> {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
    };
    if (cfg.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://nexum.ai';
        headers['X-Title'] = 'NEXUM';
    }
    if (cfg.provider === 'sambanova') {
        // SambaNova uses same format but different header
        headers['Authorization'] = `Basic ${Buffer.from(key).toString('base64')}`;
    }

    const body: any = {
        model: cfg.model,
        messages: messages.filter(m => m.role !== 'tool' || cfg.supportsTools).map(normalizeMessage),
        max_tokens: cfg.maxTokens,
        temperature: 0.6,
    };
    if (tools && cfg.supportsTools) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const resp = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json() as any;
    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error('No response in choices');

    return {
        role: 'assistant',
        content: choice.content || '',
        tool_calls: choice.tool_calls,
    };
}

async function callGemini(cfg: ModelConfig, key: string, messages: Message[], tools?: any[]): Promise<Message> {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const contents = chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));

    const body: any = {
        contents,
        generationConfig: { maxOutputTokens: cfg.maxTokens, temperature: 0.6 },
    };
    if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const url = `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${key}`;
    const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text()}`);

    const data = await resp.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response');

    return { role: 'assistant', content: text };
}

async function callAnthropic(cfg: ModelConfig, key: string, messages: Message[], tools?: any[]): Promise<Message> {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const body: any = {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        messages: chatMsgs.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        system: systemMsg?.content,
    };
    if (tools && cfg.supportsTools) {
        body.tools = tools.map((t: any) => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters,
        }));
    }

    const resp = await fetchWithTimeout(`${cfg.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${await resp.text()}`);

    const data = await resp.json() as any;
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    return { role: 'assistant', content: textBlock?.text || '' };
}

// ============================================================
//  HELPERS
// ============================================================

function normalizeMessage(m: Message): any {
    if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content, tool_calls: m.tool_calls };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** Quick test — returns which providers are currently available */
export async function testProviders(uid: number): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const cfg of FREE_MODEL_CHAIN) {
        const key = getProviderKey(cfg.provider, uid);
        results[cfg.provider] = !!key;
    }
    return results;
}
