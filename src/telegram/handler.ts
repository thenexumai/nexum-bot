import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
import { CONFIG } from '../core/config';
import db from '../core/db';
import { getSessionHistory, appendToSession } from '../state/session';
import fetch from 'node-fetch';

// How often to push edits to Telegram during streaming (ms)
// Too fast = flood; too slow = feels laggy. 900ms is sweet-spot.
const STREAM_EDIT_MS = 900;
// Minimum chars before we send the first visible message
const STREAM_FIRST_SEND_CHARS = 40;

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

    // --- VOICE ---
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

    // --- TEXT ---
    bot.on('message:text', async (ctx: Context) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const text = ctx.message?.text || '';
        if (text.startsWith('/')) return;
        await processAIRequest(ctx, text, uid);
    });
};

// ============================================================
//  CORE: streaming AI response with smooth Telegram edits
// ============================================================
async function processAIRequest(ctx: Context, text: string, uid: number) {
    Logger.info('telegram', `Request from UID ${uid}: ${text.slice(0, 80)}`);

    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    // Daily limit check
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

    // State for streaming
    let fullText = '';
    let sentMsgId = 0;        // Telegram message_id once first msg is sent
    let lastEditTime = 0;     // Timestamp of last editMessageText call
    let streamDone = false;

    // Keep typing action alive
    const typingTimer = setInterval(() => {
        if (!streamDone) ctx.replyWithChatAction('typing').catch(() => {});
    }, 4500);

    // Periodic edit timer — pushes accumulated text to Telegram
    const editTimer = setInterval(async () => {
        if (!sentMsgId) return;
        if (!fullText) return;
        if (Date.now() - lastEditTime < STREAM_EDIT_MS) return;
        lastEditTime = Date.now();
        await pushEdit(ctx, sentMsgId, fullText);
    }, 600);

    try {
        const history = getSessionHistory(uid);

        // executeAI calls our callback for EVERY token chunk
        await executeAI(text, uid, history, async (chunk: string) => {
            fullText += chunk;

            // Send first message once we have enough text to show
            if (!sentMsgId && fullText.trim().length >= STREAM_FIRST_SEND_CHARS) {
                lastEditTime = Date.now();
                const preview = truncate(fullText);
                try {
                    const msg = await ctx.reply(preview, { parse_mode: 'Markdown' });
                    sentMsgId = msg.message_id;
                } catch {
                    const msg = await ctx.reply(stripMarkdown(preview));
                    sentMsgId = msg.message_id;
                }
            }
        });

        streamDone = true;
        clearInterval(typingTimer);
        clearInterval(editTimer);

        // Save to session memory
        appendToSession(uid, 'user', text);
        if (fullText) appendToSession(uid, 'assistant', fullText);

        if (!fullText) {
            await ctx.reply('❌ Нет ответа. Попробуй ещё раз.');
            return;
        }

        const chunks = splitMessage(fullText);

        if (sentMsgId) {
            // Final edit of first chunk
            await pushEdit(ctx, sentMsgId, chunks[0]);
            // Send overflow as new messages
            for (let i = 1; i < chunks.length; i++) {
                await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => ctx.reply(stripMarkdown(chunks[i])));
            }
        } else {
            // Response was short, no streaming message was sent yet
            for (const chunk of chunks) {
                await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(stripMarkdown(chunk)));
            }
        }
    } catch (err) {
        streamDone = true;
        clearInterval(typingTimer);
        clearInterval(editTimer);
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

async function pushEdit(ctx: Context, msgId: number, text: string): Promise<void> {
    const preview = truncate(text);
    await ctx.api
        .editMessageText(ctx.chat!.id, msgId, preview, { parse_mode: 'Markdown' })
        .catch(async () => {
            await ctx.api
                .editMessageText(ctx.chat!.id, msgId, stripMarkdown(preview))
                .catch(() => {});
        });
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
        let cutAt = max;
        const lastNewline = remaining.lastIndexOf('\n', max);
        if (lastNewline > max * 0.6) cutAt = lastNewline;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt);
    }
    return chunks;
}
