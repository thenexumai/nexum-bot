/**
 * NEXUM Long-Term Memory Engine
 * Помнит ВСЁ о пользователе через все сессии.
 * Context compressor — сжимает старую историю, но сохраняет ключевые факты навсегда.
 * Единый uid — работает везде в экосистеме.
 */

import db from '../db';
import { chatUnified } from '../../agent/router';
import { Logger } from '../../infra/logger';

const FULL_MESSAGES_COUNT = 20;   // последние N сообщений хранятся полностью
const COMPRESSION_TRIGGER = 60;   // после 60 сообщений — сжимаем старые

export class LongTermMemory {

  static init(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS long_term_memory (
        uid             INTEGER PRIMARY KEY,
        compressed_summary TEXT DEFAULT '',
        key_facts          TEXT DEFAULT '[]',
        important_events   TEXT DEFAULT '[]',
        last_compressed    DATETIME,
        total_messages     INTEGER DEFAULT 0,
        updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS persistent_facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        uid        INTEGER NOT NULL,
        category   TEXT NOT NULL,
        fact       TEXT NOT NULL,
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(uid, fact)
      );
      CREATE INDEX IF NOT EXISTS idx_pfacts_uid ON persistent_facts(uid);
    `);
    Logger.info('ltm', 'Long-term memory tables ready');
  }

  /** Добавить в долгосрочную память и запустить компрессию при необходимости */
  static async processMessage(uid: number, role: 'user' | 'assistant', content: string): Promise<void> {
    // Обновляем счётчик
    db.prepare(`
      INSERT INTO long_term_memory (uid, total_messages) VALUES (?, 1)
      ON CONFLICT(uid) DO UPDATE SET total_messages = total_messages + 1, updated_at = datetime('now')
    `).run(uid);

    const row = db.prepare('SELECT total_messages FROM long_term_memory WHERE uid=?').get(uid) as any;
    const total = row?.total_messages || 0;

    // Сохраняем важные факты из пользовательских сообщений
    if (role === 'user' && content.length > 20) {
      await this.extractPersistentFacts(uid, content);
    }

    // Запускаем компрессию каждые COMPRESSION_TRIGGER сообщений
    if (total > 0 && total % COMPRESSION_TRIGGER === 0) {
      await this.compressHistory(uid);
    }
  }

  /** Извлечь и сохранить постоянные факты из сообщения */
  static async extractPersistentFacts(uid: number, message: string): Promise<void> {
    if (message.length < 30) return;

    const prompt = `Extract important personal facts from this message that should be remembered forever.
Message: "${message.slice(0, 400)}"
Return ONLY valid JSON (no markdown):
{"facts": [{"category": "personal/work/preference/goal", "fact": "concise fact", "importance": 1-10}]}
Only extract REAL personal facts (name, job, goals, preferences, important events).
Return empty array if nothing important: {"facts": []}`;

    try {
      const resp = await chatUnified([{ role: 'user', content: prompt }], uid);
      const raw = (resp.content || '').replace(/```json|```/g, '').trim();
      const data = JSON.parse(raw);

      if (!Array.isArray(data.facts)) return;

      for (const f of data.facts) {
        if (f.fact && f.importance >= 5) {
          db.prepare(`
            INSERT OR IGNORE INTO persistent_facts (uid, category, fact, importance)
            VALUES (?, ?, ?, ?)
          `).run(uid, f.category || 'general', f.fact.slice(0, 300), f.importance || 5);
        }
      }
    } catch {
      // non-critical
    }
  }

  /** Сжать старую историю диалога, сохранив суть */
  static async compressHistory(uid: number): Promise<void> {
    Logger.info('ltm', `Compressing history for uid=${uid}`);

    // Берём сообщения для сжатия (не последние FULL_MESSAGES_COUNT)
    const sessions = db.prepare('SELECT messages FROM sessions WHERE uid=?').get(uid) as any;
    if (!sessions?.messages) return;

    const allMessages: any[] = JSON.parse(sessions.messages);
    if (allMessages.length <= FULL_MESSAGES_COUNT) return;

    const toCompress = allMessages.slice(0, allMessages.length - FULL_MESSAGES_COUNT);
    const toKeep = allMessages.slice(-FULL_MESSAGES_COUNT);

    const text = toCompress.map((m: any) => `${m.role}: ${m.content}`).join('\n').slice(0, 3000);

    const prompt = `Summarize this conversation history into a concise memory summary.
Focus on: decisions made, important information shared, tasks completed, user preferences revealed.

Conversation:
${text}

Return ONLY a plain text summary (2-5 sentences, max 500 chars). No JSON.`;

    try {
      const resp = await chatUnified([{ role: 'user', content: prompt }], uid);
      const summary = (resp.content || '').slice(0, 600);

      // Обновляем сжатую сводку
      const existing = db.prepare('SELECT compressed_summary FROM long_term_memory WHERE uid=?').get(uid) as any;
      const prevSummary = existing?.compressed_summary || '';
      const newSummary = prevSummary ? `${prevSummary}\n---\n${summary}` : summary;

      db.prepare(`
        UPDATE long_term_memory SET
          compressed_summary = ?,
          last_compressed = datetime('now'),
          updated_at = datetime('now')
        WHERE uid = ?
      `).run(newSummary.slice(-3000), uid); // храним последние 3000 символов сводки

      // Обновляем сессию — оставляем только свежие сообщения
      db.prepare('UPDATE sessions SET messages = ?, updated_at = datetime("now") WHERE uid = ?')
        .run(JSON.stringify(toKeep), uid);

      Logger.success('ltm', `History compressed for uid=${uid}`);
    } catch (e) {
      Logger.warn('ltm', 'Compression failed (non-critical)');
    }
  }

  /** Получить весь контекст долгосрочной памяти для промпта */
  static getFullMemoryContext(uid: number, currentQuery: string): string {
    try {
      const ltm = db.prepare('SELECT * FROM long_term_memory WHERE uid=?').get(uid) as any;
      const facts = db.prepare(
        `SELECT category, fact FROM persistent_facts WHERE uid=? ORDER BY importance DESC LIMIT 15`
      ).all(uid) as any[];

      let context = '';

      if (ltm?.compressed_summary) {
        context += `\n## Previous conversations summary\n${ltm.compressed_summary}\n`;
      }

      if (facts.length > 0) {
        context += `\n## Permanently remembered facts about this user\n`;
        facts.forEach(f => { context += `- [${f.category}] ${f.fact}\n`; });
      }

      return context;
    } catch {
      return '';
    }
  }

  /** Периодическое само-напоминание агента о важном (вызывается по крону) */
  static async selfReminder(uid: number, bot: any): Promise<void> {
    const tasks = db.prepare(
      `SELECT title FROM tasks WHERE uid=? AND status='todo' AND due_date IS NOT NULL AND due_date <= datetime('now', '+1 day') LIMIT 3`
    ).all(uid) as any[];

    if (tasks.length === 0) return;

    const list = tasks.map(t => `• ${t.title}`).join('\n');
    try {
      await bot.api.sendMessage(uid,
        `🧠 *NEXUM напоминает:* у тебя есть срочные задачи на сегодня/завтра:\n${list}`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* пользователь мог заблокировать бота */ }
  }
}
