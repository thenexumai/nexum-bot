import { Bot } from 'grammy';
import { setupGeneralCommands } from './general';
import { setupPcAgentCommands } from './pc_agent';
import { setupByokCommands } from './byok';
import { setupAdminCommands } from './admin';
import { registerEvolutionCommands } from './evolution';
import { CONFIG } from '../../core/config';

export function setupCommands(bot: Bot) {
    setupGeneralCommands(bot);
    setupPcAgentCommands(bot);
    setupByokCommands(bot);
    setupAdminCommands(bot);
    registerEvolutionCommands(bot);

    bot.api.setMyCommands([
        { command: 'start',      description: 'Запустить NEXUM' },
        { command: 'help',       description: 'Справка' },
        { command: 'status',     description: 'Мой статус и план' },
        { command: 'apps',       description: 'Открыть Mini Apps' },
        { command: 'new',        description: 'Сбросить сессию' },
        { command: 'memory',     description: 'Моя память' },
        { command: 'forget',     description: 'Очистить память' },
        { command: 'remind',     description: 'Установить напоминание' },
        { command: 'reminders',  description: 'Список напоминаний' },
        { command: 'search',     description: 'Поиск в интернете' },
        { command: 'byok',       description: 'Добавить свой API ключ' },
        { command: 'link_pc',    description: 'Подключить PC Агент' },
        { command: 'pc_status',  description: 'Статус PC Агента' },
        { command: 'screenshot', description: 'Снимок экрана' },
        { command: 'tariffs',    description: 'Тарифы и подписка' },
        { command: 'lang',       description: 'Язык (ru/en)' },
        { command: 'clear',      description: 'Очистить историю диалога' },
    ]).catch(() => {});
}
