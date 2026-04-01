import { Bot } from 'grammy';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);

    // Устанавливаем команды в меню Telegram (видны пользователю)
    bot.api.setMyCommands([
        { command: 'start',      description: '🚀 Запустить NEXUM' },
        { command: 'help',       description: '📚 Справка по командам' },
        { command: 'status',     description: '📊 Мой статус и план' },
        { command: 'apps',       description: '📱 Открыть Mini Apps' },
        { command: 'mode',       description: '🎯 Режим ответов' },
        { command: 'memory',     description: '🧠 Моя долгосрочная память' },
        { command: 'skills',     description: '⚡ Мои навыки' },
        { command: 'profile',    description: '👤 Мой профиль' },
        { command: 'forget',     description: '🗑 Очистить память' },
        { command: 'remind',     description: '⏰ Установить напоминание' },
        { command: 'reminders',  description: '📋 Список напоминаний' },
        { command: 'search',     description: '🔍 Поиск в интернете' },
        { command: 'new',        description: '🔄 Сбросить сессию' },
        { command: 'clear',      description: '🧹 Очистить историю диалога' },
        { command: 'byok',       description: '🔑 Добавить свой API ключ' },
        { command: 'link_pc',    description: '🖥 Подключить PC Агент' },
        { command: 'pc_status',  description: '🖥 Статус PC Агента' },
        { command: 'screenshot', description: '📸 Снимок экрана PC' },
        { command: 'tariffs',    description: '💎 Тарифы и подписка' },
        { command: 'lang',       description: '🌍 Язык интерфейса (ru/en)' },
    ]).catch((e: any) => console.error('setMyCommands error:', e));
}
