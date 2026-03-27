// NEXUM Memory — conversation history + long-term key-value facts

import { db } from '../core/db';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryFact {
  key: string;
  value: string;
}

// ── Conversation history ──────────────────────────────────────────────────────

export function getHistory(uid: number, limit = 20): HistoryMessage[] {
  const rows = (db as any).prepare(
    `SELECT role, content FROM conversations WHERE uid=? ORDER BY id DESC LIMIT ?`
  ).all(uid, limit * 2) as any[];
  return (rows || []).reverse() as HistoryMessage[];
}

export function saveMessage(uid: number, role: 'user' | 'assistant', content: string) {
  (db as any).prepare(
    `INSERT INTO conversations (uid, role, content) VALUES (?,?,?)`
  ).run(uid, role, content);
}

export function clearHistory(uid: number) {
  (db as any).prepare(`DELETE FROM conversations WHERE uid=?`).run(uid);
}

// ── Long-term memory ──────────────────────────────────────────────────────────

export function getMemories(uid: number): MemoryFact[] {
  const rows = (db as any).prepare(
    `SELECT key, value FROM memory WHERE uid=? ORDER BY updated_at DESC`
  ).all(uid) as any[];
  return (rows || []) as MemoryFact[];
}

export function saveMemory(uid: number, key: string, value: string) {
  (db as any).prepare(
    `INSERT INTO memory (uid, key, value, updated_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(uid,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(uid, key, value);
}

export function clearMemory(uid: number) {
  (db as any).prepare(`DELETE FROM memory WHERE uid=?`).run(uid);
}

export function deleteMemoryKey(uid: number, key: string) {
  (db as any).prepare(`DELETE FROM memory WHERE uid=? AND key=?`).run(uid, key);
}

// ── Auto-extract facts from conversation ─────────────────────────────────────
// Simple heuristic extraction — no LLM call needed

const EXTRACT_PATTERNS: Array<{ regex: RegExp; key: string }> = [
  { regex: /my name is ([A-Za-z]+)/i, key: 'name' },
  { regex: /i(?:'m| am) ([A-Za-z]+ ?[A-Za-z]*)/i, key: 'identity' },
  { regex: /i(?:'m| am) (\d+) years? old/i, key: 'age' },
  { regex: /i(?:'m| am) from ([A-Za-z ]+)/i, key: 'location' },
  { regex: /i work (?:at|for) ([A-Za-z ]+)/i, key: 'employer' },
  { regex: /i(?:'m| am) a ([A-Za-z ]+)/i, key: 'role' },
  { regex: /my (?:favorite|favourite) (\w+) is ([^\.,]+)/i, key: 'preference' },
  { regex: /i speak ([A-Za-z, ]+)/i, key: 'languages' },
];

export function autoExtract(uid: number, text: string) {
  for (const { regex, key } of EXTRACT_PATTERNS) {
    const m = text.match(regex);
    if (m) {
      const value = m[2] || m[1];
      if (value && value.length < 100) {
        saveMemory(uid, key, value.trim());
      }
    }
  }
}

// ── Memory context string for system prompt ───────────────────────────────────

export function buildMemoryContext(uid: number): string {
  const facts = getMemories(uid);
  if (!facts.length) return '';
  const lines = facts.map(f => `${f.key}: ${f.value}`).join('\n');
  return `\n\nWhat you remember about this user:\n${lines}`;
}
