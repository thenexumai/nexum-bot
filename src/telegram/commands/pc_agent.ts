import { Bot, InputFile } from 'grammy';
import { CONFIG } from '../../core/config';
import { agentConnections, pendingRequests } from '../../index';
import { Logger } from '../../infra/logger';
import crypto from 'crypto';
import {
    generatePcAgentToken,
    canUsePcAgent,
    getUserPcAgentToken,
    revokePcAgentToken
} from '../../core/pc_agent_auth';

export const setupPcAgentCommands = (bot: Bot) => {

    // /link_pc — генерирует персонализированный токен для PC Agent
    bot.command('link_pc', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        // Проверяем доступ к PC Agent (только Pro)
        if (!canUsePcAgent(uid)) {
            return ctx.reply(
                '💎 **PC Агент доступен только на Pro плане**\n\n' +
                'Обновись на Pro чтобы управлять своим компьютером через Telegram:\n' +
                '/tariffs — посмотреть тарифы',
                { parse_mode: 'Markdown' }
            );
        }

        // Генерируем персонализированный токен
        const token = generatePcAgentToken(uid); // Бессрочный для Pro
        
        const wsUrl = process.env.RAILWAY_STATIC_URL
            ? `wss://${process.env.RAILWAY_STATIC_URL}`
            : `ws://localhost:${CONFIG.PORT}`;

        await ctx.reply(
            `🖥 **Подключение твоего PC Агента**\n\n` +
            `**Вариант 1: Установка через npm (рекомендуется)**\n` +
            `\`\`\`bash\n` +
            `npm install -g @nexum/pc-agent\n` +
            `nexum-agent --token ${token}\n` +
            `\`\`\`\n\n` +
            `**Вариант 2: Через Python**\n` +
            `\`\`\`bash\n` +
            `pip install nexum-agent\n` +
            `nexum-agent --token ${token} --server ${wsUrl}\n` +
            `\`\`\`\n\n` +
            `**Вариант 3: Docker**\n` +
            `\`\`\`bash\n` +
            `docker run -e TOKEN=${token} nexum/pc-agent\n` +
            `\`\`\`\n\n` +
            `🔒 Этот токен **привязан только к тебе** и будет работать пока ты не отзовешь его.\n\n` +
            `⚠️ **Не делись токеном** — это ключ к твоему компьютеру!`,
            { parse_mode: 'Markdown' }
        );
        Logger.info('pc_agent', `Personal token created for UID ${uid}`);
    });

    // /pc_status — статус подключения PC агента
    bot.command('pc_status', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        if (!canUsePcAgent(uid)) {
            return ctx.reply('💎 PC Агент доступен только на Pro плане. /tariffs');
        }

        const connected = agentConnections.has(uid);
        const tokenInfo = getUserPcAgentToken(uid);

        if (connected && tokenInfo) {
            await ctx.reply(
                `🟢 **Твой PC Агент подключён**\n\n` +
                `💻 Компьютер: ${tokenInfo.pc_name || 'неизвестно'}\n` +
                `🖥 ОС: ${tokenInfo.pc_os || 'неизвестно'}\n` +
                `🕐 Последняя активность: ${tokenInfo.last_seen ? new Date(tokenInfo.last_seen).toLocaleString('ru-RU') : 'только что'}\n` +
                `🔑 Токен: \`${tokenInfo.token.slice(0, 20)}...\`\n\n` +
                `Готов к работе! Попробуй:\n` +
                `/screenshot — сделать снимок экрана`,
                { parse_mode: 'Markdown' }
            );
        } else if (tokenInfo) {
            await ctx.reply(
                `🔴 **PC Агент не подключён**\n\n` +
                `У тебя есть токен, но агент оффлайн.\n\n` +
                `Запусти агент на своём компьютере:\n` +
                `\`nexum-agent --token ${tokenInfo.token}\`\n\n` +
                `Или создай новый токен: /link_pc`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply(
                `🔴 **PC Агент не настроен**\n\n` +
                `Используй /link_pc чтобы получить токен и подключить свой компьютер.`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    // /screenshot — снимок экрана через PC agent
    bot.command('screenshot', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        if (!canUsePcAgent(uid)) {
            return ctx.reply('💎 PC Агент доступен только на Pro плане. /tariffs');
        }

        const ws = agentConnections.get(uid);
        if (!ws) {
            return ctx.reply('❌ Твой PC Агент не подключён. Используй /link_pc');
        }

        const requestId = crypto.randomUUID();
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
        const result = new Promise<any>((resolve) => pendingRequests.set(requestId, resolve));

        ws.send(JSON.stringify({ type: 'command', requestId, tool: 'screenshot', args: {} }));

        const response = await Promise.race([result, timeout]);
        if (!response) return ctx.reply('⏱ Таймаут — твой агент не ответил.');

        if (response.error) return ctx.reply(`❌ ${response.error}`);
        if (response.data) {
            const buf = Buffer.from(response.data, 'base64');
            await ctx.replyWithPhoto(new InputFile(buf, 'screenshot.png'));
        }
    });

    // /disconnect_pc — отключить PC Agent
    bot.command('disconnect_pc', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        if (!canUsePcAgent(uid)) {
            return ctx.reply('💎 PC Агент доступен только на Pro плане.');
        }

        const ws = agentConnections.get(uid);
        if (ws) {
            ws.close();
            agentConnections.delete(uid);
        }

        revokePcAgentToken(uid);

        await ctx.reply(
            '✅ **PC Агент отключён**\n\n' +
            'Токен отозван. Чтобы подключиться снова, используй /link_pc',
            { parse_mode: 'Markdown' }
        );
    });
};
