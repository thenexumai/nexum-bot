import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
import { CONFIG } from '../core/config';
import db from '../core/db';
import { getSessionHistory, appendToSession, clearSession } from '../state/session';
import fetch from 'node-fetch';

// ============================================================
//  STREAMING EDIT INTERVALS
// ============================================================
const STREAM_EDIT_INTERVAL_MS = 1200; // Update message every 1.2s during stream
const TYPING_DOTS = ['...', '   ', '...', '   '];
let typingIdx = 0;

// ============================================================
//  MAIN BOT SETUP
// ============================================================

export const setupBot = (bot: Bot) => {
    setupCommands(bot);

    // --- CALLBACK QUERIES ---
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;

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
                await ctx.reply('🎤 Не удалось распознать голос. Попробуй ещё раз или напиши текстом.');
                return;
            }

            await ctx.reply(`🎤 *Распознано:*\n_${safeMarkdown(text)}_`, { parse_mode: 'Markdown' });
            await processAIRequest(ctx, text, uid);
        } catch (err) {
            Logger.error('telegram', 'Voice error', err);
            await ctx.reply('❌ Ошибка при обработке голоса.');
        }
    });

    // --- PHOTOS (Vision) ---
    bot.on('message:photo', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;

        try {
            const caption = ctx.message.caption || 'Что на этом изображении? Опиши подробно.';
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const file = await ctx.getFile();
            const imageUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

            // Pass image URL as special marker in the prompt for vision processing
            await processAIRequest(ctx, `[vision:${imageUrl}] ${caption}`, uid);
        } catch (err) {
            Logger.error('telegram', 'Photo error', err);
            await ctx.reply('❌ Ошибка при анализе фото.');
        }
    });

    // --- DOCUMENTS ---
    bot.on('message:document', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const doc = ctx.message.document;
        const caption = ctx.message.caption || '';
        await processAIRequest(ctx, `[Файл: ${doc.file_name}] ${caption}`, uid);
    });

    // --- TEXT MESSAGES ---
    bot.on('message:text', async (ctx: Context) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const text = ctx.message?.text || '';
        if (text.startsWith('/')) return;
        await processAIRequest(ctx, text, uid);
    });
};

// ============================================================
//  CORE AI PROCESSING WITH REAL STREAMING
// ============================================================

async function processAIRequest(ctx: Context, text: string, uid: number) {
    Logger.info('telegram', `Request from UID ${uid}: ${text.slice(0, 80)}`);

    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    // Check daily limit
    const user = db.prepare('SELECT subscription_plan, msg_count_today, lang FROM users WHERE uid = ?').get(uid) as any;
    const plan = user?.subscription_plan || 'free';
    const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
    const count = user?.msg_count_today || 0;

    if (count >= limit) {
        await ctx.reply(
            `⚠️ *Лимит сообщений исчерпан* (${limit}/день)\nОбнови план: /tariffs`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    db.prepare('UPDATE users SET msg_count_today = msg_count_today + 1 WHERE uid = ?').run(uid);
    await ctx.replyWithChatAction('typing').catch(() => {});

    try {
        // Send placeholder message that we'll update with streaming content
        const placeholder = await ctx.reply('🤔                       ', { parse_mode: 'Markdown' });

        let fullResponse = '';
        let lastEdit = Date.now();
        let editTimer: ReturnType<typeof setInterval> | null = null;
        let streamDone = false;

        // Continuous typing action while streaming
        const typingInterval = setInterval(() => {
            if (!streamDone) ctx.replyWithChatAction('typing').catch(() => {});
        }, 4000);

        // Periodic message update during stream
        editTimer = setInterval(async () => {
            if (fullResponse.length > 0 && Date.now() - lastEdit > STREAM_EDIT_INTERVAL_MS) {
                lastEdit = Date.now();
                const preview = truncate(fullResponse) + ' █';
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    placeholder.message_id,
                    preview,
                    { parse_mode: 'Markdown' }
                ).catch(() => {});
            }
        }, 800);

        // Load session history
        const history = getSessionHistory(uid);

        await executeAI(text, uid, history, async (chunk: string) => {
            fullResponse += chunk;
        });

        streamDone = true;
        clearInterval(typingInterval);
        if (editTimer) clearInterval(editTimer);

        // Save to session
        appendToSession(uid, 'user', text);
        appendToSession(uid, 'assistant', fullResponse);

        if (fullResponse) {
            const chunks = splitMessage(fullResponse);

            // Final edit of placeholder with first chunk
            await ctx.api.editMessageText(
                ctx.chat!.id,
                placeholder.message_id,
                chunks[0],
                { parse_mode: 'Markdown' }
            ).catch(async () => {
                // If markdown parse fails, send as plain text
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    placeholder.message_id,
                    stripMarkdown(chunks[0])
                ).catch(() => {});
            });

            // Send overflow chunks
            for (let i = 1; i < chunks.length; i++) {
                await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() =>
                    ctx.reply(stripMarkdown(chunks[i]))
                );
            }
        } else {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                placeholder.message_id,
                '❌ Нет ответа. Попробуй ещё раз.'
            ).catch(() => {});
        }
    } catch (err) {
        Logger.error('telegram', `AI request failed for UID ${uid}`, err);
        await ctx.reply('❌ Что-то пошло не так. Попробуй ещё раз.');
    }
}

// ============================================================
//  APPROVAL BUTTONS
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
        `🔐 *Запрос на действие*\n\nДействие: \`${action}\`\nАргументы: \`${JSON.stringify(args).slice(0, 200)}\`\n\nРазрешить?`,
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

function stripMarkdown(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/```[\s\S]*?```/g, '[code]');
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
        // Try to split on newline for cleaner chunks
        let cutAt = max;
        const lastNewline = remaining.lastIndexOf('\n', max);
        if (lastNewline > max * 0.7) cutAt = lastNewline;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt);
    }
    return chunks;
}
