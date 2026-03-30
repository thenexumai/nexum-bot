import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
import { CONFIG } from '../core/config';
import db from '../core/db';
import fetch from 'node-fetch';

// ============================================================
//  MAIN BOT SETUP
// ============================================================

export const setupBot = (bot: Bot) => {
    setupCommands(bot);

    // --- CALLBACK QUERIES ---
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;

        // PC approval buttons
        if (data.startsWith('appr_')) {
            const [actionId, status] = data.replace('appr_', '').split(':');
            const approved = status === 'allow';
            handleApprovalResult(actionId, approved);
            await ctx.answerCallbackQuery(approved ? '✅ Разрешено' : '❌ Отклонено');
            await ctx.editMessageText(
                approved ? '✅ Действие выполнено.' : '❌ Действие отклонено.',
                { reply_markup: undefined }
            ).catch(() => {});
            return;
        }

        await ctx.answerCallbackQuery();
    });

    // --- VOICE MESSAGES ---
    bot.on('message:voice', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        try {
            await ctx.replyWithChatAction('typing');
            const file = await ctx.getFile();
            const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
            const res = await fetch(url);
            const buffer = Buffer.from(await res.arrayBuffer());

            const text = await transcribeVoice(buffer);
            if (!text) {
                await ctx.reply('❌ Не удалось распознать голос. Попробуй ещё раз.');
                return;
            }

            await ctx.reply(`🎙 *Распознано:*\n_${safeMarkdown(text)}_`, { parse_mode: 'Markdown' });
            await processAIRequest(ctx, text, uid);
        } catch (err) {
            Logger.error('telegram', 'Voice error', err);
            await ctx.reply('❌ Ошибка при обработке голоса.');
        }
    });

    // --- PHOTOS (screenshot analysis) ---
    bot.on('message:photo', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const caption = ctx.message.caption || 'Что на этом изображении?';
        await processAIRequest(ctx, `[Фото] ${caption}`, uid);
    });

    // --- TEXT MESSAGES ---
    bot.on('message:text', async (ctx: Context) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const text = ctx.message?.text || '';
        if (text.startsWith('/')) return; // commands handled separately
        await processAIRequest(ctx, text, uid);
    });
};

// ============================================================
//  CORE AI PROCESSING
// ============================================================

async function processAIRequest(ctx: Context, text: string, uid: number) {
    Logger.info('telegram', `Request from UID ${uid}: ${text.slice(0, 80)}`);

    // Ensure user exists in DB
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    // Check daily message limit
    const user = db.prepare('SELECT subscription_plan, msg_count_today FROM users WHERE uid = ?').get(uid) as any;
    const plan = user?.subscription_plan || 'free';
    const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
    const count = user?.msg_count_today || 0;

    if (count >= limit) {
        await ctx.reply(
            `⚠️ *Лимит сообщений исчерпан* (${limit}/день)\n\nОбнови план: /tariffs`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Increment message count
    db.prepare('UPDATE users SET msg_count_today = msg_count_today + 1 WHERE uid = ?').run(uid);

    // Show typing indicator
    await ctx.replyWithChatAction('typing').catch(() => {});

    try {
        // Send placeholder
        const placeholder = await ctx.reply('⏳', { parse_mode: 'Markdown' });
        let fullResponse = '';
        let lastEdit = Date.now();

        await executeAI(text, uid, [], async (chunk: string) => {
            fullResponse += chunk;
            // Edit message every 1.5 seconds to avoid flood limits
            if (Date.now() - lastEdit > 1500 && fullResponse.length > 0) {
                lastEdit = Date.now();
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    placeholder.message_id,
                    truncate(fullResponse) + ' ⏳',
                    { parse_mode: 'Markdown' }
                ).catch(() => {});
            }
        });

        // Final edit with full response
        if (fullResponse) {
            // Split long messages
            const chunks = splitMessage(fullResponse);
            await ctx.api.editMessageText(
                ctx.chat!.id,
                placeholder.message_id,
                chunks[0],
                { parse_mode: 'Markdown' }
            ).catch(() => ctx.reply(chunks[0]));

            for (let i = 1; i < chunks.length; i++) {
                await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => {});
            }
        } else {
            await ctx.api.editMessageText(ctx.chat!.id, placeholder.message_id, '🤖 Нет ответа.').catch(() => {});
        }
    } catch (err) {
        Logger.error('telegram', `AI request failed for UID ${uid}`, err);
        await ctx.reply('❌ Произошла ошибка. Попробуй ещё раз.');
    }
}

// ============================================================
//  APPROVAL BUTTONS (used by exec-approvals.ts)
// ============================================================

export const sendApprovalButtons = async (
    bot: Bot,
    uid: number,
    actionId: string,
    action: string,
    args: any
) => {
    const keyboard = new InlineKeyboard()
        .text('✅ Разрешить', `appr_${actionId}:allow`)
        .text('❌ Отклонить', `appr_${actionId}:deny`);

    await bot.api.sendMessage(
        uid,
        `⚠️ *Запрос на выполнение действия*\n\nДействие: \`${action}\`\nАргументы: \`${JSON.stringify(args).slice(0, 200)}\`\n\nРазрешить?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
};

// ============================================================
//  HELPERS
// ============================================================

function ensureUser(uid: number, username?: string, firstName?: string) {
    const exists = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid);
    if (!exists) {
        db.prepare('INSERT OR IGNORE INTO users (uid, username, first_name, msg_count_today) VALUES (?, ?, ?, 0)')
            .run(uid, username || '', firstName || '');
    }
}

function safeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function truncate(text: string, max = 3800): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
}

function splitMessage(text: string, max = 4000): string[] {
    if (text.length <= max) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.slice(0, max));
        remaining = remaining.slice(max);
    }
    return chunks;
}
