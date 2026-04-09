/**
 * HeartbeatRunner — периодические задачи NEXUM.
 * Каждые 30 минут: самодиагностика, обновление воркспейса для активных пользователей.
 */
import { SelfHealing } from '../../evolution/SelfHealing';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { Logger } from '../../infra/logger';
import db from '../db';

let ownerNotifier: ((text: string) => Promise<void>) | undefined;

export function setOwnerNotifier(fn: (text: string) => Promise<void>): void {
    ownerNotifier = fn;
}

export function startHeartbeat(): void {
    Logger.info('heartbeat', 'Starting NEXUM heartbeat (30min interval)');

    setInterval(async () => {
        try {
            Logger.info('heartbeat', 'Heartbeat tick');

            // 1. Самодиагностика
            await SelfHealing.runHealing(ownerNotifier);

            // 2. Обновить SOUL.md для активных пользователей (раз в день)
            const activeUsers = db.prepare(`
                SELECT uid, first_name FROM users
                WHERE last_active > datetime('now', '-1 day')
                AND msg_count_today > 5
                LIMIT 20
            `).all() as any[];

            for (const u of activeUsers) {
                try {
                    // Проверяем когда последний раз обновлялся SOUL.md
                    const soulFile = db.prepare(
                        `SELECT updated_at FROM workspace_files WHERE uid=? AND filename='SOUL.md'`
                    ).get(u.uid) as any;

                    const lastUpdate = soulFile?.updated_at ? new Date(soulFile.updated_at) : null;
                    const hoursSince = lastUpdate
                        ? (Date.now() - lastUpdate.getTime()) / 3600000
                        : 999;

                    if (hoursSince > 24) {
                        const { WorkspaceAI } = await import('../workspace/WorkspaceAI');
                        await WorkspaceAI.refreshSoul(u.uid, u.first_name || 'User');
                    }
                } catch (e) {
                    Logger.warn('heartbeat', `Soul refresh failed for uid:${u.uid}: ${e}`);
                }
            }

            // 3. Дневная заметка о работе бота
            const stats = db.prepare(`
                SELECT COUNT(*) as cnt FROM users WHERE last_active > datetime('now', '-1 hour')
            `).get() as any;
            Logger.info('heartbeat', `Active users last hour: ${stats?.cnt || 0}`);

        } catch (e) {
            Logger.error('heartbeat', `Heartbeat error: ${e}`);
            SelfHealing.recordError(`Heartbeat error: ${e}`);
        }
    }, 30 * 60 * 1000); // 30 минут

    // Первый запуск через 5 минут
    setTimeout(async () => {
        Logger.info('heartbeat', 'First heartbeat check');
        await SelfHealing.runHealing(ownerNotifier).catch(() => {});
    }, 5 * 60 * 1000);
}
