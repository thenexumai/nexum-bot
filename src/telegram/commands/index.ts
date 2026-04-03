import { Bot } from 'grammy';
import type { BotCommand } from 'grammy/types';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands, setupByokAlias } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';
import { setupCodeCommands } from './code';
import { setupOwnerCommands } from './owner';
import { isOwner } from '../../core/config';
import db from '../../core/db';

// Команды для всех пользователей
const USER_COMMANDS: BotCommand[] = [
    { command: 'start',       description: '🚀 Главное меню' },
    { command: 'help',        description: '📚 Справка по командам' },
    { command: 'status',      description: '📊 Мой статус и план' },
    { command: 'mode',        description: '🎯 Режим ответов AI' },
    { command: 'apps',        description: '📱 Mini Apps' },
    { command: 'memory',      description: '🧠 Долгосрочная память' },
    { command: 'skills',      description: '⚡ Мои навыки' },
    { command: 'profile',     description: '👤 Мой профиль' },
    { command: 'search',      description: '🔍 Поиск в интернете' },
    { command: 'remind',      description: '⏰ Установить напоминание' },
    { command: 'reminders',   description: '📋 Список напоминаний' },
    { command: 'new',         description: '🔄 Сбросить сессию' },
    { command: 'clear',       description: '🧹 Очистить историю' },
    { command: 'tariffs',     description: '💎 Тарифы и подписка' },
    { command: 'lang',        description: '🌍 Язык (ru/en)' },
];

// Дополнительные команды для Pro
const PRO_COMMANDS: BotCommand[] = [
    { command: 'byok',        description: '🔑 [PRO] Свои API ключи' },
    { command: 'link_pc',     description: '🖥 [PRO] Подключить PC Агент' },
    { command: 'pc_status',   description: '🖥 [PRO] Статус PC Агента' },
    { command: 'screenshot',  description: '📸 [PRO] Снимок экрана' },
];

// Команды ТОЛЬКО для владельца — НЕ видны другим пользователям
const OWNER_COMMANDS: BotCommand[] = [
    { command: 'owner',       description: '👑 Панель управления NEXUM' },
    { command: 'sub_give',    description: '💳 Выдать подписку пользователю' },
    { command: 'sub_revoke',  description: '❌ Сбросить подписку' },
    { command: 'sub_list',    description: '📋 Все активные подписки' },
    { command: 'user_info',   description: '👤 Инфо о пользователе' },
    { command: 'user_list',   description: '👥 Список пользователей' },
    { command: 'ban',         description: '🚫 Заблокировать пользователя' },
    { command: 'unban',       description: '✅ Разблокировать' },
    { command: 'broadcast',   description: '📢 Рассылка всем' },
    { command: 'stats',       description: '📊 Статистика бота' },
    { command: 'diag',        description: '🛠 Диагностика системы' },
    { command: 'fix',         description: '🔧 Автоисправление бага' },
    { command: 'improve',     description: '⚡ Улучшить код' },
    { command: 'patches',     description: '📋 Список патчей' },
    { command: 'code_read',   description: '📖 Прочитать файл' },
    { command: 'code_edit',   description: '✏️ Редактировать файл' },
    { command: 'code_create', description: '📝 Создать файл' },
    { command: 'bash',        description: '💻 Выполнить bash команду' },
    { command: 'git_status',  description: '🔀 Git статус' },
    { command: 'git_commit',  description: '💾 Git коммит' },
];

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupByokAlias(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);
    setupCodeCommands(bot);
    setupOwnerCommands(bot);  // Owner-only команды

    // Дефолтные команды для обычных пользователей (глобально)
    bot.api.setMyCommands(USER_COMMANDS).catch((e: any) =>
        console.error('setMyCommands (global) error:', e)
    );
}

function getUserPlan(uid: number): string {
    try {
        const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
        return user?.subscription_plan || 'free';
    } catch {
        return 'free';
    }
}

/**
 * Устанавливает персонализированное меню команд для конкретного пользователя.
 * Owner видит ВСЁ. Pro видит USER + PRO. Free/Middle видят только USER.
 * Использует scope: { type: 'chat', chat_id: uid } — команды видны только этому юзеру.
 */
export async function setPersonalizedCommands(bot: Bot, userId: number) {
    try {
        let commands: BotCommand[];

        if (isOwner(userId)) {
            // Владелец: полное меню включая owner-команды
            commands = [...USER_COMMANDS, ...PRO_COMMANDS, ...OWNER_COMMANDS];
        } else if (getUserPlan(userId) === 'pro') {
            commands = [...USER_COMMANDS, ...PRO_COMMANDS];
        } else {
            commands = [...USER_COMMANDS];
        }

        // scope: chat — команды видны ТОЛЬКО этому пользователю в его чате с ботом
        await bot.api.setMyCommands(commands, {
            scope: { type: 'chat', chat_id: userId }
        });
    } catch (e) {
        console.error('setPersonalizedCommands error:', e);
    }
}
