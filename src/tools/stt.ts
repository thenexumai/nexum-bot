import { getProviderKey } from '../core/config';
import FormData from 'form-data';
import fetch from 'node-fetch';

export async function transcribeVoice(audioBuffer: Buffer): Promise<string | null> {
  const key = getProviderKey('groq');
  if (!key) throw new Error('STT requires Groq key — /setkey groq <key>');

  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, ...form.getHeaders() },
    body: form,
  });
  if (!r.ok) throw new Error(`STT failed ${r.status}`);
  return (await r.text()).trim() || null;
}
