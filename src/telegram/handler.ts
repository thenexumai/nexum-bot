// NEXUM Message Handler — точный OpenClaw стриминг, без reply, без реакций

import { Bot, Context } from 'grammy';
import { execute } from '../agent/executor';
import { chatStreaming } from '../agent/router';
import { buildSystemPrompt } from '../agent/executor';
import { getHistory, saveMessage, autoExtract } from '../agent/memory';
import { config } from '../core/config';
import { ensureUser } from '../core/db';
import { transcribeVoice } from '../tools/stt';
import { textToSpeech, getUserVoicePref } from '../tools/tts';
import { createDraftStream } from './draft-stream';

// ── Точный OpenClaw стриминг ───────────────────────────────────────────────────
// 1. Показываем typing
// 2. Создаём draft stream (throttle 1000ms как в OpenClaw)
// 3. AI стримит токены → draft.update(accumulated) 
// 4. Каждые ~1 секунду editMessageText с накопленным текстом
// 5. stop() — финальный flush

export async function streamReply(ctx: Context, text: string): Promise<void> {
  if (!text?.trim()) return;
  await ctx.replyWithChatAction('typing');
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply(text);
  }
}

// Настоящий стриминг — используется когда провайдер поддерживает SSE
export async function streamingReply(
  ctx: Context,
  uid: number,
  userMessage: string,
): Promise<void> {
  const chatId = ctx.chat!.id;

  await ctx.replyWithChatAction('typing');

  const draft = createDraftStream({
    api: ctx.api,
    chatId,
    throttleMs: 1000, // Точно как OpenClaw
    renderText: (text) => {
      // Пробуем Markdown, при ошибке вернётся plain text
      return { text, parseMode: 'Markdown' };
    },
    warn: (msg) => console.warn('[draft]', msg),
  });

  try {
    const system = buildSystemPrompt(uid);
    const history = getHistory(uid, 20);
    const messages: any[] = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    const fullResponse = await chatStreaming(uid, messages, system, (accumulated) => {
      draft.update(accumulated);
    });

    // Финальный flush — как OpenClaw stop()
    await draft.stop();

    // Если draft не создал сообщение (очень короткий ответ) — отправляем сами
    if (draft.messageId() == null) {
      try {
        await ctx.reply(fullResponse, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(fullResponse);
      }
    }

    // Сохраняем в историю
    saveMessage(uid, 'user', userMessage);
    saveMessage(uid, 'assistant', fullResponse);

    // Автоизвлечение фактов
    autoExtract(uid, userMessage);

  } catch (err: any) {
    await draft.stop();
    if (draft.messageId() == null) {
      await ctx.reply('Ошибка. Попробуй ещё раз.');
    }
    console.error('[handler] streaming error:', err.message);
  }
}

// ── Access check ──────────────────────────────────────────────────────────────

export function hasAccess(uid: number): boolean {
  if (config.publicBot) return true;
  return config.adminIds.includes(uid);
}

// ── Main text handler ─────────────────────────────────────────────────────────

export async function handleTextMessage(ctx: Context, bot: Bot): Promise<void> {
  const msg = ctx.message?.text;
  const uid = ctx.from?.id;
  if (!msg || !uid) return;
  if (msg.startsWith('/')) return;
  if (!hasAccess(uid)) { await ctx.reply('Access denied.'); return; }

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  // Используем настоящий стриминг с OpenClaw-style draft
  await streamingReply(ctx, uid, msg);
}

// ── Voice handler ─────────────────────────────────────────────────────────────

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
    if (!transcript) { await ctx.reply('Не удалось распознать речь.'); return; }

    // Показываем транскрипт
    await ctx.reply(`_${transcript}_`, { parse_mode: 'Markdown' });

    // Получаем ответ
    const system = buildSystemPrompt(uid);
    const history = getHistory(uid, 20);
    const messages: any[] = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: transcript },
    ];

    const { chat } = await import('../agent/router');
    const response = await chat(uid, messages, system);

    saveMessage(uid, 'user', transcript);
    saveMessage(uid, 'assistant', response);

    // Голосовой ответ если режим включён
    const pref = getUserVoicePref(uid);
    if (pref.lang !== 'off') {
      try {
        await ctx.replyWithChatAction('record_voice');
        const ttsResult = await textToSpeech(response, uid);
        const buf = ttsResult.buffer;
        await (ctx.api as any).sendVoice(ctx.chat!.id, new Blob([buf], { type: 'audio/mpeg' }));
        return;
      } catch { /* fall through to text */ }
    }

    await streamReply(ctx, response);
  } catch (err: any) {
    if (err.message?.includes('STT')) {
      await ctx.reply('Голосовые сообщения требуют Groq ключ: /setkey groq <ключ>');
    } else {
      await ctx.reply('Ошибка обработки голоса.');
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
    const caption = ctx.message?.caption || 'Что на этом изображении?';
    const photo = photos[photos.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const imgBuf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const base64 = imgBuf.toString('base64');

    const messages: any[] = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: caption },
      ],
    }];

    const { chat } = await import('../agent/router');
    const response = await chat(uid, messages, buildSystemPrompt(uid), true);

    saveMessage(uid, 'user', `[photo] ${caption}`);
    saveMessage(uid, 'assistant', response);

    await streamReply(ctx, response);
  } catch {
    await ctx.reply('Ошибка обработки изображения.');
  }
}
