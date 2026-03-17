"use strict";
// NEXUM Draft Stream — adapted from OpenClaw lane-delivery architecture
// Streams AI responses progressively to Telegram (edit-on-update)
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDraftStream = createDraftStream;
exports.safeSendHtml = safeSendHtml;
exports.safeEditHtml = safeEditHtml;
const format_1 = require("./format");
const EDIT_INTERVAL_MS = 1200; // How often to edit (avoid rate limits)
const MIN_CHARS_BEFORE_EDIT = 20; // Don't edit until we have meaningful content
const TYPING_INDICATOR_INTERVAL = 4000;
async function createDraftStream(params) {
    const { bot, chatId, replyToMsgId, initialText = '⏳' } = params;
    // Send initial status message
    const statusMsg = await bot.api.sendMessage(chatId, initialText, {
        reply_parameters: replyToMsgId ? { message_id: replyToMsgId } : undefined,
    });
    let accumulated = '';
    let lastEdited = '';
    let editTimer = null;
    let typingTimer = null;
    let destroyed = false;
    // Keep typing indicator alive
    async function sendTyping() {
        if (destroyed)
            return;
        try {
            await bot.api.sendChatAction(chatId, 'typing');
        }
        catch { }
        if (!destroyed) {
            typingTimer = setTimeout(sendTyping, TYPING_INDICATOR_INTERVAL);
        }
    }
    sendTyping();
    async function doEdit(text) {
        if (destroyed || text === lastEdited || text.length < MIN_CHARS_BEFORE_EDIT)
            return;
        try {
            const html = (0, format_1.markdownToTelegramHtml)(text + ' ▋'); // cursor indicator
            await bot.api.editMessageText(chatId, statusMsg.message_id, html, { parse_mode: 'HTML' });
            lastEdited = text;
        }
        catch (e) {
            if (e?.description?.includes('not modified'))
                return;
            // Parse error — try plain text
            try {
                await bot.api.editMessageText(chatId, statusMsg.message_id, text + ' ▋');
                lastEdited = text;
            }
            catch { }
        }
    }
    function scheduleEdit() {
        if (editTimer)
            return;
        editTimer = setTimeout(async () => {
            editTimer = null;
            await doEdit(accumulated);
        }, EDIT_INTERVAL_MS);
    }
    const stream = {
        append(text) {
            accumulated += text;
            scheduleEdit();
        },
        async finalize(finalText) {
            destroyed = true;
            if (editTimer) {
                clearTimeout(editTimer);
                editTimer = null;
            }
            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
            }
            const chunks = (0, format_1.chunkText)(finalText);
            // Edit first message with final text
            try {
                const html = (0, format_1.markdownToTelegramHtml)(chunks[0]);
                await bot.api.editMessageText(chatId, statusMsg.message_id, html, { parse_mode: 'HTML' });
            }
            catch {
                try {
                    await bot.api.editMessageText(chatId, statusMsg.message_id, chunks[0]);
                }
                catch { }
            }
            // Send remaining chunks as new messages
            for (let i = 1; i < chunks.length; i++) {
                try {
                    const html = (0, format_1.markdownToTelegramHtml)(chunks[i]);
                    await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
                }
                catch {
                    await bot.api.sendMessage(chatId, chunks[i]);
                }
            }
        },
        destroy() {
            destroyed = true;
            if (editTimer) {
                clearTimeout(editTimer);
                editTimer = null;
            }
            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
            }
        },
    };
    return { stream, statusMsgId: statusMsg.message_id };
}
// ── Safe send with HTML fallback ──────────────────────────────────────────────
async function safeSendHtml(bot, chatId, text, extra) {
    const html = (0, format_1.markdownToTelegramHtml)(text);
    try {
        return await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML', ...extra });
    }
    catch (e) {
        if (e?.description?.includes('parse') || e?.description?.includes('entity')) {
            // Strip formatting, send plain
            return await bot.api.sendMessage(chatId, text.replace(/[*_`[\]]/g, ''), extra);
        }
        throw e;
    }
}
async function safeEditHtml(bot, chatId, msgId, text, extra) {
    const html = (0, format_1.markdownToTelegramHtml)(text);
    try {
        return await bot.api.editMessageText(chatId, msgId, html, { parse_mode: 'HTML', ...extra });
    }
    catch (e) {
        if (e?.description?.includes('not modified'))
            return;
        if (e?.description?.includes('parse') || e?.description?.includes('entity')) {
            try {
                return await bot.api.editMessageText(chatId, msgId, text.replace(/[*_`[\]]/g, ''), extra);
            }
            catch { }
        }
    }
}
