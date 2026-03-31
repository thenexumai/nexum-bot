import db from '../db';
import { Logger } from '../../infra/logger';
import { Perplexer } from '../../agent/perplexer';
import { bot } from '../../index';

export type MissionStatus = 'queued' | 'running' | 'completed' | 'failed';

export class MissionControl {
    static async createMission(uid: number, objective: string) {
        Logger.info('missions', `New mission for ${uid}: ${objective}`);
        
        const missionId = db.prepare(`
            INSERT INTO tasks (uid, title, description, status, priority)
            VALUES (?, ?, ?, 'queued', 'high')
        `).run(uid, 'AI Mission', objective).lastInsertRowid;

        this.runMission(Number(missionId), uid, objective);
        
        return missionId;
    }

    private static async runMission(id: number, uid: number, objective: string) {
        db.prepare("UPDATE tasks SET status = 'running', progress = 10 WHERE id = ?").run(id);
        Logger.info('missions', `Mission ${id} is now RUNNING`);

        try {
            // 1. Глубокий поиск и анализ (30%)
            db.prepare("UPDATE tasks SET progress = 30 WHERE id = ?").run(id);
            const research = await Perplexer.deepSearch(objective, uid);
            
            // 2. Формирование финального отчета (70%)
            db.prepare("UPDATE tasks SET progress = 70 WHERE id = ?").run(id);
            const report = research.answer;
            
            // 3. Сохранение результата в заметки (90%)
            db.prepare(`
                INSERT INTO notes (uid, title, content, tags)
                VALUES (?, ?, ?, ?)
            `).run(uid, `Report: ${objective.slice(0, 30)}`, report, 'ai-mission, research');

            // 4. Уведомление в Telegram
            await bot.api.sendMessage(uid, `✅ **Миссия завершена!**\n\nОбъектив: ${objective}\n\nРезультат сохранен в ваши заметки.`, { parse_mode: 'Markdown' });

            db.prepare("UPDATE tasks SET status = 'completed', progress = 100 WHERE id = ?").run(id);
            Logger.success('missions', `Mission ${id} COMPLETED`);
        } catch (e: any) {
            Logger.error('missions', `Mission ${id} FAILED`, e);
            db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(id);
            await bot.api.sendMessage(uid, `❌ **Миссия провалена.**\nОшибка: ${e.message}`);
        }
    }
}
