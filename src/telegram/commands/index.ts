import { Bot } from 'grammy';
import type { BotCommand } from 'grammy/types';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands, setupByokAlias } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';
import { isOwner } from '../../core/config';
import db from '../../core/db';

// Команды для всех пользователей (Free, Middle, Pro)
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

// Команды для Pro пользователей (дополнительно к USER_COMMANDS)
const PRO_COMMANDS: BotCommand[] = [
    { command: 'byok',        description: '🔑 [PRO] Свои API ключи' },
    { command: 'link_pc',     description: '🖥 [PRO] Подключить PC Агент' },
    { command: 'pc_status',   description: '🖥 [PRO] Статус PC Агента' },
    { command: 'screenshot',  description: '📸 [PRO] Снимок экрана PC' },
];

// Команды ТОЛЬКО для владельца проекта NEXUM (дополнительно ко всем)
const OWNER_COMMANDS: BotCommand[] = [
    { command: 'fix',         description: '🔧 [OWNER] Исправить баг' },
    { command: 'improve',     description: '⚡ [OWNER] Улучшить код' },
    { command: 'patches',     description: '📋 [OWNER] Список патчей' },
    { command: 'diag',        description: '🛠 [OWNER] Диагностика' },
    { command: 'forget',      description: '🗑 [OWNER] Очистить память любого пользователя' },
];

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupByokAlias(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);

    // Устанавливаем дефолтные команды для обычных пользователей
    // Сначала удаляем все старые команды, затем устанавливаем новые
    bot.api.deleteMyCommands().then(() => {
        return bot.api.setMyCommands(USER_COMMANDS);
    }).catch((e: any) => console.error('setMyCommands error:', e));
}

/**
 * Проверяет план подписки пользователя
 */
function getUserPlan(uid: number): string {
    try {
        const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
        return user?.subscription_plan || 'free';
    } catch {
        return 'free';
    }
}

/**
 * Устанавливает персонализированное меню команд для пользователя
 * - Free/Middle: базовые команды
 * - Pro: базовые + PC Agent + BYOK
 * - Owner: все команды + управление системой
 */
export async function setPersonalizedCommands(bot: Bot, userId: number) {
    try {
        let commands = [...USER_COMMANDS];
        
        // Владелец проекта NEXUM видит ВСЁ
        if (isOwner(userId)) {
            commands = [...USER_COMMANDS, ...PRO_COMMANDS, ...OWNER_COMMANDS];
        }
        // Pro пользователи видят свои дополнительные команды
        else if (getUserPlan(userId) === 'pro') {
            commands = [...USER_COMMANDS, ...PRO_COMMANDS];
        }
        // Free/Middle - только базовые команды
        
        await bot.api.setMyCommands(commands, { scope: { type: 'chat', chat_id: userId } });
    } catch (e) {
        console.error('setPersonalizedCommands error:', e);
    }
}
