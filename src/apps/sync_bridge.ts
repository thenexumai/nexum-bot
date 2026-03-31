import { bot } from '../index';
import db from '../core/db';
import { Logger } from '../infra/logger';

export class SyncBridge {
    static async notifyFromBrowser(uid: number, event: string, details: any) {
        Logger.info('sync', `Browser Signal: ${event} for UID ${uid}`);

        try {
            switch (event) {
                case 'page_visit':
                    // Сохраняем в историю и проверяем на интент (например, поиск товара)
                    if (details.url.includes('amazon') || details.url.includes('ozon')) {
                        await bot.api.sendMessage(uid, `🛒 Вижу, вы смотрите товар в браузере. Хотите, чтобы я отследил цену или записал в список покупок?`, {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: "✅ Записать", callback_data: `add_task:Buy ${details.title.slice(0,20)}` },
                                    { text: "❌ Нет", callback_data: "cancel" }
                                ]]
                            }
                        });
                    }
                    break;
                
                case 'data_extraction':
                    // Результат парсинга страницы
                    await bot.api.sendMessage(uid, `📊 NEXUM Browser извлек данные:\n\n${JSON.stringify(details.data, null, 2)}`);
                    break;
            }
        } catch (e) {
            Logger.error('sync', 'Failed to bridge browser to bot', e);
        }
    }
}
