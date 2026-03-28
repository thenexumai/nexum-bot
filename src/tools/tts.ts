import { getProviderKey } from '../core/config';
import { db } from '../core/db';
import fetch from 'node-fetch';

export interface VoicePref { voice: string; }

export const VOICES = ['alloy','echo','fable','onyx','nova','shimmer'] as const;

export function getUserVoicePref(uid: number): VoicePref {
  const row = db.prepare(`SELECT value FROM memory WHERE uid=? AND key='voice_pref'`).get(uid) as { value: string } | undefined;
  if (row?.value) { try { return JSON.parse(row.value) as VoicePref; } catch {} }
  return { voice: 'off' }; // default off
}

export function setUserVoicePref(uid: number, pref: VoicePref): void {
  db.prepare(`INSERT INTO memory (uid, key, value, updated_at) VALUES (?, 'voice_pref', ?, datetime('now'))
    ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(uid, JSON.stringify(pref));
}

export async function textToSpeech(text: string, uid: number): Promise<Buffer> {
  const key = getProviderKey('groq');
  if (!key) throw new Error('TTS requires Groq key — /setkey groq <key>');
  const { voice } = getUserVoicePref(uid);
  if (voice === 'off') throw new Error('Voice mode is off');

  const r = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'playai-tts', input: text.slice(0, 4096), voice, response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error(`TTS failed ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
