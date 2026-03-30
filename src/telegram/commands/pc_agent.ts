import { Bot, InputFile } from 'grammy';
import { CONFIG } from '../../core/config';
import { createLinkToken, agentConnections, pendingRequests } from '../../index';
import { Logger } from '../../infra/logger';
import crypto from 'crypto';

export const setupPcAgentCommands = (bot: Bot) => {

    // /link_pc — generates secure one-time token for PC Agent auth
    bot.command('link_pc', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        const token = createLinkToken(uid);
        const wsUrl = process.env.RAILWAY_STATIC_URL
            ? `wss://${process.env.RAILWAY_STATIC_URL}`
            : `ws://localhost:${CONFIG.PORT}`;

        await ctx.reply(
            `🖥 **Подключение PC Агента**\n\n` +
            `Запусти агент на своём компьютере:\n\n` +
            `\`python nexum_agent.py --token ${token} --server ${wsUrl}\`\n\n` +
            `⏱ Токен действителен **10 минут**. После подключения он аннулируется.`,
            { parse_mode: 'Markdown' }
        );
        Logger.info('pc_agent', `Link token created for UID ${uid}`);
    });

    // /pc_status — check if PC agent is connected
    bot.command('pc_status', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        const connected = agentConnections.has(uid);
        await ctx.reply(
            connected
                ? '🟢 **PC Агент подключён** и готов к работе.'
                : '🔴 **PC Агент не подключён.** Используй /link_pc чтобы подключить.',
            { parse_mode: 'Markdown' }
        );
    });

    // /screenshot — take screenshot via PC agent
    bot.command('screenshot', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        const ws = agentConnections.get(uid);
        if (!ws) {
            return ctx.reply('❌ PC Агент не подключён. Используй /link_pc');
        }

        const requestId = crypto.randomUUID();
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
        const result = new Promise<any>((resolve) => pendingRequests.set(requestId, resolve));

        ws.send(JSON.stringify({ type: 'command', requestId, tool: 'screenshot', args: {} }));

        const response = await Promise.race([result, timeout]);
        if (!response) return ctx.reply('⏱ Таймаут — агент не ответил.');

        if (response.error) return ctx.reply(`❌ ${response.error}`);
        if (response.data) {
            const buf = Buffer.from(response.data, 'base64');
            await ctx.replyWithPhoto(new InputFile(buf, "screenshot.png"));
        }
    });
};
