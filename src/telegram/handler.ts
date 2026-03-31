import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
import { CONFIG, isAdmin } from '../core/config';
import db from '../core/db';
import { getSessionHistory, appendToSession } from '../state/session';
import { approvePatch, rejectPatch } from '../evolution/self_improve';
import { analyzeAndPropose, listPending } from '../evolution/improve_tool';
import fetch from 'node-fetch';

// Минимум символов до первого сообщения при стриминге
const STREAM_FIRST_SEND_CHARS = 30;
// Интервал редактирования в стриминге (мс)
const STREAM_EDIT_INTERVAL_MS = 900;

// Запросы "в полёте": защита от параллельной обработки одного и того же сообщения
const activeRequests = new Set<string>();
// Уже обработанные сообщения (idempotency)
const processedMessages = new Map<string, number>(); // key -> timestamp
const PROCESSED_TTL_MS = 5 * 60 * 1000;

// Периодическая очистка processedMessages
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of processedMessages.entries()) {
        if (now - ts > PROCESSED_TTL_MS) processedMessages.delete(key);
    }
}, 60 * 1000);

function makeMsgKey(ctx: Context): string | null {
    const chatId = ctx.chat?.id;
    // @ts-ignore
    const msgId = ctx.message?.message_id;
    if (!chatId || !msgId) return null;
    return `${chatId}:${msgId}`;
}

export const setupBot = (bot: Bot) => {
    setupCommands(bot);

    // /start — приветствие + inline‑кнопки
    bot.command('start', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('💬 Задать вопрос', 'start_newchat')
            .row()
            .url('🌐 Открыть NEXUM Web', CONFIG.WEB_APP_URL || 'https://thenexum.ai')
            .row()
            .text('⚙️ Тарифы', 'start_tariffs');

        await ctx.reply(
            '👋 Привет! Я NEXUM — твой личный интеллектуальный помощник.\n\n' +
            'Задавай любые вопросы, присылай голосовые, фото, документы — разберёмся.',
            { reply_markup: keyboard }
        );
    });

    // Обработка callback‑кнопок только для /start
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const uid = ctx.from?.id;

        if (data === 'start_newchat') {
            await ctx.answerCallbackQuery('✍️ Напиши свой первый запрос');
            await ctx.reply('Можешь просто написать, с чего начнём 😊');
            return;
        }
        if (data === 'start_tariffs') {
            await ctx.answerCallbackQuery('📊 Тарифы');
            await ctx.reply('Тарифы и возможности: /tariffs');
            return;
        }

        // Остальное — как было (approvals / self-improve)
        if (data.startsWith('appr_')) {
            const [actionId, status] = data.replace('appr_', '').split(':');
            const approved = status === 'allow';
            handleApprovalResult(actionId, approved);
            await ctx.answerCallbackQuery(approved ? '✅ Разрешено' : '❌ Отклонено');
            await ctx
                .editMessageText(approved ? '✅ Действие выполнено.' : '❌ Действие отклонено.', {
                    reply_markup: undefined,
                })
                .catch(() => { });
            return;
        }

        if (data.startsWith('selfimprove_approve_')) {
            if (!uid || !isAdmin(uid)) {
                await ctx.answerCallbackQuery('❌ Нет прав');
                return;
            }
            const patchId = data.replace('selfimprove_approve_', '');
            await ctx.answerCallbackQuery('⏳ Пушу...');
            const result = await approvePatch(patchId, bot);
            await ctx
                .editMessageText(result, { reply_markup: undefined })
                .catch(async () => {
                    await ctx.reply(result);
                });
            return;
        }

        if (data.startsWith('selfimprove_reject_')) {
            if (!uid || !isAdmin(uid)) {
                await ctx.answerCallbackQuery('❌ Нет прав');
                return;
            }
            const patchId = data.replace('selfimprove_reject_', '');
            const result = rejectPatch(patchId);
            await ctx.answerCallbackQuery('🗑 Отклонено');
            await ctx
                .editMessageText(result, { reply_markup: undefined })
                .catch(async () => {
                    await ctx.reply(result);
                });
            return;
        }

        await ctx.answerCallbackQuery();
    });

    // --- admin-команды улучшений (как было) ---
    bot.command('improve', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isAdmin(uid)) {
            await ctx.reply('❌ Только для администраторов.');
            return;
        }
        const args = ctx.message?.text?.replace('/improve', '').trim() || '';
        if (!args) {
            await ctx.reply(
                '📝 *Использование:*\n`/improve <путь_к_файлу> <описание изменения>`\n\n' +
                '*Примеры:*\n' +
                '`/improve src/agent/tools.ts добавь инструмент`\n' +
                '`/improve src/soul/index.ts сделай ответы дружелюбнее`',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        const spaceIdx = args.indexOf(' ');
        if (spaceIdx === -1) {
            await ctx.reply('❌ Укажи описание изменения после пути к файлу.');
            return;
        }
        const filePath = args.slice(0, spaceIdx).trim();
        const description = args.slice(spaceIdx + 1).trim();
        const thinking = await ctx.reply(`🤔 Анализирую \`${filePath}\`...`, { parse_mode: 'Markdown' });
        const result = await analyzeAndPropose(filePath, description, uid, bot);
        await ctx.api
            .editMessageText(ctx.chat!.id, thinking.message_id, result, { parse_mode: 'Markdown' })
            .catch(async () => {
                await ctx.reply(result);
            });
    });

    bot.command('patches', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isAdmin(uid)) {
            await ctx.reply('❌ Только для администраторов.');
            return;
        }
        const list = await listPending();
        await ctx
            .reply(`📋 *Ожидающие патчи:*\n\n${list}`, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(list));
    });

    // --- Voice ---
    bot.on('message:voice', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const key = makeMsgKey(ctx);
        if (!acquireKey(key)) return;

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
        } finally {
            releaseKey(key);
        }
    });

    // --- Photo ---
    bot.on('message:photo', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const key = makeMsgKey(ctx);
        if (!acquireKey(key)) return;

        try {
            const caption = ctx.message.caption || 'Что на этом изображении? Опиши подробно.';
            const file = await ctx.getFile();
            const imageUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
            await processAIRequest(ctx, `[vision:${imageUrl}] ${caption}`, uid);
        } catch (err) {
            Logger.error('telegram', 'Photo error', err);
            await ctx.reply('❌ Ошибка при анализе фото.');
        } finally {
            releaseKey(key);
        }
    });

    // --- Document ---
    bot.on('message:document', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const key = makeMsgKey(ctx);
        if (!acquireKey(key)) return;

        try {
            const doc = ctx.message.document;
            const caption = ctx.message.caption || '';
            await processAIRequest(ctx, `[Файл: ${doc.file_name}] ${caption}`, uid);
        } finally {
            releaseKey(key);
        }
    });

    // --- Text ---
    bot.on('message:text', async (ctx: Context) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const text = ctx.message?.text || '';
        if (text.startsWith('/')) return; // команды уже обрабатываются отдельно

        const key = makeMsgKey(ctx);
        if (!acquireKey(key)) return;

        try {
            await processAIRequest(ctx, text, uid);
        } finally {
            releaseKey(key);
        }
    });
};

// ============================================================
//  CORE: streaming AI response — один ответ без дублей
// ============================================================
async function processAIRequest(ctx: Context, text: string, uid: number) {
    Logger.info('telegram', `Request from UID ${uid}: ${text.slice(0, 80)}`);

    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    const user = db
        .prepare('SELECT subscription_plan, msg_count_today FROM users WHERE uid = ?')
        .get(uid) as any;
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
    await ctx.replyWithChatAction('typing').catch(() => { });

    let fullText = '';
    let sentMsgId: number | null = null;
    let lastEditedText = '';
    let streamDone = false;
    let editInProgress = false;

    const typingTimer = setInterval(() => {
        if (!streamDone) ctx.replyWithChatAction('typing').catch(() => { });
    }, 4500);

    const editTimer = setInterval(async () => {
        if (sentMsgId === null) return;
        if (streamDone) return;
        if (editInProgress) return;
        if (fullText === lastEditedText) return;

        editInProgress = true;
        lastEditedText = fullText;
        await safeEdit(ctx, sentMsgId, fullText + ' ▍');
        editInProgress = false;
    }, STREAM_EDIT_INTERVAL_MS);

    try {
        const history = getSessionHistory(uid);

        await executeAI(text, uid, history, async (chunk: string) => {
            fullText += chunk;

            if (sentMsgId === null && fullText.trim().length >= STREAM_FIRST_SEND_CHARS) {
                try {
                    const msg = await ctx.reply(truncate(fullText) + ' ▍', {
                        parse_mode: 'Markdown',
                    });
                    sentMsgId = msg.message_id;
                    lastEditedText = fullText;
                } catch {
                    const msg = await ctx.reply(stripMarkdown(truncate(fullText)) + ' ▍');
                    sentMsgId = msg.message_id;
                    lastEditedText = fullText;
                }
            }
        });

        streamDone = true;
        clearInterval(typingTimer);
        clearInterval(editTimer);

        appendToSession(uid, 'user', text);
        if (fullText) appendToSession(uid, 'assistant', fullText);

        if (!fullText) {
            await ctx.reply('❌ Нет ответа. Попробуй ещё раз.');
            return;
        }

        const chunks = splitMessage(fullText);

        if (sentMsgId !== null) {
            // один финальный edit первого сообщения
            await safeEdit(ctx, sentMsgId, chunks[0]);
            // если вдруг ответ длиннее лимита — остаток отдельными сообщениями
            for (let i = 1; i < chunks.length; i++) {
                await ctx
                    .reply(chunks[i], { parse_mode: 'Markdown' })
                    .catch(() => ctx.reply(stripMarkdown(chunks[i])));
            }
        } else {
            // короткий ответ — без стриминга, просто одно/несколько сообщений, но НЕ дублируем
            for (const chunk of chunks) {
                await ctx
                    .reply(chunk, { parse_mode: 'Markdown' })
                    .catch(() => ctx.reply(stripMarkdown(chunk)));
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
//  APPROVAL BUTTONS (как было)
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
        `🔐 *Запрос на действие*\n\nДействие: \`${action}\`\nАргументы: \`${JSON.stringify(args).slice(
            0,
            200
        )}\`\n\nРазрешить?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
};

// ============================================================
//  HELPERS
// ============================================================
function ensureUser(uid: number, username?: string, firstName?: string) {
    const exists = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid);
    if (!exists) {
        db.prepare(
            'INSERT OR IGNORE INTO users (uid, username, first_name, msg_count_today) VALUES (?, ?, ?, 0)'
        ).run(uid, username || '', firstName || '');
    }
}

async function safeEdit(ctx: Context, msgId: number, text: string): Promise<void> {
    const preview = truncate(text);
    await ctx.api
        .editMessageText(ctx.chat!.id, msgId, preview, { parse_mode: 'Markdown' })
        .catch(async () => {
            await ctx.api
                .editMessageText(ctx.chat!.id, msgId, stripMarkdown(preview))
                .catch(() => { });
        });
}

function safeMarkdown(text: string): string {
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
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

// защита от дублей
function acquireKey(key: string | null): boolean {
    if (!key) return true;
    if (processedMessages.has(key)) return false;
    if (activeRequests.has(key)) return false;
    activeRequests.add(key);
    return true;
}

function releaseKey(key: string | null) {
    if (!key) return;
    activeRequests.delete(key);
    processedMessages.set(key, Date.now());
}
