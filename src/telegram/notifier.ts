import { bot } from '../index';
import { Logger } from '../infra/logger';

export class SmartNotifier {
    static async sendImportant(uid: number, message: string, options: any = {}) {
        Logger.info('notifier', `Sending important update to ${uid}`);
        
        try {
            await bot.api.sendMessage(uid, `🔔 **IMPORTANT UPDATE**\n\n${message}`, {
                parse_mode: 'Markdown',
                ...options
            });
        } catch (e) {
            Logger.error('notifier', `Failed to notify user ${uid}`, e);
        }
    }

    static async broadcastAdmin(message: string) {
        const ADMIN_ID = 387182659;
        Logger.info('notifier', `Notifying Admin: ${message}`);
        await this.sendImportant(ADMIN_ID, `🛡 **ADMIN ALERT**\n${message}`);
    }
}
