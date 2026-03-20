import { getKey } from '../core/config';
const FormData = require('form-data');
const fetch    = require('node-fetch');

export async function transcribeVoice(buf: Buffer, filename = 'voice.ogg'): Promise<string> {
  const groqKey = getKey('groq');
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
      if (r.ok) return (await r.text()).trim();
      console.warn('[stt] groq', await r.text());
    } catch (e) { console.warn('[stt] groq error:', e); }
  }
  throw new Error('STT unavailable (need Groq key)');
}
