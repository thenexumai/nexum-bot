// NEXUM Handler — OpenClaw-style streaming, group/DM aware, no reactions

import { Bot, Context } from 'grammy';
import { execute, buildSystemPrompt } from '../agent/executor';
import { chatStreaming } from '../agent/router';
import { getHistory, saveMessage, autoExtract } from '../agent/memory';
import { config } from '../core/config';
import { ensureUser } from '../core/db';
import { transcribeVoice } from '../tools/stt';
import { textToSpeech, getUserVoicePref } from '../tools/tts';
import { createDraftStream } from './draft-stream';

// ── Access ────────────────────────────────────────────────────────────────────

export function hasAccess(uid: number): boolean {
  if (config.publicBot) return true;
  return config.adminIds.includes(uid);
}

function isGroupChat(ctx: Context): boolean {
  const type = ctx.chat?.type;
  return type === 'group' || type === 'supergroup';
}

function isBotMentioned(ctx: Context, botUsername: string): boolean {
  const text = ctx.message?.text || ctx.message?.caption || '';
  return text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
}

// ── streamReply — for short/non-streaming replies ────────────────────────────

export async function streamReply(ctx: Context, text: string): Promise<void> {
  if (!text?.trim()) return;
  try { await ctx.reply(text, { parse_mode: 'Markdown' }); }
  catch { await ctx.reply(text); }
}

// ── Streaming reply — OpenClaw draft stream (throttle 1000ms) ────────────────

export async function streamingReply(ctx: Context, uid: number, userMessage: string, isGroup = false): Promise<void> {
  const chatId = ctx.chat!.id;

  await ctx.replyWithChatAction('typing').catch(() => {});

  const draft = createDraftStream({
    api: ctx.api,
    chatId,
    warn: (msg) => console.warn('[draft]', msg),
  });

  // Keep typing alive during generation (OpenClaw typing keepalive pattern)
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {});
  }, 4500);

  try {
    const system = buildSystemPrompt(uid, isGroup);
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
      try { await ctx.reply(fullResponse, { parse_mode: 'Markdown' }); }
      catch { await ctx.reply(fullResponse); }
    }

    saveMessage(uid, 'user', userMessage);
    saveMessage(uid, 'assistant', fullResponse);
    autoExtract(uid, userMessage);

  } catch (err: any) {
    clearInterval(typingInterval);
    await draft.stop();
    if (draft.messageId() == null) {
      await ctx.reply('Error. Please try again.').catch(() => {});
    }
    console.error('[handler]', err.message);
  }
}

// ── Text message handler ──────────────────────────────────────────────────────

export async function handleTextMessage(ctx: Context, bot: Bot): Promise<void> {
  const msg = ctx.message?.text;
  const uid = ctx.from?.id;
  if (!msg || !uid) return;
  if (msg.startsWith('/')) return;
  if (!hasAccess(uid)) return;

  const group = isGroupChat(ctx);

  // In groups — only respond when mentioned
  if (group) {
    const botInfo = await bot.api.getMe();
    const mentioned = isBotMentioned(ctx, botInfo.username || '');
    const isReply = ctx.message?.reply_to_message?.from?.id === botInfo.id;
    if (!mentioned && !isReply) return;
  }

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  await streamingReply(ctx, uid, msg, group);
}

// ── Voice message handler ─────────────────────────────────────────────────────

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
    if (!transcript) { await ctx.reply('Could not transcribe audio.'); return; }

    await ctx.reply(`_${transcript}_`, { parse_mode: 'Markdown' });

    const response = await execute(uid, transcript, { isGroup: isGroupChat(ctx), bot });

    const pref = getUserVoicePref(uid);
    if (pref.lang !== 'off') {
      try {
        await ctx.replyWithChatAction('record_voice');
        const tts = await textToSpeech(response, uid);
        await (ctx.api as any).sendVoice(ctx.chat!.id, new Blob([tts.buffer], { type: 'audio/mpeg' }));
        return;
      } catch { /* fall through to text */ }
    }
    await streamReply(ctx, response);
  } catch (e: any) {
    await ctx.reply(e.message?.includes('STT') ? 'Add Groq key for voice: /setkey groq <key>' : 'Voice error.');
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
    const messages: any[] = [{ role:'user', content: [
      { type:'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
      { type:'text', text: caption },
    ]}];
    const { chat } = await import('../agent/router');
    const response = await chat(uid, messages, buildSystemPrompt(uid, isGroupChat(ctx)), true);
    saveMessage(uid, 'user', `[photo] ${caption}`);
    saveMessage(uid, 'assistant', response);
    await streamReply(ctx, response);
  } catch { await ctx.reply('Image processing failed.'); }
}
