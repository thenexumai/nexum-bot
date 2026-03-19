// NEXUM Message Handler — OpenClaw-style, NO reactions

import { Bot, Context } from 'grammy';
import { execute } from '../agent/executor';
import { config } from '../core/config';
import { ensureUser } from '../core/db';
import { transcribeVoice } from '../tools/stt';
import { textToSpeech, getUserVoicePref } from '../tools/tts';
import { getMemories, clearHistory } from '../agent/memory';

// ── Streaming draft edit (OpenClaw-style) ─────────────────────────────────────

export async function streamReply(ctx: Context, text: string, replyToId?: number): Promise<void> {
  if (!text || !text.trim()) return;

  const options: any = {};
  if (replyToId) options.reply_parameters = { message_id: replyToId };

  // Short messages — send directly with light delay
  if (text.length < 300) {
    await ctx.replyWithChatAction('typing');
    await sleep(200);
    await ctx.reply(text, { parse_mode: 'Markdown', ...options });
    return;
  }

  // Long messages — stream with live edit effect
  await ctx.replyWithChatAction('typing');
  await sleep(300);

  const msg = await ctx.reply('...', options);
  let displayed = '';
  const chars = text.split('');

  for (let i = 0; i < chars.length; i++) {
    displayed += chars[i];
    // Update every ~60 chars or at the end
    if (i % 60 === 0 || i === chars.length - 1) {
      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          msg.message_id,
          displayed + (i < chars.length - 1 ? '…' : ''),
          { parse_mode: 'Markdown' }
        );
        await sleep(30);
      } catch {
        // Markdown parse error — retry without formatting
        try {
          await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, displayed + (i < chars.length - 1 ? '…' : ''));
          await sleep(30);
        } catch { break; }
      }
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Access check ──────────────────────────────────────────────────────────────

export function hasAccess(uid: number): boolean {
  if (config.publicBot) return true;
  if (config.adminIds.includes(uid)) return true;
  return false;
}

// ── Main message handler ──────────────────────────────────────────────────────

export async function handleTextMessage(ctx: Context, bot: Bot): Promise<void> {
  const msg = ctx.message?.text;
  const uid = ctx.from?.id;
  if (!msg || !uid) return;
  if (msg.startsWith('/')) return; // handled by commands

  if (!hasAccess(uid)) {
    await ctx.reply('Access denied.');
    return;
  }

  // Register user
  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  // Typing indicator — NO reactions
  await ctx.replyWithChatAction('typing');

  try {
    const response = await execute(uid, msg);
    await streamReply(ctx, response, ctx.message?.message_id);
  } catch (err: any) {
    await ctx.reply('Something went wrong. Try again.');
  }
}

// ── Voice message handler ─────────────────────────────────────────────────────

export async function handleVoiceMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid || !hasAccess(uid)) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  await ctx.replyWithChatAction('typing');

  try {
    const voice = ctx.message?.voice;
    if (!voice) return;

    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const resp = await fetch(url);
    const buf = Buffer.from(await resp.arrayBuffer());

    const transcript = await transcribeVoice(buf);
    if (!transcript) {
      await ctx.reply('Could not transcribe audio.');
      return;
    }

    // Show transcript
    await ctx.reply(`_${transcript}_`, { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message!.message_id } });

    // Execute
    const response = await execute(uid, transcript);

    // Check if voice mode active
    const pref = getUserVoicePref(uid);
    if (pref.lang !== 'off') {
      try {
        await ctx.replyWithChatAction('record_voice');
        const ttsResult = await textToSpeech(response, uid);
        await ctx.replyWithVoice(new Blob([ttsResult.buffer], { type: 'audio/mpeg' }) as any, { reply_parameters: { message_id: ctx.message!.message_id } });
        return;
      } catch { /* fall through to text */ }
    }

    await streamReply(ctx, response, ctx.message?.message_id);
  } catch (err: any) {
    if (err.message?.includes('STT unavailable')) {
      await ctx.reply('Voice transcription unavailable. Add a Groq API key with /setkey groq <key>');
    } else {
      await ctx.reply('Voice processing failed.');
    }
  }
}

// ── Photo handler ─────────────────────────────────────────────────────────────

export async function handlePhotoMessage(ctx: Context, bot: Bot): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid || !hasAccess(uid)) return;

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
  await ctx.replyWithChatAction('typing');

  try {
    const photos = ctx.message?.photo;
    if (!photos?.length) return;

    const caption = ctx.message?.caption || 'What do you see in this image?';
    const photo = photos[photos.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

    const imgResp = await fetch(url);
    const imgBuf = Buffer.from(await imgResp.arrayBuffer());
    const base64 = imgBuf.toString('base64');
    const mime = 'image/jpeg';

    const messages: any[] = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        { type: 'text', text: caption },
      ],
    }];

    const { chat } = await import('../agent/router');
    const { buildSystemPrompt } = await import('../agent/executor');
    const response = await chat(uid, messages, buildSystemPrompt(uid), true);

    await streamReply(ctx, response, ctx.message?.message_id);
  } catch {
    await ctx.reply('Image processing failed.');
  }
}
