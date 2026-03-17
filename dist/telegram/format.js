"use strict";
// Telegram message formatter — architecture from OpenClaw
// Converts Markdown to proper Telegram HTML with safe chunking
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.markdownToTelegramHtml = markdownToTelegramHtml;
exports.splitTelegramMessage = splitTelegramMessage;
exports.stripMarkdownForPlainText = stripMarkdownForPlainText;
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeHtmlAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}
function markdownToTelegramHtml(markdown) {
    let text = (markdown ?? '').toString();
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    text = text.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);
    text = text.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
    text = text.replace(/\*([^*\n]+?)\*/g, '<b>$1</b>');
    text = text.replace(/__(.+?)__/gs, '<i>$1</i>');
    text = text.replace(/_([^_\n]+?)_/g, '<i>$1</i>');
    text = text.replace(/~~(.+?)~~/gs, '<s>$1</s>');
    text = text.replace(/\|\|(.+?)\|\|/gs, '<tg-spoiler>$1</tg-spoiler>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => `<a href="${escapeHtmlAttr(href.trim())}">${label}</a>`);
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    text = text.replace(/^---+$/gm, '─────────────────');
    return text;
}
function splitTelegramMessage(text, limit = 4000) {
    if (text.length <= limit)
        return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > limit) {
        let splitAt = remaining.lastIndexOf('\n\n', limit);
        if (splitAt < Math.floor(limit * 0.5))
            splitAt = remaining.lastIndexOf('\n', limit);
        if (splitAt < Math.floor(limit * 0.3))
            splitAt = remaining.lastIndexOf('. ', limit);
        if (splitAt < 1)
            splitAt = limit;
        chunks.push(remaining.slice(0, splitAt).trimEnd());
        remaining = remaining.slice(splitAt).trim();
    }
    if (remaining)
        chunks.push(remaining);
    return chunks;
}
function stripMarkdownForPlainText(text) {
    return text
        .replace(/```[\s\S]*?```/g, '[код]')
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/\|\|(.+?)\|\|/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^> /gm, '')
        .trim();
}
