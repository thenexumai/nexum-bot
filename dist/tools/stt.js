"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeVoice = transcribeVoice;
const config_1 = require("../core/config");
const FormData = require('form-data');
const fetch = require('node-fetch');
async function transcribeVoice(buf, filename = 'voice.ogg') {
    // Try Groq first (fastest)
    const groqKey = (0, config_1.getKey)('groq');
    if (groqKey) {
        try {
            const form = new FormData();
            form.append('file', buf, { filename, contentType: 'audio/ogg' });
            form.append('model', 'whisper-large-v3-turbo');
            form.append('response_format', 'text');
            const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${groqKey}`, ...form.getHeaders() },
                body: form,
            });
            if (r.ok)
                return (await r.text()).trim();
            console.warn('[stt] groq', await r.text());
        }
        catch (e) {
            console.warn('[stt] groq error:', e);
        }
    }
    // Fallback: Cerebras can't do STT, try OpenRouter with whisper (not available)
    // Return empty so caller can handle gracefully
    throw new Error('Нет ключа для STT (нужен Groq или OpenAI)');
}
