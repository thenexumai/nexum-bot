/**
 * WorkspaceAI — NEXUM анализирует диалог и автоматически обновляет воркспейс пользователя.
 * Извлекает факты, обновляет USER.md, пишет дневные заметки, обновляет MEMORY.md.
 */
import { WorkspaceManager } from './WorkspaceManager';
import { smartChat } from '../providers/openrouter';
import { Logger } from '../../infra/logger';

export class WorkspaceAI {
  /**
   * Запустить фоновый анализ диалога — обновить воркспейс.
   * Вызывается асинхронно, не блокирует ответ пользователю.
   */
  static async analyzeAndUpdate(uid: number, userMessage: string, assistantReply: string): Promise<void> {
    try {
      const currentUser = WorkspaceManager.read(uid, 'USER.md');
      const prompt = [
        {
          role: 'system' as const,
          content: `Ты система памяти NEXUM. Анализируй диалог и извлекай важные факты о пользователе.
Ответь строго в JSON формате:
{
  "user_facts": ["факт1", "факт2"],
  "memory_entry": "текст или null",
  "daily_note": "текст или null"
}
Существующие данные USER.md:
${currentUser.slice(0, 500)}
Извлекай только НОВЫЕ факты, не дублируй существующие.`
        },
        {
          role: 'user' as const,
          content: `Пользователь написал: "${userMessage.slice(0, 300)}"\nNEXUM ответил: "${assistantReply.slice(0, 300)}"`
        }
      ];

      // smartChat возвращает { text, provider } — деструктурируем
      const result = await smartChat(prompt, { max_tokens: 300, temperature: 0.2 });
      const rawText: string = result.text;

      // Извлечь JSON из ответа
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.user_facts?.length) {
        for (const fact of parsed.user_facts) {
          WorkspaceManager.updateUserFact(uid, fact);
        }
        Logger.info('workspaceAI', `Updated ${parsed.user_facts.length} user facts for uid:${uid}`);
      }

      if (parsed.memory_entry) {
        WorkspaceManager.updateMemory(uid, parsed.memory_entry);
      }

      if (parsed.daily_note) {
        WorkspaceManager.appendDaily(uid, parsed.daily_note);
      }
    } catch (e) {
      Logger.warn('workspaceAI', `Background analysis failed: ${e}`);
    }
  }

  /**
   * Обновить SOUL.md на основе паттернов общения пользователя (раз в N сообщений)
   */
  static async refreshSoul(uid: number, recentMessages: string[]): Promise<void> {
    try {
      const currentSoul = WorkspaceManager.read(uid, 'SOUL.md');
      const sample = recentMessages.slice(-10).join('\n').slice(0, 800);
      const prompt = [
        {
          role: 'system' as const,
          content: 'Ты система персонализации NEXUM. На основе сообщений пользователя обнови SOUL.md — как NEXUM должен общаться с этим человеком. Ответь только обновлённым текстом SOUL.md, без пояснений.'
        },
        {
          role: 'user' as const,
          content: `Текущий SOUL.md:\n${currentSoul.slice(0, 400)}\n\nПоследние сообщения пользователя:\n${sample}`
        }
      ];

      const result = await smartChat(prompt, { max_tokens: 400, temperature: 0.3 });
      const newSoul: string = result.text;

      if (newSoul && newSoul.length > 50) {
        WorkspaceManager.write(uid, 'SOUL.md', newSoul);
        Logger.info('workspaceAI', `Soul refreshed for uid:${uid}`);
      }
    } catch (e) {
      Logger.warn('workspaceAI', `Soul refresh failed: ${e}`);
    }
  }
}
