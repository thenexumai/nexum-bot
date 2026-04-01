import { Bot, BotCommand } from 'grammy';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands, setupByokAlias } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';
import { isAdmin } from '../../core/config';

// Команды для обычных пользователей
const USER_COMMANDS: BotCommand[] = [
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
    { command: 'tariffs',     description: '💎 Тарифы и подписка' },
    { command: 'lang',        description: '🌍 Язык (ru/en)' },
];

// Админские команды (добавляются к USER_COMMANDS)
const ADMIN_COMMANDS: BotCommand[] = [
    { command: 'fix',         description: '🔧 [ADMIN] Исправить баг' },
    { command: 'improve',     description: '⚡ [ADMIN] Улучшить код' },
    { command: 'patches',     description: '📋 [ADMIN] Список патчей' },
    { command: 'diag',        description: '🛠 [ADMIN] Диагностика' },
    { command: 'byok',        description: '🔑 [ADMIN] Управление API ключами' },
    { command: 'link_pc',     description: '🖥 [ADMIN] Подключить PC Агент' },
    { command: 'pc_status',   description: '🖥 [ADMIN] Статус PC Агента' },
    { command: 'screenshot',  description: '📸 [ADMIN] Снимок экрана PC' },
    { command: 'forget',      description: '🗑 [ADMIN] Очистить память' },
];

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupByokAlias(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);

    // Устанавливаем дефолтные команды для обычных пользователей
    bot.api.setMyCommands(USER_COMMANDS).catch((e: any) => console.error('setMyCommands error:', e));
}

// Функция для установки персонализированного меню при /start
export async function setPersonalizedCommands(bot: Bot, userId: number) {
    try {
        const commands = isAdmin(userId) 
            ? [...USER_COMMANDS, ...ADMIN_COMMANDS]
            : USER_COMMANDS;
        
        await bot.api.setMyCommands(commands, { scope: { type: 'chat', chat_id: userId } });
    } catch (e) {
        console.error('setPersonalizedCommands error:', e);
    }
}
