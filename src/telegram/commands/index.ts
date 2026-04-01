import { Bot } from 'grammy';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands, setupByokAlias } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupByokAlias(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);

    // Меню команд в Telegram (видно пользователю через кнопку / )
    bot.api.setMyCommands([
        { command: 'start',       description: '🚀 Главное меню' },
        { command: 'help',        description: '📚 Справка по командам' },
        { command: 'status',      description: '📊 Мой статус и план' },
        { command: 'mode',        description: '🎯 Режим ответов AI' },
        { command: 'apps',        description: '📱 Mini Apps (задачи, финансы, заметки)' },
        { command: 'memory',      description: '🧠 Долгосрочная память' },
        { command: 'skills',      description: '⚡ Мои навыки' },
        { command: 'profile',     description: '👤 Мой профиль личности' },
        { command: 'search',      description: '🔍 Поиск в интернете' },
        { command: 'remind',      description: '⏰ Установить напоминание' },
        { command: 'reminders',   description: '📋 Список напоминаний' },
        { command: 'new',         description: '🔄 Сбросить сессию' },
        { command: 'clear',       description: '🧹 Очистить историю диалога' },
        { command: 'forget',      description: '🗑 Очистить память' },
        { command: 'byok',        description: '🔑 Мои API ключи (BYOK)' },
        { command: 'link_pc',     description: '🖥 Подключить PC Агент' },
        { command: 'pc_status',   description: '🖥 Статус PC Агента' },
        { command: 'screenshot',  description: '📸 Снимок экрана PC' },
        { command: 'tariffs',     description: '💎 Тарифы и подписка' },
        { command: 'lang',        description: '🌍 Язык (ru/en)' },
    ]).catch((e: any) => console.error('setMyCommands error:', e));
}
