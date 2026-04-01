import { Bot, Context, InlineKeyboard } from 'grammy';
import { executeAI } from '../agent/executor';
import { Logger } from '../infra/logger';
import { transcribeVoice } from '../tools/stt';
import { handleApprovalResult } from '../agent/policies/exec-approvals';
import { setupCommands } from './commands';
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
  bot.command('remind', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const args = ctx.message?.text?.replace('/remind', '').trim() || '';
    if (!args) {
      await ctx.reply(
        '⏰ *Напоминание*\n\nИспользование:\n`/remind <текст> <время>`\n\n' +
        'Примеры:\n' +
        '`/remind купить молоко через 30 минут`\n' +
        '`/remind позвонить клиенту через 2 часа`\n\n' +
        'Или просто напиши мне: "напомни купить хлеб через 10 минут"',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const patterns = [
      { re: /через\s+(\d+)\s*(минут|мин|м)/i, mult: 60000 },
      { re: /через\s+(\d+)\s*(час|ч)/i, mult: 3600000 },
      { re: /in\s+(\d+)\s*(min|minute)/i, mult: 60000 },
      { re: /in\s+(\d+)\s*(hour|h)/i, mult: 3600000 },
    ];

    let ms = 0;
    for (const p of patterns) {
      const m = args.match(p.re);
      if (m) { ms = parseInt(m[1]) * p.mult; break; }
    }

    if (!ms) {
      await ctx.reply('❓ Не понял время. Напиши: `/remind текст через N минут`', { parse_mode: 'Markdown' });
      return;
    }

    const reminderText = args.replace(/через\s+\d+\s*(минут|мин|час|часов|ч|min|hour|h)/i, '').trim() || args;
    const fireAt = new Date(Date.now() + ms).toISOString();
    db.prepare('INSERT INTO reminders (chat_id, uid, text, fire_at) VALUES (?, ?, ?, ?)').run(uid, uid, reminderText, fireAt);

    const minutes = Math.round(ms / 60000);
    await ctx.reply(`✅ Напомню через *${minutes < 60 ? minutes + ' мин' : Math.round(minutes/60) + ' ч'}*:\n_${reminderText}_`, { parse_mode: 'Markdown' });
  });

  // /reminders — список напоминаний
  bot.command('reminders', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const rows = db.prepare(
      `SELECT id, text, fire_at FROM reminders WHERE uid=? AND done=0 AND fire_at > datetime('now') ORDER BY fire_at LIMIT 10`
    ).all(uid) as any[];

    if (!rows.length) {
      await ctx.reply('📋 Активных напоминаний нет.');
      return;
    }

    const text = rows.map((r, i) => {
      const t = new Date(r.fire_at);
      const timeStr = t.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      return `${i+1}. ⏰ ${timeStr}\n   _${r.text.slice(0, 80)}_`;
    }).join('\n\n');

    await ctx.reply(`📋 *Твои напоминания:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  // /search — поиск в интернете
  bot.command('search', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const query = ctx.message?.text?.replace('/search', '').trim() || '';
    if (!query) {
      await ctx.reply('🔍 Использование: `/search ваш запрос`', { parse_mode: 'Markdown' });
      return;
    }
    const msg = await ctx.reply('🔍 Ищу...');
    try {
      const { webSearchFormatted } = await import('../tools/search');
      const result = await webSearchFormatted(query);
      await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result, { parse_mode: 'Markdown' }).catch(async () => {
        await ctx.reply(result, { parse_mode: 'Markdown' });
      });
    } catch {
      await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, '❌ Ошибка поиска. Попробуй позже.').catch(() => {});
    }
  });

  // /tariffs
  bot.command('tariffs', async (ctx) => {
    await ctx.reply(
      `💎 *Тарифы NEXUM*\n\n` +
      `🆓 *Free* — 50 сообщений/день\nБазовый AI, память, задачи\n\n` +
      `⚡ *Middle* — 200 сообщений/день\n+ Напоминания, голос, Mini Apps, навыки\n\n` +
      `💎 *Pro* — без ограничений\n+ PC Агент, свои API ключи, приоритетные модели, профиль\n\n` +
      `📩 Подключить: @nexum_support`,
      { parse_mode: 'Markdown' }
    );
  });

  // /lang
  bot.command('lang', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const lang = ctx.message?.text?.replace('/lang', '').trim() || '';
    if (!lang || !['ru', 'en'].includes(lang)) {
      await ctx.reply('🌍 Использование: `/lang ru` или `/lang en`', { parse_mode: 'Markdown' });
      return;
    }
    db.prepare('UPDATE users SET lang=? WHERE uid=?').run(lang, uid);
    await ctx.reply(lang === 'ru' ? '✅ Язык: **Русский**' : '✅ Language: **English**', { parse_mode: 'Markdown' });
  });

  // /memory — долгосрочная память
  bot.command('memory', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const { KnowledgeGraph } = await import('../core/memory/knowledge_graph');
    const { LongTermMemory } = await import('../core/evolution_memory/long_term_memory');
    const facts = KnowledgeGraph.listFacts(uid);
    const ltm = db.prepare('SELECT compressed_summary, total_messages FROM long_term_memory WHERE uid=?').get(uid) as any;

    let text = `🧠 *Память NEXUM о тебе*\n\n`;
    if (ltm?.total_messages) text += `📊 Всего взаимодействий: *${ltm.total_messages}*\n\n`;
    if (ltm?.compressed_summary) {
      text += `📖 *История (сводка):*\n${ltm.compressed_summary.slice(0, 400)}...\n\n`;
    }
    if (facts.length) {
      text += `🔹 *Известные факты:*\n` + facts.slice(0, 10).map((f: any) => `• *${f.key}*: ${f.value}`).join('\n');
    } else {
      text += 'Фактов пока нет. Расскажи мне о себе!';
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // /forget — очистить память
  bot.command('forget', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    db.prepare('DELETE FROM memory WHERE uid=?').run(uid);
    db.prepare('DELETE FROM persistent_facts WHERE uid=?').run(uid);
    db.prepare('DELETE FROM long_term_memory WHERE uid=?').run(uid);
    db.prepare('DELETE FROM user_insights WHERE uid=?').run(uid);
    await ctx.reply('🗑 *Вся память очищена.*', { parse_mode: 'Markdown' });
  });

  // /new — сброс сессии
  bot.command('new', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    db.prepare('DELETE FROM sessions WHERE uid=?').run(uid);
    await ctx.reply('🔄 *Сессия сброшена.* Начинаем с чистого листа!', { parse_mode: 'Markdown' });
  });

  // /apps — Mini Apps
  bot.command('apps', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const { CONFIG } = await import('../core/config');
    const { InlineKeyboard } = await import('grammy');
    const base = CONFIG.WEBAPP_URL || 'https://nexum.railway.app';
    const keyboard = new InlineKeyboard()
      .webApp('✅ Задачи',    `${base}/tasks.html?uid=${uid}`)
      .webApp('💰 Финансы',   `${base}/finance.html?uid=${uid}`)
      .row()
      .webApp('📝 Заметки',   `${base}/notes.html?uid=${uid}`)
      .webApp('📅 Календарь', `${base}/calendar.html?uid=${uid}`)
      .row()
      .webApp('💪 Привычки',  `${base}/habits.html?uid=${uid}`)
      .webApp('📇 Контакты',  `${base}/contacts.html?uid=${uid}`)
      .row()
      .webApp('⚙️ Настройки', `${base}/settings.html?uid=${uid}`);
    await ctx.reply('📱 *NEXUM Mini Apps*\n\nВыбери приложение:', { parse_mode: 'Markdown', reply_markup: keyboard });
  });

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
