/**
 * NEXUM TTS — Text-to-Speech via Groq
 */

import { getProviderKey } from '../core/config';
import { createLogger } from '../infra/logger';

const log = createLogger('tts');

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export async function textToSpeech(
  text: string,
  voice: TtsVoice = 'nova',
): Promise<Buffer> {
  const key = getProviderKey('groq');
  if (!key) throw new Error('No Groq key for TTS');

  // Trim text if too long
  const trimmed = text.slice(0, 4096);

  const resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'playai-tts',
      input: trimmed,
      voice,
      response_format: 'opus',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`TTS error ${resp.status}: ${err.slice(0, 100)}`);
  }

  const buf = await resp.arrayBuffer();
  log.debug(`TTS generated: ${buf.byteLength} bytes`);
  return Buffer.from(buf);
}
