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
        db.prepare("UPDATE tasks SET status = 'running' WHERE id = ?").run(id);
        Logger.info('missions', `Mission ${id} is now RUNNING`);

        try {
            const research = await Perplexer.deepSearch(objective, uid);
            const report = research.answer;
            
            db.prepare(`
                INSERT INTO notes (uid, title, content, tags)
                VALUES (?, ?, ?, ?)
            `).run(uid, `Отчёт: ${objective.slice(0, 30)}`, report, 'ai-mission, research');

            await bot.api.sendMessage(
                uid,
                `✅ *Миссия выполнена!*\n\n` +
                `🎯 Цель: ${objective}\n\n` +
                `📝 Отчёт сохранён в твоих заметках.`,
                { parse_mode: 'Markdown' }
            );

            db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(id);
            Logger.success('missions', `Mission ${id} COMPLETED`);
        } catch (e: any) {  // e was unknown — cast to any to access .message
            Logger.error('missions', `Mission ${id} FAILED`, e);
            db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(id);
            await bot.api.sendMessage(
                uid,
                `❌ *Миссия провалена.*\n` +
                `Ошибка: ${e.message || 'неизвестная ошибка'}`
            );
        }
    }
}
