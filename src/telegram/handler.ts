/**
 * NEXUM Telegram Handler
 *
 * Real token-by-token streaming like Claude / ChatGPT / Perplexity / OpenClaw:
 *  1. "…" sent immediately → user sees instant response
 *  2. SSE tokens stream in → each token appended to accumulated text
 *  3. Message edited every ~800ms with growing text
 *  4. Final complete text sent synchronously
 */

import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';
import { buildPrompt } from '../agent/executor';
import { chat, chatStreaming, fixTelegramFormatting } from '../agent/router';
import { getHistory, saveMessage, autoExtract } from '../agent/memory';
import { config, hasAccess } from '../core/config';
import { ensureUser } from '../core/db';
import { canSendMessage, hasFeature } from '../core/billing';
import { transcribeVoice } from '../tools/stt';
import { textToSpeech, getUserVoicePref } from '../tools/tts';
import { createDraftStream } from './draft-stream';
import { truncateTelegram } from '../agent/persona';
import { t } from '../i18n/index';
import type { Message } from '../agent/router';
import { createLogger } from '../infra/logger';

const log = createLogger('handler');

function isGroup(ctx: Context): boolean {
  const tp = ctx.chat?.type;
  return tp === 'group' || tp === 'supergroup';
}

async function botMentioned(ctx: Context, bot: Bot): Promise<boolean> {
  const info = await bot.api.getMe();
  const text = ctx.message?.text ?? ctx.message?.caption ?? '';
  return (
    text.toLowerCase().includes(`@${info.username?.toLowerCase()}`) ||
    ctx.message?.reply_to_message?.from?.id === info.id
  );
}

export async function safeReply(ctx: Context, text: string): Promise<void> {
  if (!text?.trim()) return;
  const txt = truncateTelegram(text);
  try { await ctx.reply(txt, { parse_mode: 'Markdown' }); }
  catch { await ctx.reply(txt).catch(() => {}); }
}

export { safeReply as streamReply };

// ── Streaming reply ───────────────────────────────────────────────────────────

export async function streamingReply(
  ctx: Context,
  uid: number,
  userMessage: string,
  group = false
): Promise<void> {
  const chatId = ctx.chat!.id;

  const limit = canSendMessage(uid);
  if (!limit.ok) { await ctx.reply(limit.reason!); return; }

  // Start draft — sends "…" placeholder immediately in background
  const draft = createDraftStream({ api: ctx.api, chatId });

  // Typing indicator
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {});
  }, 4500);
  ctx.replyWithChatAction('typing').catch(() => {});

  let fullReply = '';

  try {
    const system  = buildPrompt(uid, group);
    const history = getHistory(uid, 20);
    const msgs: Message[] = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userMessage },
    ];

    // Real SSE streaming: each token → draft.update(accumulated text)
    // The draft throttles edits to Telegram to avoid rate limits
    fullReply = await chatStreaming(uid, msgs, system, (accumulated) => {
      draft.update(fixTelegramFormatting(accumulated));
    });

    clearInterval(typingInterval);

    // Send complete final text — this always runs even if throttle skipped some edits
    fullReply = fixTelegramFormatting(fullReply);
    await draft.stop();

    // Fallback: if "…" placeholder itself failed to send
    if (draft.messageId() === null) {
      await safeReply(ctx, fullReply);
    }

    saveMessage(uid, 'user', userMessage);
    saveMessage(uid, 'assistant', fullReply);

    if (hasFeature(uid, 'hasMemory')) autoExtract(uid, userMessage);

    // Optional TTS
    const vp = getUserVoicePref(uid);
    if (vp.voice !== 'off') {
      try {
        const audio = await textToSpeech(fullReply, uid);
        await ctx.replyWithAudio(new InputFile(audio, 'response.mp3'));
      } catch { /* optional */ }
    }

  } catch (err) {
    clearInterval(typingInterval);

    const msg = err instanceof Error ? err.message : String(err);
    log.error(`streamingReply uid=${uid}: ${msg}`);

    const errText = `⚠️ ${msg.includes('All AI providers')
      ? t(uid, 'error.ai_unavailable')
      : t(uid, 'error.generic')}`;

    // Try to edit existing placeholder with error, or send new message
    try {
      await draft.stop().catch(() => {});
      if (draft.messageId()) {
        await ctx.api.editMessageText(chatId, draft.messageId()!, errText).catch(async () => {
          await ctx.reply(errText).catch(() => {});
        });
      } else {
        await ctx.reply(errText).catch(() => {});
      }
    } catch { /* silent */ }
  }
}

// ── Message type handlers ─────────────────────────────────────────────────────

export async function handleTextMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid  = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  if (!uid || !text) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  if (!hasAccess(uid)) return;
  if (isGroup(ctx) && !await botMentioned(ctx, bot)) return;

  await streamingReply(ctx, uid, text, isGroup(ctx));
}

export async function handleVoiceMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  if (!hasAccess(uid)) return;
  if (isGroup(ctx) && !await botMentioned(ctx, bot)) return;

  try {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const file   = await ctx.api.getFile(ctx.message!.voice!.file_id);
    const url    = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
    const transcript = await transcribeVoice(buffer);
    if (!transcript) { await ctx.reply(t(uid, 'error.voice_failed')); return; }
    await streamingReply(ctx, uid, transcript, isGroup(ctx));
  } catch (e) {
    await ctx.reply(t(uid, 'error.generic')).catch(() => {});
    log.error(`voice uid=${uid}: ${(e as Error).message}`);
  }
}

export async function handlePhotoMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  const photos = ctx.message?.photo;
  if (!uid || !photos?.length) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  if (!hasAccess(uid)) return;
  if (isGroup(ctx) && !await botMentioned(ctx, bot)) return;

  const limit = canSendMessage(uid);
  if (!limit.ok) { await ctx.reply(limit.reason!); return; }

  try {
    await ctx.replyWithChatAction('upload_photo').catch(() => {});
    const photo = photos[photos.length - 1];
    const file  = await ctx.api.getFile(photo.file_id);
    const url   = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const buf   = Buffer.from(await (await fetch(url)).arrayBuffer());
    const b64   = buf.toString('base64');
    const caption = ctx.message?.caption ?? (t(uid, 'photo.default_caption'));

    const system   = buildPrompt(uid, isGroup(ctx));
    const response = await chat(uid, [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: 'text', text: caption },
      ]},
    ], system, true);

    saveMessage(uid, 'user', `[Photo] ${caption}`);
    saveMessage(uid, 'assistant', response);
    await safeReply(ctx, response);
  } catch (e) {
    await ctx.reply(t(uid, 'error.generic')).catch(() => {});
    log.error(`photo uid=${uid}: ${(e as Error).message}`);
  }
}

export async function handleDocumentMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  const doc = ctx.message?.document;
  if (!uid || !doc) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  if (!hasAccess(uid)) return;
  if (isGroup(ctx) && !await botMentioned(ctx, bot)) return;

  const limit = canSendMessage(uid);
  if (!limit.ok) { await ctx.reply(limit.reason!); return; }

  if (!doc.file_name?.match(/\.(txt|md|csv|json|js|ts|py|html|css|xml|yaml|yml|sh|log)$/i)) {
    await ctx.reply('📎 Supported: txt, md, csv, json, js, ts, py, html, css, xml, yaml, sh, log');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing').catch(() => {});
    const file = await ctx.api.getFile(doc.file_id);
    const url  = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const text = await (await fetch(url)).text();
    const caption = ctx.message?.caption ?? 'Analyze this file:';
    const prompt  = `${caption}\n\nFile: \`${doc.file_name}\`\n\`\`\`\n${text.slice(0, 8000)}\n\`\`\``;
    await streamingReply(ctx, uid, prompt, isGroup(ctx));
  } catch (e) {
    await ctx.reply(t(uid, 'error.generic')).catch(() => {});
    log.error(`doc uid=${uid}: ${(e as Error).message}`);
  }
}
