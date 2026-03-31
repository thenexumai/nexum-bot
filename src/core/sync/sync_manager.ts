import db from '../db';
import { Logger } from '../../infra/logger';
import { SmartNotifier } from '../../telegram/notifier';

export type SyncEntity = 'history' | 'finance' | 'tasks' | 'knowledge';

export class SyncManager {
    static async syncData(uid: number, entity: SyncEntity, data: any) {
        Logger.info('sync', `Syncing ${entity} for user ${uid}`);

        try {
            switch (entity) {
                case 'history':
                    await this.syncBrowserHistory(uid, data);
                    break;
                case 'finance':
                    await this.syncFinance(uid, data);
                    break;
                case 'knowledge':
                    await this.syncKnowledge(uid, data);
                    break;
            }
            
            Logger.success('sync', `${entity} synchronized successfully`);
        } catch (e) {
            Logger.error('sync', `Synchronization failed for ${entity}`, e);
        }
    }

    private static async syncBrowserHistory(uid: number, data: any) {
        // Сохраняем в специальную таблицу для анализа поведения
        db.prepare(`
            INSERT INTO audit_log (uid, action, details, timestamp)
            VALUES (?, 'browser_history_sync', ?, datetime('now'))
        `).run(uid, JSON.stringify(data));
        
        // Если нашли что-то важное (например, покупку), уведомляем бота
        if (data.url.includes('checkout') || data.url.includes('pay')) {
            await SmartNotifier.sendImportant(uid, `Detected potential payment activity in browser: ${data.title}. Want to record this in Finance?`);
        }
    }

    private static async syncFinance(uid: number, data: any) {
        db.prepare(`
            INSERT INTO finance (uid, type, amount, category, note)
            VALUES (?, ?, ?, ?, ?)
        `).run(uid, data.type, data.amount, data.category, data.note);
    }

    private static async syncKnowledge(uid: number, data: any) {
        // Обновление графа знаний
    }
}
