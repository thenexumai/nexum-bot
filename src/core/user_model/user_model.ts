/**
 * NEXUM User Model — диалектическое моделирование личности пользователя.
 * Агент строит модель личности на основе всех взаимодействий.
 * Единая модель по uid — работает в Telegram боте, браузере, агенте.
 */

import db from '../db';
import { chatUnified } from '../../agent/router';
import { Logger } from '../../infra/logger';

export interface UserPersonality {
  uid: number;
  // Личность
  communication_style: string;   // formal/casual/technical/creative
  response_preference: string;   // brief/detailed/structured/conversational
  expertise_areas: string[];     // области где пользователь компетентен
  interest_topics: string[];     // интересы
  language_patterns: string;     // особенности речи/формулировок
  // Активность
  typical_tasks: string[];       // типичные задачи
  peak_hours: string;            // когда обычно активен
  // Эмоции/тональность
  sentiment_baseline: string;    // обычный тон (positive/neutral/stressed)
  motivation_triggers: string[]; // что мотивирует
  // Мета
  last_updated: string;
  profile_completeness: number;  // 0-100%
  interaction_count: number;
}

export class UserModel {

  static init(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        uid                  INTEGER PRIMARY KEY,
        communication_style  TEXT DEFAULT 'casual',
        response_preference  TEXT DEFAULT 'balanced',
        expertise_areas      TEXT DEFAULT '[]',
        interest_topics      TEXT DEFAULT '[]',
        language_patterns    TEXT DEFAULT '',
        typical_tasks        TEXT DEFAULT '[]',
        peak_hours           TEXT DEFAULT 'unknown',
        sentiment_baseline   TEXT DEFAULT 'neutral',
        motivation_triggers  TEXT DEFAULT '[]',
        last_updated         DATETIME DEFAULT CURRENT_TIMESTAMP,
        profile_completeness REAL DEFAULT 0,
        interaction_count    INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS user_insights (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        uid        INTEGER NOT NULL,
        insight    TEXT NOT NULL,
        category   TEXT DEFAULT 'general',
        confidence REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_insights_uid ON user_insights(uid);
    `);
    Logger.info('user_model', 'User model tables ready');
  }

  /** Обновить модель пользователя на основе нового взаимодействия */
  static async updateFromInteraction(
    uid: number,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    // Обновляем счётчик
    db.prepare(`
      INSERT INTO user_profiles (uid, interaction_count) VALUES (?, 1)
      ON CONFLICT(uid) DO UPDATE SET interaction_count = interaction_count + 1, last_updated = datetime('now')
    `).run(uid);

    const count = (db.prepare('SELECT interaction_count FROM user_profiles WHERE uid=?').get(uid) as any)?.interaction_count || 0;

    // Анализируем профиль каждые 5 взаимодействий
    if (count % 5 !== 0) return;

    const prompt = `Analyze this user interaction and extract personality insights as JSON.

User message: "${userMessage.slice(0, 300)}"
Assistant response was accepted (user engaged positively).

Return ONLY valid JSON (no markdown):
{
  "communication_style": "formal/casual/technical/creative",
  "response_preference": "brief/detailed/structured/conversational",
  "detected_interests": ["topic1", "topic2"],
  "detected_expertise": ["area1"],
  "language_notes": "brief note about speech patterns",
  "sentiment": "positive/neutral/stressed/mixed",
  "new_insights": ["insight about this user"]
}`;

    try {
      const resp = await chatUnified([{ role: 'user', content: prompt }], uid);
      const raw = (resp.content || '').replace(/```json|```/g, '').trim();
      const data = JSON.parse(raw);

      // Получаем текущий профиль
      const current = db.prepare('SELECT * FROM user_profiles WHERE uid=?').get(uid) as any;
      const interests: string[] = JSON.parse(current?.interest_topics || '[]');
      const expertise: string[] = JSON.parse(current?.expertise_areas || '[]');

      // Мерджим данные
      if (data.detected_interests) {
        data.detected_interests.forEach((t: string) => { if (!interests.includes(t)) interests.push(t); });
      }
      if (data.detected_expertise) {
        data.detected_expertise.forEach((e: string) => { if (!expertise.includes(e)) expertise.push(e); });
      }

      const completeness = Math.min(100, (current?.profile_completeness || 0) + 3);

      db.prepare(`
        UPDATE user_profiles SET
          communication_style = ?,
          response_preference = ?,
          interest_topics = ?,
          expertise_areas = ?,
          language_patterns = ?,
          sentiment_baseline = ?,
          profile_completeness = ?,
          last_updated = datetime('now')
        WHERE uid = ?
      `).run(
        data.communication_style || current?.communication_style || 'casual',
        data.response_preference || current?.response_preference || 'balanced',
        JSON.stringify(interests.slice(-20)),
        JSON.stringify(expertise.slice(-15)),
        data.language_notes || current?.language_patterns || '',
        data.sentiment || current?.sentiment_baseline || 'neutral',
        completeness,
        uid
      );

      // Сохраняем инсайты
      if (Array.isArray(data.new_insights)) {
        for (const insight of data.new_insights.slice(0, 3)) {
          if (insight && insight.length > 10) {
            db.prepare(`INSERT INTO user_insights (uid, insight) VALUES (?, ?)`).run(uid, insight);
          }
        }
      }

      Logger.info('user_model', `Profile updated for uid=${uid} (completeness: ${completeness}%)`);
    } catch (e) {
      Logger.warn('user_model', 'Profile update skipped (non-critical)');
    }
  }

  /** Получить профиль как строку для системного промпта */
  static getProfileContext(uid: number): string {
    try {
      const profile = db.prepare('SELECT * FROM user_profiles WHERE uid=?').get(uid) as any;
      if (!profile || profile.profile_completeness < 10) return '';

      const interests: string[] = JSON.parse(profile.interest_topics || '[]');
      const expertise: string[] = JSON.parse(profile.expertise_areas || '[]');
      const insights = db.prepare(
        `SELECT insight FROM user_insights WHERE uid=? ORDER BY created_at DESC LIMIT 5`
      ).all(uid) as any[];

      let ctx = `\n## User personality model (completeness: ${Math.round(profile.profile_completeness)}%)\n`;
      ctx += `- Communication style: ${profile.communication_style}\n`;
      ctx += `- Prefers: ${profile.response_preference} responses\n`;
      if (interests.length) ctx += `- Interests: ${interests.slice(-8).join(', ')}\n`;
      if (expertise.length) ctx += `- Expertise: ${expertise.slice(-5).join(', ')}\n`;
      if (profile.language_patterns) ctx += `- Language notes: ${profile.language_patterns}\n`;
      if (insights.length) ctx += `- Insights: ${insights.map((i: any) => i.insight).join('; ')}\n`;

      return ctx;
    } catch {
      return '';
    }
  }

  /** Получить полный профиль пользователя */
  static getProfile(uid: number): UserPersonality | null {
    const row = db.prepare('SELECT * FROM user_profiles WHERE uid=?').get(uid) as any;
    if (!row) return null;
    return {
      ...row,
      expertise_areas: JSON.parse(row.expertise_areas || '[]'),
      interest_topics: JSON.parse(row.interest_topics || '[]'),
      typical_tasks: JSON.parse(row.typical_tasks || '[]'),
      motivation_triggers: JSON.parse(row.motivation_triggers || '[]'),
    };
  }
}
