/**
 * NEXUM Skill System
 * Агент автоматически создаёт навыки после решения сложных задач.
 * Навыки хранятся как JSON в БД и улучшаются при использовании.
 * Совместима со всей экосистемой через uid пользователя.
 */

import db from '../db';
import { Logger } from '../../infra/logger';
import { chatUnified } from '../../agent/router';

export interface Skill {
  id: string;
  uid: number;          // 0 = глобальный навык для всех
  name: string;
  description: string;
  trigger_keywords: string[];
  steps: string[];
  success_count: number;
  last_used: string;
  quality_score: number; // 0-100
  created_at: string;
  updated_at: string;
}

export class SkillManager {

  /** Инициализация таблицы навыков */
  static init(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id               TEXT PRIMARY KEY,
        uid              INTEGER NOT NULL DEFAULT 0,
        name             TEXT NOT NULL,
        description      TEXT,
        trigger_keywords TEXT DEFAULT '[]',
        steps            TEXT DEFAULT '[]',
        success_count    INTEGER DEFAULT 0,
        last_used        TEXT,
        quality_score    REAL DEFAULT 50,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_skills_uid ON skills(uid);
    `);
    Logger.info('skills', 'Skill table ready');
  }

  /** Проверить, есть ли подходящий навык для запроса пользователя */
  static findSkill(uid: number, query: string): Skill | null {
    const q = query.toLowerCase();
    // Ищем по UID пользователя + глобальные навыки (uid=0)
    const rows = db.prepare(
      `SELECT * FROM skills WHERE (uid = ? OR uid = 0) AND quality_score > 30 ORDER BY quality_score DESC, success_count DESC LIMIT 20`
    ).all(uid) as any[];

    for (const row of rows) {
      const keywords: string[] = JSON.parse(row.trigger_keywords || '[]');
      const hit = keywords.some(kw => q.includes(kw.toLowerCase()));
      if (hit) {
        return { ...row, trigger_keywords: keywords, steps: JSON.parse(row.steps || '[]') };
      }
    }
    return null;
  }

  /** Создать или обновить навык после успешного решения сложной задачи */
  static async learnFromConversation(
    uid: number,
    taskDescription: string,
    solution: string
  ): Promise<void> {
    if (taskDescription.length < 50 || solution.length < 100) return; // слишком простая задача

    const prompt = `Analyze this completed task and extract a reusable skill pattern as JSON.

Task: "${taskDescription.slice(0, 300)}"
Solution summary: "${solution.slice(0, 500)}"

Return ONLY valid JSON (no markdown):
{
  "should_save": true/false,
  "name": "short skill name (max 5 words)",
  "description": "what this skill does",
  "trigger_keywords": ["keyword1", "keyword2", "keyword3"],
  "steps": ["step 1", "step 2", "step 3"]
}

Set should_save=false if this is trivial/generic (greetings, simple Q&A).
Set should_save=true only for complex, reusable task patterns.`;

    try {
      const resp = await chatUnified([{ role: 'user', content: prompt }], uid);
      const raw = (resp.content || '').replace(/```json|```/g, '').trim();
      const data = JSON.parse(raw);

      if (!data.should_save || !data.name) return;

      const id = `skill_${uid}_${Date.now()}`;
      const existingName = db.prepare(
        `SELECT id, success_count, quality_score FROM skills WHERE uid = ? AND name = ?`
      ).get(uid, data.name) as any;

      if (existingName) {
        // Улучшаем существующий навык
        const newScore = Math.min(100, existingName.quality_score + 5);
        db.prepare(`
          UPDATE skills SET
            steps = ?,
            trigger_keywords = ?,
            description = ?,
            success_count = success_count + 1,
            quality_score = ?,
            last_used = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          JSON.stringify(data.steps || []),
          JSON.stringify(data.trigger_keywords || []),
          data.description || '',
          newScore,
          existingName.id
        );
        Logger.info('skills', `Skill improved: "${data.name}" (score: ${newScore})`);
      } else {
        // Создаём новый навык
        db.prepare(`
          INSERT INTO skills (id, uid, name, description, trigger_keywords, steps, success_count, quality_score, last_used)
          VALUES (?, ?, ?, ?, ?, ?, 1, 60, datetime('now'))
        `).run(
          id, uid,
          data.name,
          data.description || '',
          JSON.stringify(data.trigger_keywords || []),
          JSON.stringify(data.steps || [])
        );
        Logger.success('skills', `New skill learned: "${data.name}" for uid=${uid}`);
      }
    } catch (e) {
      Logger.warn('skills', 'Skill extraction failed (non-critical)');
    }
  }

  /** Пометить навык использованным (улучшает score) */
  static markUsed(skillId: string): void {
    db.prepare(`
      UPDATE skills SET
        success_count = success_count + 1,
        quality_score = MIN(100, quality_score + 2),
        last_used = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(skillId);
  }

  /** Список навыков пользователя */
  static listSkills(uid: number): Skill[] {
    return (db.prepare(
      `SELECT * FROM skills WHERE uid = ? OR uid = 0 ORDER BY quality_score DESC, success_count DESC LIMIT 30`
    ).all(uid) as any[]).map(r => ({
      ...r,
      trigger_keywords: JSON.parse(r.trigger_keywords || '[]'),
      steps: JSON.parse(r.steps || '[]'),
    }));
  }

  /** Получить навык как контекст для системного промпта */
  static getSkillContext(uid: number, query: string): string {
    const skill = this.findSkill(uid, query);
    if (!skill) return '';
    this.markUsed(skill.id);
    return `\n## Relevant skill: "${skill.name}"\n${skill.steps.map((s, i) => `${i+1}. ${s}`).join('\n')}\n`;
  }
}
