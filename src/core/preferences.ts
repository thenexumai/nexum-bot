/**
 * NEXUM User Preferences
 * Stored in memory table with __pref_ prefix keys.
 */

import { db } from './db';
import type { Lang } from '../i18n/index';

export interface UserPrefs {
  lang: Lang;
  theme: 'dark' | 'light';
  voice: string;
}

function getPref(uid: number, key: string, fallback: string): string {
  const row = db.prepare(`SELECT value FROM memory WHERE uid=? AND key=?`).get(uid, `__pref_${key}`) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function setPref(uid: number, key: string, value: string): void {
  db.prepare(`
    INSERT INTO memory (uid, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(uid, `__pref_${key}`, value);
}

export function getUserPrefs(uid: number): UserPrefs {
  return {
    lang: getPref(uid, 'lang', 'en') as Lang,
    theme: getPref(uid, 'theme', 'dark') as 'dark' | 'light',
    voice: getPref(uid, 'voice', 'off'),
  };
}

export function setUserLang(uid: number, lang: Lang): void {
  setPref(uid, 'lang', lang);
  // Also update users table
  db.prepare(`UPDATE users SET lang=? WHERE uid=?`).run(lang, uid);
}

export function setUserTheme(uid: number, theme: 'dark' | 'light'): void {
  setPref(uid, 'theme', theme);
}

export function setUserVoice(uid: number, voice: string): void {
  setPref(uid, 'voice', voice);
}
