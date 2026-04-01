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
import { ChatMode, getUserMode, setUserMode, MODE_LABELS, MODE_DESCRIPTIONS } from '../soul';
import fetch from 'node-fetch';

// Стриминг: быстрый как Perplexity
const STREAM_FIRST_SEND_CHARS = 20;
const STREAM_EDIT_INTERVAL_MS = 350; // было 900ms — теперь быстро

// Защита от дублей
const activeRequests = new Set<string>();
const processedMessages = new Map<string, number>();
const PROCESSED_TTL_MS = 5 * 60 * 1000;

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

function acquireKey(key: string | null): boolean {
  if (!key) return true;
  if (activeRequests.has(key) || processedMessages.has(key)) return false;
  activeRequests.add(key);
  return true;
}

function releaseKey(key: string | null): void {
  if (!key) return;
  activeRequests.delete(key);
  processedMessages.set(key, Date.now());
}

function safeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function ensureUser(uid: number, username?: string, firstName?: string): void {
  const existing = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid);
  if (!existing) {
    db.prepare(
      `INSERT OR IGNORE INTO users (uid, username, first_name, subscription_plan, msg_count_today, created_at)
       VALUES (?, ?, ?, 'free', 0, datetime('now'))`
    ).run(uid, username || null, firstName || null);
  }
}

const MODES: ChatMode[] = ['default', 'deep', 'brief', 'creative', 'code'];

function buildModeKeyboard(currentMode: ChatMode): InlineKeyboard {
  const kb = new InlineKeyboard();
  MODES.forEach((m, i) => {
    const label = currentMode === m ? `✅ ${MODE_LABELS[m]}` : MODE_LABELS[m];
    kb.text(label, `mode_set:${m}`);
    if (i % 2 === 1) kb.row();
  });
  if (MODES.length % 2 !== 0) kb.row();
  return kb;
}

export const setupBot = (bot: Bot) => {
  setupCommands(bot);

  // /start
  bot.command('start', async (ctx) => {
    const uid = ctx.from?.id;
    if (uid) ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    const firstName = ctx.from?.first_name || 'там';
    const keyboard = new InlineKeyboard()
      .text('💬 Новый чат', 'start_newchat')
      .text('🎯 Режимы', 'start_modes')
      .row()
      .text('💰 Финансы', 'start_finance')
      .text('✅ Задачи', 'start_tasks')
      .row()
      .url('🌐 Открыть NEXUM Web', CONFIG.WEBAPP_URL || 'https://thenexum.ai')
      .row()
      .text('💎 Тарифы', 'start_tariffs')
      .text('❓ Помощь', 'start_help');

    await ctx.reply(
      `👋 Привет, ${firstName}!\n\n` +
      `Я **NEXUM** — твой AI-помощник нового поколения.\n\n` +
      `Могу помочь с:\n` +
      `• Любыми вопросами и задачами\n` +
      `• Кодом, анализом, исследованием\n` +
      `• Финансами и планированием\n` +
      `• Голосом 🎤, фото 📸, документами 📄\n\n` +
      `Просто напиши что тебя интересует 👇`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /mode command
  bot.command('mode', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const currentMode = getUserMode(uid);
    const keyboard = buildModeKeyboard(currentMode);
    await ctx.reply(
      `🎯 **Режим ответов**\n\nТекущий: ${MODE_LABELS[currentMode]}\n\n` +
      Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /clear command
  bot.command('clear', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    try {
      db.prepare('DELETE FROM messages WHERE uid = ?').run(uid);
    } catch { }
    await ctx.reply('🧹 История диалога очищена. Начинаем с чистого листа!');
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📚 **Команды NEXUM**\n\n` +
      `**Основные:**\n` +
      `/start — главное меню\n` +
      `/mode — сменить режим ответов\n` +
      `/clear — очистить историю чата\n` +
      `/memory — моя память о тебе\n` +
      `/search [запрос] — поиск в интернете\n\n` +
      `**Финансы:**\n` +
      `/finance — обзор финансов\n` +
      `/budget — бюджет\n\n` +
      `**Задачи:**\n` +
      `/tasks — мои задачи\n` +
      `/todo [задача] — добавить задачу\n\n` +
      `**Подписка:**\n` +
      `/tariffs — тарифные планы\n` +
      `/status — мой статус и лимиты\n\n` +
      `**Продвинутые:**\n` +
      `/improve — улучшить файл (admin)\n` +
      `/patches — список патчей (admin)\n\n` +
      `💡 Или просто напиши что нужно — я пойму!`,
      { parse_mode: 'Markdown' }
    );
  });

  // /status command
  bot.command('status', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
    const user = db.prepare('SELECT subscription_plan, msg_count_today FROM users WHERE uid = ?').get(uid) as any;
    const plan = user?.subscription_plan || 'free';
    const count = user?.msg_count_today || 0;
    const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
    const mode = getUserMode(uid);
    const planEmoji = plan === 'pro' ? '💎' : plan === 'middle' ? '⭐' : '🆓';
    await ctx.reply(
      `${planEmoji} **Твой статус**\n\n` +
      `📋 План: **${plan.toUpperCase()}**\n` +
      `💬 Сообщений сегодня: **${count}/${limit}**\n` +
      `🎯 Режим: **${MODE_LABELS[mode]}**\n\n` +
      (count >= limit ? '⚠️ Лимит исчерпан. Обнови план: /tariffs' : `✅ Осталось: ${limit - count} сообщений`),
      { parse_mode: 'Markdown' }
    );
  });

  // Callback обработчики
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from?.id;

    // Режимы
    if (data.startsWith('mode_set:')) {
      if (!uid) { await ctx.answerCallbackQuery(); return; }
      const newMode = data.replace('mode_set:', '') as ChatMode;
      setUserMode(uid, newMode);
      const keyboard = buildModeKeyboard(newMode);
      await ctx.answerCallbackQuery(`✅ Режим: ${MODE_LABELS[newMode]}`);
      await ctx.editMessageText(
        `🎯 **Режим ответов**\n\nТекущий: ${MODE_LABELS[newMode]}\n\n` +
        Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
        { parse_mode: 'Markdown', reply_markup: keyboard }
      ).catch(() => {});
      return;
    }

    // Start menu callbacks
    if (data === 'start_newchat') {
      await ctx.answerCallbackQuery('✍️ Пиши!');
      await ctx.reply('Готов! Напиши что тебя интересует 😊');
      return;
    }
    if (data === 'start_modes') {
      if (!uid) { await ctx.answerCallbackQuery(); return; }
      const currentMode = getUserMode(uid);
      const keyboard = buildModeKeyboard(currentMode);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `🎯 **Режим ответов** — выбери стиль:\n\n` +
        Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      return;
    }
    if (data === 'start_tariffs') {
      await ctx.answerCallbackQuery();
      await ctx.reply('💎 Тарифы: /tariffs');
      return;
    }
    if (data === 'start_help') {
      await ctx.answerCallbackQuery();
      const helpCtx = { ...ctx, reply: ctx.reply };
      // trigger help
      await ctx.reply(
        `📚 Напиши любой вопрос или используй команды:\n/mode /clear /memory /search /tariffs /help`
      );
      return;
    }
    if (data === 'start_finance') {
      await ctx.answerCallbackQuery();
      await ctx.reply('💰 Финансовый трекер: /finance\n\nИли просто напиши: "потратил 500 на кофе"');
      return;
    }
    if (data === 'start_tasks') {
      await ctx.answerCallbackQuery();
      await ctx.reply('✅ Задачи: /tasks\n\nИли просто напиши: "напомни купить молоко завтра"');
      return;
    }

    // Approvals
    if (data.startsWith('appr_')) {
      const [actionId, status] = data.replace('appr_', '').split(':');
      const approved = status === 'allow';
      handleApprovalResult(actionId, approved);
      await ctx.answerCallbackQuery(approved ? '✅ Разрешено' : '❌ Отклонено');
      await ctx.editMessageText(approved ? '✅ Действие выполнено.' : '❌ Действие отклонено.', {
        reply_markup: undefined,
      }).catch(() => {});
      return;
    }

    if (data.startsWith('selfimprove_approve_')) {
      if (!uid || !isAdmin(uid)) { await ctx.answerCallbackQuery('❌ Нет прав'); return; }
      const patchId = data.replace('selfimprove_approve_', '');
      await ctx.answerCallbackQuery('⏳ Пушу...');
      const result = await approvePatch(patchId, bot);
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => { await ctx.reply(result); });
      return;
    }

    if (data.startsWith('selfimprove_reject_')) {
      if (!uid || !isAdmin(uid)) { await ctx.answerCallbackQuery('❌ Нет прав'); return; }
      const patchId = data.replace('selfimprove_reject_', '');
      const result = rejectPatch(patchId);
      await ctx.answerCallbackQuery('🗑 Отклонено');
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => { await ctx.reply(result); });
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Admin commands
  bot.command('improve', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid || !isAdmin(uid)) { await ctx.reply('❌ Только для администраторов.'); return; }
    const args = ctx.message?.text?.replace('/improve', '').trim() || '';
    if (!args) {
      await ctx.reply(
        '📝 *Использование:*\n`/improve <путь_к_файлу> <описание изменения>`\n\n*Примеры:*\n`/improve src/agent/tools.ts добавь инструмент`',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    const spaceIdx = args.indexOf(' ');
    if (spaceIdx === -1) { await ctx.reply('❌ Укажи описание изменения после пути к файлу.'); return; }
    const filePath = args.slice(0, spaceIdx).trim();
    const description = args.slice(spaceIdx + 1).trim();
    const thinking = await ctx.reply(`🤔 Анализирую \`${filePath}\`...`, { parse_mode: 'Markdown' });
    const result = await analyzeAndPropose(filePath, description, uid, bot);
    await ctx.api.editMessageText(ctx.chat!.id, thinking.message_id, result, { parse_mode: 'Markdown' })
      .catch(async () => { await ctx.reply(result); });
  });

  bot.command('patches', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid || !isAdmin(uid)) { await ctx.reply('❌ Только для администраторов.'); return; }
    const list = await listPending();
    await ctx.reply(`📋 *Ожидающие патчи:*\n\n${list}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(list));
  });

  // Voice
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

  // Photo
  bot.on('message:photo', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const key = makeMsgKey(ctx);
    if (!acquireKey(key)) return;
    try {
      const caption = ctx.message.caption || 'Что на этом изображении? Опиши подробно.';
      const photo = ctx.message.photo[ctx.message.photo.length - 1]; // highest resolution
      const file = await ctx.api.getFile(photo.file_id);
      const imageUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
      await processAIRequest(ctx, `[vision:${imageUrl}] ${caption}`, uid);
    } catch (err) {
      Logger.error('telegram', 'Photo error', err);
      await ctx.reply('❌ Ошибка при анализе фото.');
    } finally {
      releaseKey(key);
    }
  });

  // Document
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

  // Text
  bot.on('message:text', async (ctx: Context) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return;
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
//  CORE: streaming AI response — быстрый стриминг
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
      `⚠️ *Лимит сообщений исчерпан* (${limit}/день)\n\nОбнови план: /tariffs`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  db.prepare('UPDATE users SET msg_count_today = msg_count_today + 1 WHERE uid = ?').run(uid);
  await ctx.replyWithChatAction('typing').catch(() => {});

  let fullText = '';
  let sentMsgId: number | null = null;
  let lastEditText = '';
  let lastEditTime = 0;
  let typingInterval: ReturnType<typeof setInterval> | null = null;

  // Keep sending typing action while streaming
  typingInterval = setInterval(async () => {
    await ctx.replyWithChatAction('typing').catch(() => {});
  }, 4000);

  try {
    const history = getSessionHistory(uid);
    const stream = await executeAI(text, uid, history);

    for await (const chunk of stream) {
      fullText += chunk;

      // First message — send as soon as we have enough text
      if (!sentMsgId && fullText.length >= STREAM_FIRST_SEND_CHARS) {
        try {
          const sent = await ctx.reply(fullText + ' ✍️', {
            parse_mode: 'Markdown',
          });
          sentMsgId = sent.message_id;
          lastEditText = fullText;
          lastEditTime = Date.now();
        } catch {
          // If Markdown fails, try plain
          const sent = await ctx.reply(fullText + ' ✍️');
          sentMsgId = sent.message_id;
          lastEditText = fullText;
          lastEditTime = Date.now();
        }
        continue;
      }

      // Edit existing message at interval
      if (sentMsgId && fullText !== lastEditText && Date.now() - lastEditTime >= STREAM_EDIT_INTERVAL_MS) {
        try {
          await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText + ' ✍️', {
            parse_mode: 'Markdown',
          });
          lastEditText = fullText;
          lastEditTime = Date.now();
        } catch {
          // Markdown parse error — try plain
          try {
            await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText + ' ✍️');
            lastEditText = fullText;
            lastEditTime = Date.now();
          } catch { }
        }
      }
    }

    // Final message — remove typing indicator
    if (!sentMsgId && fullText) {
      try {
        await ctx.reply(fullText, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(fullText);
      }
    } else if (sentMsgId && fullText !== lastEditText) {
      try {
        await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText, {
          parse_mode: 'Markdown',
        });
      } catch {
        try {
          await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText);
        } catch { }
      }
    } else if (sentMsgId) {
      // Just remove the ✍️ indicator
      try {
        await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText, {
          parse_mode: 'Markdown',
        });
      } catch {
        try {
          await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText);
        } catch { }
      }
    }

    if (fullText) {
      appendToSession(uid, text, fullText);
    }
  } catch (err) {
    Logger.error('telegram', 'AI request error', err);
    const errMsg = '❌ Что-то пошло не так. Попробуй ещё раз — иногда такое бывает 🙏';
    if (sentMsgId) {
      await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, errMsg).catch(() => {});
    } else {
      await ctx.reply(errMsg);
    }
  } finally {
    if (typingInterval) clearInterval(typingInterval);
  }
}
