"use strict";
// NEXUM Status Reaction Controller — adapted from OpenClaw architecture
// Manages lifecycle of status reactions (queued → thinking → done/error)
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReactionController = createReactionController;
exports.shouldReact = shouldReact;
const format_1 = require("./format");
function createReactionController(params) {
    const { bot, chatId, messageId } = params;
    const enabled = params.enabled !== false;
    let currentEmoji = null;
    async function setReaction(emoji) {
        if (!enabled)
            return;
        if (!(0, format_1.isSupportedReaction)(emoji))
            return;
        if (currentEmoji === emoji)
            return;
        try {
            await bot.api.raw.setMessageReaction({
                chat_id: chatId,
                message_id: messageId,
                reaction: [{ type: 'emoji', emoji }],
                is_big: false,
            });
            currentEmoji = emoji;
        }
        catch {
            // Silently ignore — reactions may be disabled in group
        }
    }
    async function removeReaction() {
        if (!enabled || !currentEmoji)
            return;
        try {
            await bot.api.raw.setMessageReaction({
                chat_id: chatId,
                message_id: messageId,
                reaction: [],
            });
            currentEmoji = null;
        }
        catch {
            // Silently ignore
        }
    }
    return {
        async setStatus(status) {
            const emoji = (0, format_1.pickStatusReaction)(status);
            await setReaction(emoji);
        },
        async remove() {
            await removeReaction();
        },
        async setContextual(text) {
            const emoji = (0, format_1.pickContextReaction)(text);
            await setReaction(emoji);
        },
    };
}
// ── Reaction rate limiter (human-like: ~40% of messages) ─────────────────────
function shouldReact(probability = 0.40) {
    return Math.random() < probability;
}
