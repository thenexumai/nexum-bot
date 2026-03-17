"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chat = chat;
const config_1 = require("../core/config");
const db_1 = require("../core/db");
function getUserApiKey(uid, provider) {
    const row = db_1.db.prepare('SELECT api_key FROM user_api_keys WHERE uid=? AND provider=?').get(uid, provider);
    return row?.api_key || null;
}
// ── Provider callers ──────────────────────────────────────────────────────────
async function cerebras(msgs, key, system) {
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048, temperature: 0.7 }),
    });
    if (!r.ok)
        throw new Error(`Cerebras ${r.status}: ${await r.text().catch(() => '')}`);
    return (await r.json()).choices[0].message.content;
}
async function groq(msgs, key, system) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048, temperature: 0.7 }),
    });
    if (!r.ok)
        throw new Error(`Groq ${r.status}: ${await r.text().catch(() => '')}`);
    return (await r.json()).choices[0].message.content;
}
async function gemini(msgs, key, system, vision = false) {
    const model = vision ? 'gemini-1.5-flash' : 'gemini-1.5-flash';
    const contents = msgs.map(m => {
        if (typeof m.content === 'string')
            return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
        // Vision message
        const parts = m.content.map((c) => {
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
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } }),
    });
    if (!r.ok)
        throw new Error(`Gemini ${r.status}: ${await r.text().catch(() => '')}`);
    const json = await r.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text)
        throw new Error('Gemini: empty response');
    return text;
}
async function openrouter(msgs, key, system) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://nexum.ai' },
        body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048 }),
    });
    if (!r.ok)
        throw new Error(`OpenRouter ${r.status}`);
    return (await r.json()).choices[0].message.content;
}
async function deepseek(msgs, key, system) {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048 }),
    });
    if (!r.ok)
        throw new Error(`DeepSeek ${r.status}`);
    return (await r.json()).choices[0].message.content;
}
async function claudeAI(msgs, key, system) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 2048, system, messages: msgs.map(m => ({ role: m.role, content: m.content })) }),
    });
    if (!r.ok)
        throw new Error(`Claude ${r.status}`);
    return (await r.json()).content[0].text;
}
async function grok(msgs, key, system) {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-2-latest', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048 }),
    });
    if (!r.ok)
        throw new Error(`Grok ${r.status}`);
    return (await r.json()).choices[0].message.content;
}
async function sambanova(msgs, key, system) {
    const r = await fetch('https://api.sambanova.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'Meta-Llama-3.3-70B-Instruct', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048 }),
    });
    if (!r.ok)
        throw new Error(`SambaNova ${r.status}`);
    return (await r.json()).choices[0].message.content;
}
async function together(msgs, key, system) {
    const r = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3-70b-chat-hf', messages: [{ role: 'system', content: system }, ...msgs], max_tokens: 2048 }),
    });
    if (!r.ok)
        throw new Error(`Together ${r.status}`);
    return (await r.json()).choices[0].message.content;
}
// ── Main chat function with OpenClaw-style fallback chain ─────────────────────
async function chat(uid, messages, system, hasImage = false) {
    const errors = [];
    // 1. User's own keys go first (OpenClaw pattern)
    const userProviders = [];
    const uCerebras = getUserApiKey(uid, 'cerebras');
    if (uCerebras)
        userProviders.push(['cerebras', () => cerebras(messages, uCerebras, system)]);
    const uGroq = getUserApiKey(uid, 'groq');
    if (uGroq)
        userProviders.push(['groq', () => groq(messages, uGroq, system)]);
    const uGemini = getUserApiKey(uid, 'gemini');
    if (uGemini)
        userProviders.push(['gemini', () => gemini(messages, uGemini, system, hasImage)]);
    const uOR = getUserApiKey(uid, 'openrouter');
    if (uOR)
        userProviders.push(['openrouter', () => openrouter(messages, uOR, system)]);
    const uDS = getUserApiKey(uid, 'deepseek');
    if (uDS)
        userProviders.push(['deepseek', () => deepseek(messages, uDS, system)]);
    const uClaude = getUserApiKey(uid, 'claude');
    if (uClaude)
        userProviders.push(['claude', () => claudeAI(messages, uClaude, system)]);
    const uGrok = getUserApiKey(uid, 'grok');
    if (uGrok)
        userProviders.push(['grok', () => grok(messages, uGrok, system)]);
    for (const [name, fn] of userProviders) {
        try {
            console.log(`[ai] user_key provider=${name} uid=${uid}`);
            return await fn();
        }
        catch (e) {
            errors.push(`user_${name}: ${e.message?.slice(0, 60)}`);
        }
    }
    // 2. Vision-capable provider for images
    if (hasImage) {
        const gKey = (0, config_1.getKey)('gemini');
        if (gKey) {
            try {
                return await gemini(messages, gKey, system, true);
            }
            catch (e) {
                errors.push(`gemini_vision: ${e.message?.slice(0, 60)}`);
            }
        }
        // Fallback: strip image and process as text
        const textMessages = messages.map(m => ({
            ...m,
            content: Array.isArray(m.content)
                ? m.content.find((c) => c.type === 'text')?.text || 'Опиши что ты видишь'
                : m.content,
        }));
        return await chat(uid, textMessages, system + '\n[Note: image could not be processed, describe what you would expect]', false);
    }
    // 3. System key round-robin fallback chain (OpenClaw-style)
    const k = (p) => (0, config_1.getKey)(p);
    const chain = [];
    if (k('cerebras'))
        chain.push(['cerebras', () => cerebras(messages, k('cerebras'), system)]);
    if (k('groq'))
        chain.push(['groq', () => groq(messages, k('groq'), system)]);
    if (k('gemini'))
        chain.push(['gemini', () => gemini(messages, k('gemini'), system)]);
    if (k('grok'))
        chain.push(['grok', () => grok(messages, k('grok'), system)]);
    if (k('sambanova'))
        chain.push(['sambanova', () => sambanova(messages, k('sambanova'), system)]);
    if (k('together'))
        chain.push(['together', () => together(messages, k('together'), system)]);
    if (k('openrouter'))
        chain.push(['openrouter', () => openrouter(messages, k('openrouter'), system)]);
    if (k('deepseek'))
        chain.push(['deepseek', () => deepseek(messages, k('deepseek'), system)]);
    if (k('claude'))
        chain.push(['claude', () => claudeAI(messages, k('claude'), system)]);
    for (const [name, fn] of chain) {
        try {
            console.log(`[ai] system provider=${name}`);
            return await fn();
        }
        catch (e) {
            errors.push(`${name}: ${e.message?.slice(0, 60)}`);
        }
    }
    console.error('[ai] all providers failed:', errors);
    throw new Error(`Все AI провайдеры недоступны. Попробуй позже.\n${errors.slice(0, 3).join(', ')}`);
}
