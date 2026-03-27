// NEXUM STT — Speech-to-Text via Groq Whisper
// Supports: whisper-large-v3, whisper-large-v3-turbo

import { getKey } from '../core/config';
import FormData from 'form-data';
import fetch from 'node-fetch';

export interface TranscribeOptions {
  language?: string; // 'ru', 'en', 'uz', etc. (ISO 639-1)
  temperature?: number; // 0.0 - 1.0
  prompt?: string; // Context to help transcription
}

export async function transcribeVoice(
  audioBuffer: Buffer,
  options: TranscribeOptions = {}
): Promise<string | null> {
  const key = getKey('groq');
  if (!key) {
    throw new Error('STT requires a Groq API key. Add with /setkey groq <key>');
  }

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'voice.ogg',
    contentType: 'audio/ogg',
  });
  form.append('model', 'whisper-large-v3-turbo'); // Faster, cheaper
  form.append('response_format', 'text');

  if (options.language) {
    form.append('language', options.language);
  }
  if (options.temperature) {
    form.append('temperature', options.temperature.toString());
  }
  if (options.prompt) {
    form.append('prompt', options.prompt);
  }

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    const status = r.status;

    if (status === 401) {
      throw new Error('STT: Invalid Groq API key. Update with /setkey groq <key>');
    }
    if (status === 429) {
      throw new Error('STT: Rate limit exceeded. Try again in a minute.');
    }
    if (status === 413) {
      throw new Error('STT: Audio file too large. Max 25MB.');
    }

    throw new Error(`STT failed (${status}): ${err.slice(0, 200)}`);
  }

  const text = (await r.text()).trim();
  return text || null;
}

// Auto-detect language from user context
export function getPreferredLanguage(uid: number): string | undefined {
  // Could be extended to read from user preferences
  // For now, return undefined for auto-detection
  return undefined;
}

// Quick test function
export async function testSTT(): Promise<boolean> {
  const key = getKey('groq');
  if (!key) return false;

  try {
    // Simple API check with empty form (will fail but validates key)
    const form = new FormData();
    form.append('file', Buffer.from(''), { filename: 'test.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-large-v3-turbo');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, ...form.getHeaders() },
      body: form,
    });

    // 400 is expected (empty file), but 401 means invalid key
    return r.status !== 401;
  } catch {
    return false;
  }
}
