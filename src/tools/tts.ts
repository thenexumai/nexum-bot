// NEXUM TTS — Text-to-Speech via Groq

import { getKey } from '../core/config';
import { db } from '../core/db';
import fetch from 'node-fetch';

export interface VoicePref {
  lang: string;
  voice: string;
}

export const VOICES = [
  { id: 'alloy',   label: 'Alloy' },
  { id: 'echo',    label: 'Echo' },
  { id: 'fable',   label: 'Fable' },
  { id: 'onyx',    label: 'Onyx' },
  { id: 'nova',    label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer' },
];

export function getUserVoicePref(uid: number): VoicePref {
  const row = (db as any).prepare(
    `SELECT value FROM memory WHERE uid=? AND key='voice_pref'`
  ).get(uid) as any;
  if (row?.value) {
    try { return JSON.parse(row.value); } catch {}
  }
  return { lang: 'off', voice: 'alloy' };
}

export function setUserVoicePref(uid: number, pref: VoicePref) {
  (db as any).prepare(
    `INSERT INTO memory (uid, key, value, updated_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(uid, 'voice_pref', JSON.stringify(pref));
}

export async function textToSpeech(text: string, uid: number): Promise<Buffer> {
  const key = getKey('groq');
  if (!key) throw new Error('TTS requires a Groq API key');

  const pref = getUserVoicePref(uid);
  const voice = pref.voice || 'alloy';

  // Truncate long texts
  const truncated = text.length > 4096 ? text.slice(0, 4090) + '...' : text;

  const r = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'playai-tts',
      input: truncated,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`TTS failed: ${r.status} ${err}`);
  }

  return Buffer.from(await r.arrayBuffer());
}
