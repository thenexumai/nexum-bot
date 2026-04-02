import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
import { handleMainMenuCallback } from './commands/general';
import { CONFIG, isAdmin } from '../core/config';
import db, { incrementMsgCount, ensureUserDb } from '../core/db';
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
  ensureUserDb(uid, username, firstName);
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
                  // /diag — диагностика (admin only)
                  bot.command('diag', async (ctx) => {
                    const uid = ctx.from?.id;
                    if (!uid || !isAdmin(uid)) { await ctx.reply('Нет прав.'); return; }
                    const { CONFIG, getModelChain } = await import('../core/config');
                    const user = db.prepare('SELECT subscription_plan, lang FROM users WHERE uid = ?').get(uid) as any;
                    const plan = user?.subscription_plan || 'free';
                    const chain = getModelChain(uid, plan === 'pro');
                    const prov = CONFIG.PROVIDERS;
                    const provInfo = Object.keys(prov).map(p => `${p}: ${prov[p as keyof typeof prov].length} ключей`).join("\n");
                    const chainInfo = chain.map(c => `${c.provider}/${c.model}`).join("\n") || 'нет моделей';
                    const text = `🛠 *NEXUM DIAG*\n\n` +
                                 `👤 UID: ${uid}\n` +
                                 `📦 План: ${plan}\n` +
                                 `🔑 Провайдеры:\n${provInfo}\n\n` +
                                 `🤖 Модели (getModelChain):\n${chainInfo}`;
                    await ctx.reply(text, { parse_mode: 'Markdown' });
                  });

  // ── Callback кнопки ──

  // /skills — список навыков пользователя
  bot.command('skills', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const { SkillManager } = await import('../core/skills/skill_manager');
    const skills = SkillManager.listSkills(uid);
    if (!skills.length) {
      await ctx.reply('⚡ Навыков пока нет. Они появятся после решения сложных задач!');
      return;
    }
    const text = skills.slice(0, 10).map((s, i) =>
      `${i+1}. **${s.name}** (качество: ${Math.round(s.quality_score)}%, использован ${s.success_count}×)\n   ${s.description}`
    ).join('\n\n');
    await ctx.reply(`⚡ *Мои навыки (${skills.length}):*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  // /profile — модель личности пользователя
  bot.command('profile', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const { UserModel } = await import('../core/user_model/user_model');
    const profile = UserModel.getProfile(uid);
    if (!profile || profile.profile_completeness < 5) {
      await ctx.reply('👤 Профиль ещё формируется. Пообщайся со мной немного больше!');
      return;
    }
    const interests = profile.interest_topics.slice(0, 6).join(', ') || 'не определены';
    const expertise = profile.expertise_areas.slice(0, 4).join(', ') || 'не определены';
    await ctx.reply(
      `👤 *Твой профиль (${Math.round(profile.profile_completeness)}% заполнен)*\n\n` +
      `🗣 Стиль общения: *${profile.communication_style}*\n` +
      `📝 Предпочтения: *${profile.response_preference}*\n` +
      `🎯 Интересы: ${interests}\n` +
      `💡 Экспертиза: ${expertise}\n` +
      `😊 Тональность: *${profile.sentiment_baseline}*\n` +
      `📊 Взаимодействий: *${profile.interaction_count}*`,
      { parse_mode: 'Markdown' }
    );
  });

  // /remind — установить напоминание

  // /reminders — список напоминаний

  // /search — поиск в интернете

  // /tariffs

  // /lang

  // /memory — долгосрочная память

  // /forget — очистить память

  // /new — сброс сессии

  // /apps — Mini Apps



  // ── Единый обработчик всех callback кнопок ──────────────────
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from?.id;
    if (!uid) { await ctx.answerCallbackQuery(); return; }

    // Кнопки главного меню (cmd:*)
    if (data.startsWith('cmd:')) {
      await ctx.answerCallbackQuery();
      await handleMainMenuCallback(data, uid, ctx);
      return;
    }

    // Режим ответов (mode_set:*)
    if (data.startsWith('mode_set:')) {
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

    // Апруввалы PC агента (appr_*)
    if (data.startsWith('appr_')) {
      const [actionId, status] = data.replace('appr_', '').split(':');
      handleApprovalResult(actionId, status === 'allow');
      await ctx.answerCallbackQuery(status === 'allow' ? 'Разрешено' : 'Отклонено');
      await ctx.editMessageText(
        status === 'allow' ? 'Действие выполнено.' : 'Действие отклонено.',
        { reply_markup: undefined }
      ).catch(() => {});
      return;
    }

    // Self-improve патчи (selfimprove_approve_* / selfimprove_reject_*)
    if (data.startsWith('selfimprove_approve_')) {
      if (!isAdmin(uid)) { await ctx.answerCallbackQuery('Нет прав'); return; }
      const patchId = data.replace('selfimprove_approve_', '');
      await ctx.answerCallbackQuery('Пушу...');
      const result = await approvePatch(patchId, bot);
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => ctx.reply(result));
      return;
    }

    if (data.startsWith('selfimprove_reject_')) {
      if (!isAdmin(uid)) { await ctx.answerCallbackQuery('Нет прав'); return; }
      const patchId = data.replace('selfimprove_reject_', '');
      const result = rejectPatch(patchId);
      await ctx.answerCallbackQuery('Отклонено');
      await ctx.editMessageText(result, { reply_markup: undefined }).catch(async () => ctx.reply(result));
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

  const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
  const plan = user?.subscription_plan || 'free';
  const limit = plan === 'pro' ? 9999 : plan === 'middle' ? 200 : 50;
  const count = incrementMsgCount(uid);

  if (count > limit) {
    await ctx.reply(`Лимит сообщений исчерпан (${limit}/день). Обнови план: /tariffs`);
    return;
  }

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
    } else if (!sentMsgId && !fullText) {
      await ctx.reply('⚠️ AI не вернул ответ. Проверь /diag или попробуй позже.');
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
