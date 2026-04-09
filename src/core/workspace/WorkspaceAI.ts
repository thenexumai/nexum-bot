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
            const { text: rawText } = await smartChat(prompt, { max_tokens: 300, temperature: 0.2 });

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

    /** Регенерировать SOUL.md на основе накопленных данных */
    static async refreshSoul(uid: number, firstName: string): Promise<void> {
        try {
            const userMd = WorkspaceManager.read(uid, 'USER.md');
            const memoryMd = WorkspaceManager.read(uid, 'MEMORY.md');
            if (!userMd || userMd.length < 100) return;

            // smartChat возвращает { text, provider } — деструктурируем
            const { text } = await smartChat([
                {
                    role: 'system',
                    content: 'Ты NEXUM. На основе информации о пользователе напиши персонализированный SOUL.md — как тебе нужно общаться именно с этим человеком. Краткий файл 5-10 строк в markdown формате.'
                },
                {
                    role: 'user',
                    content: `USER.md:\n${userMd.slice(0, 600)}\n\nMEMORY:\n${memoryMd.slice(0, 400)}`
                }
            ], { max_tokens: 400, temperature: 0.6 });

            WorkspaceManager.write(uid, 'SOUL.md', text);
            Logger.info('workspaceAI', `SOUL.md refreshed for uid:${uid}`);
        } catch (e) {
            Logger.warn('workspaceAI', `refreshSoul failed: ${e}`);
        }
    }
}
