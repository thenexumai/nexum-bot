// NEXUM Message Handler — text, voice, photo, documents

import { Bot, Context } from 'grammy';
import { execute, buildSystemPrompt } from '../agent/executor';
import { chatStreaming } from '../agent/router';
import { getHistory, saveMessage, autoExtract } from '../agent/memory';
import { config } from '../core/config';
import { ensureUser } from '../core/db';
import { canSendMessage, hasFeature } from '../core/billing';
import { transcribeVoice } from '../tools/stt';
import { textToSpeech, getUserVoicePref } from '../tools/tts';
import { createDraftStream } from './draft-stream';

// ── Access gate ───────────────────────────────────────────────────────────────

export function hasAccess(uid: number): boolean {
  if (config.publicBot) return true;
  return config.adminIds.includes(uid);
}

function isGroup(ctx: Context): boolean {
  const t = ctx.chat?.type;
  return t === 'group' || t === 'supergroup';
}

async function isMentioned(ctx: Context, bot: Bot): Promise<boolean> {
  const info = await bot.api.getMe();
  const text = ctx.message?.text || ctx.message?.caption || '';
  const isReply = ctx.message?.reply_to_message?.from?.id === info.id;
  return text.toLowerCase().includes(`@${info.username?.toLowerCase()}`) || isReply;
}

// ── Reply helpers ─────────────────────────────────────────────────────────────

export async function streamReply(ctx: Context, text: string): Promise<void> {
  if (!text?.trim()) return;
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply(text).catch(() => {});
  }
}

export async function streamingReply(
  ctx: Context,
  uid: number,
  userMessage: string,
  group = false
): Promise<void> {
  const chatId = ctx.chat!.id;

  // Rate limit check
  const limit = canSendMessage(uid);
  if (!limit.ok) {
    await ctx.reply(limit.reason!);
    return;
  }

  await ctx.replyWithChatAction('typing').catch(() => {});

  const draft = createDraftStream({
    api: ctx.api,
    chatId,
    warn: (m) => console.warn('[draft]', m),
  });

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {});
  }, 4500);

  try {
    const system = buildSystemPrompt(uid, group);
    const history = getHistory(uid, 20);
    const messages: any[] = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    const fullResponse = await chatStreaming(uid, messages, system, (accumulated) => {
      draft.update(accumulated);
    });

    clearInterval(typingInterval);
    await draft.stop();

    if (draft.messageId() == null) {
      await streamReply(ctx, fullResponse);
    }

    saveMessage(uid, 'user', userMessage);
    saveMessage(uid, 'assistant', fullResponse);

    if (hasFeature(uid, 'hasMemory')) {
      autoExtract(uid, userMessage);
    }
  } catch (err: any) {
    clearInterval(typingInterval);
    await draft.stop();
    if (draft.messageId() == null) {
      await ctx.reply('Something went wrong. Please try again.').catch(() => {});
    }
    console.error('[handler]', err.message);
  }
}

// ── Text handler ──────────────────────────────────────────────────────────────

export async function handleTextMessage(ctx: Context, bot: Bot): Promise<void> {
  const msg = ctx.message?.text;
  const uid = ctx.from?.id;
  if (!msg || !uid) return;
  if (msg.startsWith('/')) return;
  if (!hasAccess(uid)) return;

  if (isGroup(ctx)) {
    if (!(await isMentioned(ctx, bot))) return;
  }

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  await streamingReply(ctx, uid, msg, isGroup(ctx));
}

// ── Voice handler ─────────────────────────────────────────────────────────────

export async function handleVoiceMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid || !hasAccess(uid)) return;
  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  await ctx.replyWithChatAction('typing');

  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const transcript = await transcribeVoice(buf);

    if (!transcript) {
      await ctx.reply('Could not transcribe audio.');
      return;
    }

    await ctx.reply(`_${transcript}_`, { parse_mode: 'Markdown' });

    const limit = canSendMessage(uid);
    if (!limit.ok) { await ctx.reply(limit.reason!); return; }

    const response = await execute(uid, transcript, { bot, isGroup: isGroup(ctx), skipLimitCheck: true });

    const pref = getUserVoicePref(uid);
    if (pref.lang !== 'off') {
      try {
        await ctx.replyWithChatAction('record_voice');
        const audio = await textToSpeech(response, uid);
        await (ctx.api as any).sendVoice(ctx.chat!.id, new Blob([audio], { type: 'audio/mpeg' }));
        return;
      } catch {}
    }

    await streamReply(ctx, response);
  } catch (e: any) {
    const msg = e.message?.includes('STT')
      ? 'Voice requires a Groq key: /setkey groq YOUR_KEY'
      : 'Voice processing failed. Please try again.';
    await ctx.reply(msg);
  }
}

// ── Photo handler ─────────────────────────────────────────────────────────────

export async function handlePhotoMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid || !hasAccess(uid)) return;
  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  await ctx.replyWithChatAction('typing');

  try {
    const photo = ctx.message?.photo?.at(-1);
    if (!photo) return;

    const caption = ctx.message?.caption || 'What is in this image?';
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const base64 = Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64');

    const messages: any[] = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: caption },
      ],
    }];

    const { chat } = await import('../agent/router');
    const response = await chat(uid, messages, buildSystemPrompt(uid, isGroup(ctx)), true);

    saveMessage(uid, 'user', `[photo] ${caption}`);
    saveMessage(uid, 'assistant', response);
    await streamReply(ctx, response);
  } catch {
    await ctx.reply('Image processing failed.');
  }
}

// ── Document handler ──────────────────────────────────────────────────────────

export async function handleDocumentMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid || !hasAccess(uid)) return;
  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  const doc = ctx.message?.document;
  const caption = ctx.message?.caption || '';
  if (!doc) return;

  await ctx.replyWithChatAction('typing');

  const sizeKB = Math.round((doc.file_size || 0) / 1024);
  const r = await execute(
    uid,
    `Document received: "${doc.file_name}" (${doc.mime_type}, ${sizeKB}KB).${caption ? ' Caption: ' + caption : ''} Please acknowledge and offer to help analyze it.`,
    { bot }
  );
  await streamReply(ctx, r);
}
