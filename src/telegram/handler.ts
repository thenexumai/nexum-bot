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

// Streaming: редактируем не чаще раза в 400ms чтобы не попасть в rate limit Telegram
const STREAM_EDIT_INTERVAL_MS = 400;

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
      `Привет, ${firstName}!\n\n` +
      `Я NEXUM — твой персональный AI-помощник.\n\n` +
      `Могу помочь с любыми вопросами, кодом, анализом, финансами, задачами. Работаю с голосом и изображениями.\n\n` +
      `Просто напиши что нужно.`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.command('mode', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const currentMode = getUserMode(uid);
    const keyboard = buildModeKeyboard(currentMode);
    await ctx.reply(
      `**Режим ответов**\n\nТекущий: ${MODE_LABELS[currentMode]}\n\n` +
      Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  bot.command('clear', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    try { db.prepare('DELETE FROM messages WHERE uid = ?').run(uid); } catch { }
    await ctx.reply('История диалога очищена.');
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `**Команды NEXUM**\n\n` +
      `/start — главное меню\n` +
      `/mode — режим ответов\n` +
      `/clear — очистить историю\n` +
      `/search [запрос] — поиск в интернете\n` +
      `/status — твой план и лимиты\n` +
      `/tariffs — тарифные планы\n\n` +
      `Для администратора:\n` +
      `/improve <файл> <описание> — предложить правку кода\n` +
      `/fix <описание ошибки> — исправить баг в боте\n` +
      `/patches — список ожидающих патчей`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
    const user = db.prepare('SELECT subscription_plan, msg_count_today FROM users WHERE uid = ?').get(uid) as any;
    const plan = user?.subscription_plan || 'free';
    const count = user?.msg_count_today || 0;
    const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
    const mode = getUserMode(uid);
    await ctx.reply(
      `**Твой статус**\n\n` +
      `План: ${plan.toUpperCase()}\n` +
      `Сообщений сегодня: ${count}/${limit === 9999 ? '∞' : limit}\n` +
      `Режим: ${MODE_LABELS[mode]}\n\n` +
      (count >= limit ? 'Лимит исчерпан. /tariffs' : `Осталось: ${limit - count}`),
      { parse_mode: 'Markdown' }
    );
  });

  // ── ADMIN: /fix — исправить баг в боте через обычный текст ──
  bot.command('fix', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid || !isAdmin(uid)) { await ctx.reply('Нет прав.'); return; }
    const description = ctx.message?.text?.replace('/fix', '').trim() || '';
    if (!description) {
      await ctx.reply(
        '**Использование /fix**\n\n`/fix <описание проблемы>`\n\n' +
        'Примеры:\n' +
        '`/fix handler.ts — бот дублирует сообщения при стриминге`\n' +
        '`/fix executor.ts — system prompt нужно переписать`',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    const msg = await ctx.reply('Анализирую проблему...');

    // Извлекаем имя файла из описания если есть
    const fileMatch = description.match(/(\S+\.ts)/);
    const filePath = fileMatch ? `src/${fileMatch[1].replace(/^src\//, '')}` : 'src/index.ts';
    const fixDescription = description.replace(/\S+\.ts\s*[—-]?\s*/, '').trim() || description;

    const result = await analyzeAndPropose(filePath, fixDescription, uid, bot);
    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result, { parse_mode: 'Markdown' })
      .catch(async () => { await ctx.reply(result, { parse_mode: 'Markdown' }); });
  });

  // ── ADMIN: /improve — явно указать файл ──
  bot.command('improve', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid || !isAdmin(uid)) { await ctx.reply('Нет прав.'); return; }
    const args = ctx.message?.text?.replace('/improve', '').trim() || '';
    if (!args) {
      await ctx.reply('`/improve <путь/к/файлу.ts> <что изменить>`', { parse_mode: 'Markdown' });
      return;
    }
    const spaceIdx = args.indexOf(' ');
    if (spaceIdx === -1) { await ctx.reply('Укажи описание после пути к файлу.'); return; }
    const filePath = args.slice(0, spaceIdx).trim();
    const description = args.slice(spaceIdx + 1).trim();
    const msg = await ctx.reply(`Анализирую \`${filePath}\`...`, { parse_mode: 'Markdown' });
    const result = await analyzeAndPropose(filePath, description, uid, bot);
    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result, { parse_mode: 'Markdown' })
      .catch(async () => { await ctx.reply(result); });
  });

  bot.command('patches', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid || !isAdmin(uid)) { await ctx.reply('Нет прав.'); return; }
    const list = await listPending();
    await ctx.reply(`**Ожидающие патчи:**\n\n${list}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(list));
  });

  // ── Callback кнопки ──
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from?.id;

    if (data.startsWith('mode_set:')) {
      if (!uid) { await ctx.answerCallbackQuery(); return; }
      const newMode = data.replace('mode_set:', '') as ChatMode;
      setUserMode(uid, newMode);
      await ctx.answerCallbackQuery(`${MODE_LABELS[newMode]}`);
      await ctx.editMessageText(
        `**Режим ответов**\n\nТекущий: ${MODE_LABELS[newMode]}\n\n` +
        Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
        { parse_mode: 'Markdown', reply_markup: buildModeKeyboard(newMode) }
      ).catch(() => {});
      return;
    }

    if (data === 'start_newchat') { await ctx.answerCallbackQuery(); await ctx.reply('Пиши!'); return; }
    if (data === 'start_modes') {
      if (!uid) { await ctx.answerCallbackQuery(); return; }
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `**Режим ответов:**\n\n` +
        Object.entries(MODE_LABELS).map(([k, v]) => `${v} — ${MODE_DESCRIPTIONS[k as ChatMode]}`).join('\n'),
        { parse_mode: 'Markdown', reply_markup: buildModeKeyboard(getUserMode(uid)) }
      );
      return;
    }
    if (data === 'start_tariffs') { await ctx.answerCallbackQuery(); await ctx.reply('Тарифы: /tariffs'); return; }
    if (data === 'start_help') { await ctx.answerCallbackQuery(); await ctx.reply('Напиши вопрос или используй /help'); return; }
    if (data === 'start_finance') { await ctx.answerCallbackQuery(); await ctx.reply('Финансы: /finance\n\nИли напиши: "потратил 500 на кофе"'); return; }
    if (data === 'start_tasks') { await ctx.answerCallbackQuery(); await ctx.reply('Задачи: /tasks\n\nИли напиши: "напомни купить молоко завтра"'); return; }

    if (data.startsWith('appr_')) {
      const [actionId, status] = data.replace('appr_', '').split(':');
      handleApprovalResult(actionId, status === 'allow');
      await ctx.answerCallbackQuery(status === 'allow' ? 'Разрешено' : 'Отклонено');
      await ctx.editMessageText(status === 'allow' ? 'Действие выполнено.' : 'Действие отклонено.', { reply_markup: undefined }).catch(() => {});
      return;
    }

    if (data.startsWith('selfimprove_approve_')) {
      if (!uid || !isAdmin(uid)) { await ctx.answerCallbackQuery('Нет прав'); return; }
      const patchId = data.replace('selfimprove_approve_', '');
      await ctx.answerCallbackQuery('Пушу...');
      const result = await approvePatch(patchId, bot);
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => { await ctx.reply(result); });
      return;
    }

    if (data.startsWith('selfimprove_reject_')) {
      if (!uid || !isAdmin(uid)) { await ctx.answerCallbackQuery('Нет прав'); return; }
      const patchId = data.replace('selfimprove_reject_', '');
      const result = rejectPatch(patchId);
      await ctx.answerCallbackQuery('Отклонено');
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => { await ctx.reply(result); });
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ── Голос ──
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
      if (!text) { await ctx.reply('Не удалось распознать голос. Попробуй ещё раз или напиши текстом.'); return; }
      await ctx.reply(`*Распознано:* _${text}_`, { parse_mode: 'Markdown' });
      await processAIRequest(ctx, text, uid);
    } catch (err) {
      Logger.error('telegram', 'Voice error', err);
      await ctx.reply('Ошибка при обработке голоса.');
    } finally { releaseKey(key); }
  });

  // ── Фото ──
  bot.on('message:photo', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const key = makeMsgKey(ctx);
    if (!acquireKey(key)) return;
    try {
      const caption = ctx.message.caption || 'Что на этом изображении? Опиши подробно.';
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      const imageUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
      await processAIRequest(ctx, `[vision:${imageUrl}] ${caption}`, uid);
    } catch (err) {
      Logger.error('telegram', 'Photo error', err);
      await ctx.reply('Ошибка при анализе фото.');
    } finally { releaseKey(key); }
  });

  // ── Документ ──
  bot.on('message:document', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const key = makeMsgKey(ctx);
    if (!acquireKey(key)) return;
    try {
      const doc = ctx.message.document;
      const caption = ctx.message.caption || '';
      await processAIRequest(ctx, `[Файл: ${doc.file_name}] ${caption}`, uid);
    } finally { releaseKey(key); }
  });

  // ── Текст ──
  bot.on('message:text', async (ctx: Context) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return;
    const key = makeMsgKey(ctx);
    if (!acquireKey(key)) return;
    try {
      await processAIRequest(ctx, text, uid);
    } finally { releaseKey(key); }
  });
};

export const sendApprovalButtons = async (bot: Bot, uid: number, actionId: string, action: string, args: any) => {
  const keyboard = new InlineKeyboard()
    .text('Разрешить', `appr_${actionId}:allow`)
    .text('Отклонить', `appr_${actionId}:deny`);
  await bot.api.sendMessage(uid,
    `*Запрос на действие*\n\nДействие: \`${action}\`\nАргументы: \`${JSON.stringify(args).slice(0, 200)}\`\n\nРазрешить?`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
};

// ============================================================
//  CORE: стриминг — первый токен сразу, без заглушек
// ============================================================
async function processAIRequest(ctx: Context, text: string, uid: number) {
  Logger.info('telegram', `UID ${uid}: ${text.slice(0, 80)}`);

  ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

  const user = db.prepare('SELECT subscription_plan, msg_count_today FROM users WHERE uid = ?').get(uid) as any;
  const plan = user?.subscription_plan || 'free';
  const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
  const count = user?.msg_count_today || 0;

  if (count >= limit) {
    await ctx.reply(`Лимит сообщений исчерпан (${limit}/день). Обнови план: /tariffs`);
    return;
  }

  db.prepare('UPDATE users SET msg_count_today = msg_count_today + 1 WHERE uid = ?').run(uid);

  let fullText = '';
  let sentMsgId: number | null = null;
  let lastEditText = '';
  let lastEditTime = 0;

  // Показываем typing пока идёт первый запрос к AI
  await ctx.replyWithChatAction('typing').catch(() => {});
  const typingInterval = setInterval(async () => {
    if (!sentMsgId) await ctx.replyWithChatAction('typing').catch(() => {});
  }, 4500);

  try {
    const history = getSessionHistory(uid);

    for await (const chunk of executeAI(text, uid, history)) {
      fullText += chunk;

      // ПЕРВЫЙ ЧАНк — отправляем сразу, без ожидания и без эмодзи-заглушки
      if (!sentMsgId) {
        clearInterval(typingInterval as any); // прекращаем typing — текст уже виден
        try {
          const sent = await ctx.reply(fullText, { parse_mode: 'Markdown' });
          sentMsgId = sent.message_id;
          lastEditText = fullText;
          lastEditTime = Date.now();
        } catch {
          const sent = await ctx.reply(fullText);
          sentMsgId = sent.message_id;
          lastEditText = fullText;
          lastEditTime = Date.now();
        }
        continue;
      }

      // Редактируем по интервалу
      if (fullText !== lastEditText && Date.now() - lastEditTime >= STREAM_EDIT_INTERVAL_MS) {
        try {
          await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText, { parse_mode: 'Markdown' });
          lastEditText = fullText;
          lastEditTime = Date.now();
        } catch {
          try {
            await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText);
            lastEditText = fullText;
            lastEditTime = Date.now();
          } catch { }
        }
      }
    }

    // Финальный edit если текст изменился
    if (!sentMsgId && fullText) {
      try { await ctx.reply(fullText, { parse_mode: 'Markdown' }); }
      catch { await ctx.reply(fullText); }
    } else if (sentMsgId && fullText !== lastEditText) {
      try { await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText, { parse_mode: 'Markdown' }); }
      catch {
        try { await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, fullText); }
        catch { }
      }
    }

    if (fullText) {
      appendToSession(uid, 'user', text);
      appendToSession(uid, 'assistant', fullText);
    }

  } catch (err) {
    Logger.error('telegram', 'AI request error', err);
    const errMsg = 'Что-то пошло не так. Попробуй ещё раз.';
    if (sentMsgId) {
      await ctx.api.editMessageText(ctx.chat!.id, sentMsgId, errMsg).catch(() => {});
    } else {
      await ctx.reply(errMsg);
    }
  } finally {
    clearInterval(typingInterval);
  }
}
