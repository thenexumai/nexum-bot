import { getNextKey } from '../core/config';
import FormData from 'form-data';
import fetch from 'node-fetch';

export async function transcribeVoice(audioBuffer: Buffer): Promise<string | null> {
  const key = getNextKey('groq');
  if (!key) return null;

  try {
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, ...form.getHeaders() },
      body: form,
    });
    const data = await res.json() as { text?: string };
    return data.text ?? null;
  } catch { return null; }
}
