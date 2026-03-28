/**
 * NEXUM Memory Module
 * Conversation history + long-term key/value facts.
 */

import { db } from '../core/db';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryFact { key: string; value: string; }

// ── Conversation history ──────────────────────────────────────────────────────

export function getHistory(uid: number, limit = 20): HistoryMessage[] {
  const rows = db.prepare(
    `SELECT role, content FROM conversations WHERE uid=? ORDER BY id DESC LIMIT ?`
  ).all(uid, limit * 2) as { role: 'user' | 'assistant'; content: string }[];
  return [...rows].reverse();
}

export function saveMessage(uid: number, role: 'user' | 'assistant', content: string): void {
  db.prepare(`INSERT INTO conversations (uid, role, content) VALUES (?, ?, ?)`).run(uid, role, content);
}

export function clearHistory(uid: number): void {
  db.prepare(`DELETE FROM conversations WHERE uid=?`).run(uid);
}

export function getConversationCount(uid: number): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM conversations WHERE uid=? AND role='user'`).get(uid) as { c: number }).c;
}

// ── Long-term memory ──────────────────────────────────────────────────────────

export function getMemories(uid: number): MemoryFact[] {
  return db.prepare(`SELECT key, value FROM memory WHERE uid=? ORDER BY updated_at DESC`).all(uid) as MemoryFact[];
}

export function saveMemory(uid: number, key: string, value: string): void {
  db.prepare(`
    INSERT INTO memory (uid, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(uid, key, value);
}

export function clearMemory(uid: number): void {
  db.prepare(`DELETE FROM memory WHERE uid=?`).run(uid);
}

export function deleteMemoryKey(uid: number, key: string): void {
  db.prepare(`DELETE FROM memory WHERE uid=? AND key=?`).run(uid, key);
}

// ── Auto-extract facts from messages ─────────────────────────────────────────

const EXTRACT_PATTERNS: Array<{ regex: RegExp; key: string }> = [
  { regex: /my name is ([A-Za-zА-Яа-я]+)/i,           key: 'name' },
  { regex: /i(?:'m| am) (\d+) years? old/i,            key: 'age' },
  { regex: /i(?:'m| am) from ([A-Za-zА-Яа-я ]+)/i,    key: 'location' },
  { regex: /i work (?:at|for) ([A-Za-zА-Яа-я ]+)/i,   key: 'employer' },
  { regex: /i(?:'m| am) a ([A-Za-zА-Яа-я ]+)/i,       key: 'role' },
  { regex: /i speak ([A-Za-z, ]+)/i,                   key: 'languages' },
  { regex: /меня зовут ([А-Яа-яA-Za-z]+)/i,            key: 'name' },
  { regex: /я из ([А-Яа-яA-Za-z ]+)/i,                 key: 'location' },
  { regex: /я работаю (?:в|на) ([А-Яа-яA-Za-z ]+)/i,  key: 'employer' },
];

export function autoExtract(uid: number, text: string): void {
  for (const { regex, key } of EXTRACT_PATTERNS) {
    const m = text.match(regex);
    if (m) {
      const value = (m[2] ?? m[1])?.trim();
      if (value && value.length < 100) saveMemory(uid, key, value);
    }
  }
}

export function buildMemoryContext(uid: number): string {
  const facts = getMemories(uid);
  if (!facts.length) return '';
  return `\n\nWhat you remember about this user:\n${facts.map(f => `${f.key}: ${f.value}`).join('\n')}`;
}
