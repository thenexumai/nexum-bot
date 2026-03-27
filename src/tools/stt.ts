// NEXUM STT — Speech-to-Text via Groq Whisper

import { getKey } from '../core/config';
import FormData from 'form-data';
import fetch from 'node-fetch';

export async function transcribeVoice(audioBuffer: Buffer): Promise<string | null> {
  const key = getKey('groq');
  if (!key) throw new Error('STT requires a Groq API key. Add with /setkey groq <key>');

  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, ...form.getHeaders() },
    body: form,
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`STT failed: ${r.status} ${err}`);
  }

  const text = (await r.text()).trim();
  return text || null;
}
