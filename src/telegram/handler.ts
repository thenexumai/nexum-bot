import { Bot, Context } from 'grammy';
import { getOrCreateUser, incrementMsgCount } from '../core/db';
import { getUserPlan, checkRateLimit } from '../core/billing';
import { getPreferences } from '../core/preferences';
import { detectAndSaveIntent, intentSummary } from '../agent/intents';
import { executeAI, getSession, addToSession } from '../agent/executor';
import { buildSystemPrompt } from '../agent/persona';
import { webSearch } from '../tools/search';
import { transcribeVoice } from '../tools/stt';
import t from '../i18n';
import logger from '../infra/logger';
import db from '../core/db';

export function setupHandler(bot: Bot) {

  // Text messages
  bot.on('message:text', async (ctx) => {
    const uid   = ctx.from!.id;
    const text  = ctx.message?.text ?? '';
    if (!text || text.startsWith('/')) return;

    const user  = getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name);
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;
    const count = incrementMsgCount(uid);
    const plan  = getUserPlan(uid);

    // Rate limit check
    if (!checkRateLimit(uid, count)) {
      await ctx.reply(t(lang, 'limit_reached'), { parse_mode: 'Markdown' });
      return;
    }

    // Intent detection + auto-save
    const intent = detectAndSaveIntent(text, uid);
    const intentMsg = intentSummary(intent, lang);

    // Build reply
    const typing = await ctx.reply(t(lang, 'thinking'));
    try {
      // Auto-search detection
      let extraContext = '';
      const needsSearch = /найди|поищи|что такое|кто такой|search|find|what is|who is/i.test(text);
      if (needsSearch) {
        try {
          const results = await webSearch(text);
          extraContext = `\n\nSearch results:\n${results}`;
        } catch { /* silent */ }
      }

      const history = getSession(uid);
      addToSession(uid, 'user', text);

      const system = buildSystemPrompt(uid, lang, plan);
      const response = await executeAI({
        uid,
        messages: [...history, { role: 'user', content: text + extraContext }],
        systemPrompt: system,
      });

      addToSession(uid, 'assistant', response);

      const reply = (intentMsg ? `${intentMsg}\n\n` : '') + response;
      await ctx.api.editMessageText(ctx.chat.id, typing.message_id, reply, {
        parse_mode: 'Markdown',
      }).catch(() => ctx.reply(reply, { parse_mode: 'Markdown' }));

    } catch (err) {
      logger.error('handler', 'AI execution failed', err);
      await ctx.api.editMessageText(ctx.chat.id, typing.message_id, t(lang, 'error_generic'))
        .catch(() => ctx.reply(t(lang, 'error_generic')));
    }
  });

  // Voice messages
  bot.on('message:voice', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;
    getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name);

    await ctx.reply('🎙️ Transcribing...');
    try {
      const fileInfo = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = await transcribeVoice(buf);
      if (!text) { await ctx.reply('❌ Could not transcribe'); return; }

      await ctx.reply(`🎙️ *${text}*`, { parse_mode: 'Markdown' });

      // Process as text
      const count = incrementMsgCount(uid);
      const plan  = getUserPlan(uid);
      if (!checkRateLimit(uid, count)) { await ctx.reply(t(lang, 'limit_reached')); return; }

      const history = getSession(uid);
      addToSession(uid, 'user', text);
      const system = buildSystemPrompt(uid, lang, plan);
      const response = await executeAI({ uid, messages: [...history, { role: 'user', content: text }], systemPrompt: system });
      addToSession(uid, 'assistant', response);
      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (e) {
      logger.error('handler', 'Voice processing failed', e);
      await ctx.reply(t(lang, 'error_generic'));
    }
  });

  // Photo messages
  bot.on('message:photo', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;
    getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name);

    const caption = ctx.message?.caption ?? 'Опиши это изображение подробно / Describe this image in detail';
    await ctx.reply('🖼️ Analyzing image...');

    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const fileInfo = await ctx.api.getFile(largest.file_id);
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
      const imgRes = await fetch(url);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const base64 = imgBuf.toString('base64');

      // Use Gemini for vision
      const { getNextKey } = await import('../core/config');
      const key = getNextKey('gemini');
      if (!key) { await ctx.reply('❌ No Gemini key for vision'); return; }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: caption },
                { inline_data: { mime_type: 'image/jpeg', data: base64 } },
              ],
            }],
          }),
        }
      );
      const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
      const answer = data.candidates[0].content.parts[0].text;
      await ctx.reply(answer, { parse_mode: 'Markdown' });
    } catch (e) {
      logger.error('handler', 'Photo processing failed', e);
      await ctx.reply(t(lang, 'error_generic'));
    }
  });

  // Document messages
  bot.on('message:document', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;
    getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name);

    const doc = ctx.message.document;
    await ctx.reply(`📄 Processing *${doc.file_name}*...`, { parse_mode: 'Markdown' });

    try {
      const fileInfo = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
      const res = await fetch(url);
      const text = await res.text();
      const snippet = text.slice(0, 3000);

      const count = incrementMsgCount(uid);
      const plan  = getUserPlan(uid);
      if (!checkRateLimit(uid, count)) { await ctx.reply(t(lang, 'limit_reached')); return; }

      const userMsg = `Document: "${doc.file_name}"\nContent:\n${snippet}\n\nSummarize and analyze this document.`;
      const system = buildSystemPrompt(uid, lang, plan);
      const answer = await executeAI({ uid, messages: [{ role: 'user', content: userMsg }], systemPrompt: system });
      await ctx.reply(answer, { parse_mode: 'Markdown' });
    } catch (e) {
      logger.error('handler', 'Document processing failed', e);
      await ctx.reply(t(lang, 'error_generic'));
    }
  });
}
