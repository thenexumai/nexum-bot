import db from './db';

export interface UserPreferences {
  lang: 'ru' | 'en';
  voiceMode: boolean;
  theme: 'dark' | 'light';
  aiProvider: string;
}

export function getPreferences(uid: number): UserPreferences {
  const row = db.prepare('SELECT lang FROM users WHERE uid = ?').get(uid) as
    { lang: string } | undefined;
  const mem = db.prepare("SELECT value FROM memory WHERE uid = ? AND key = 'preferences'").get(uid) as
    { value: string } | undefined;
  const prefs = mem ? JSON.parse(mem.value) : {};
  return {
    lang:       (row?.lang ?? 'ru') as 'ru' | 'en',
    voiceMode:  prefs.voiceMode ?? false,
    theme:      prefs.theme ?? 'dark',
    aiProvider: prefs.aiProvider ?? 'auto',
  };
}

export function setPreference(uid: number, key: string, value: unknown) {
  const current = getPreferences(uid);
  const updated = { ...current, [key]: value };
  db.prepare(
    "INSERT OR REPLACE INTO memory (uid, key, value, updated_at) VALUES (?, 'preferences', ?, datetime('now'))"
  ).run(uid, JSON.stringify(updated));
}

export function setLang(uid: number, lang: 'ru' | 'en') {
  db.prepare('UPDATE users SET lang = ? WHERE uid = ?').run(lang, uid);
}
