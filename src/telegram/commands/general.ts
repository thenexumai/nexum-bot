import { Bot } from 'grammy';
import { getOrCreateUser, incrementMsgCount } from '../../core/db';
import { getUserPlan, getPlanInfo, canUseFeature } from '../../core/billing';
import { getPreferences, setLang, setPreference } from '../../core/preferences';
import { clearSession } from '../../agent/executor';
import { webSearch } from '../../tools/search';
import t from '../../i18n';
import db from '../../core/db';

export function setupGeneralCommands(bot: Bot) {

  bot.command('start', async (ctx) => {
    const uid = ctx.from!.id;
    getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name);
    const prefs = getPreferences(uid);
    const name = ctx.from?.first_name ?? 'User';
    await ctx.reply(t(prefs.lang, 'welcome', { name }), { parse_mode: 'Markdown' });
  });

  bot.command('help', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const plan  = getUserPlan(uid);
    const lang  = prefs.lang;

    let msg = t(lang, 'help_header') + t(lang, 'help_general');
    if (plan === 'middle' || plan === 'pro') msg += t(lang, 'help_middle');
    if (plan === 'pro') msg += t(lang, 'help_pro');
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.command('status', async (ctx) => {
    const uid   = ctx.from!.id;
    const user  = getOrCreateUser(uid, ctx.from?.username, ctx.from?.first_name) as Record<string, unknown>;
    const prefs = getPreferences(uid);
    const plan  = getUserPlan(uid);
    const info  = getPlanInfo(plan);
    const lang  = prefs.lang;

    const count  = (user.msg_count_today as number) ?? 0;
    const expires = (user.subscription_expires_at as string) ?? (lang === 'ru' ? 'нет' : 'none');

    await ctx.reply(t(lang, 'status_msg', {
      name:    ctx.from?.first_name ?? 'User',
      plan:    info.name,
      count:   count,
      limit:   info.dailyLimit,
      lang:    prefs.lang.toUpperCase(),
      expires: expires,
    }), { parse_mode: 'Markdown' });
  });

  bot.command('new', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    clearSession(uid);
    await ctx.reply(t(prefs.lang, 'session_reset'));
  });

  bot.command('tariffs', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    await ctx.reply(t(prefs.lang, 'tariffs'), { parse_mode: 'Markdown' });
  });

  bot.command('search', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const query = ctx.match?.trim();
    if (!query) { await ctx.reply('Usage: /search <query>'); return; }

    const msg = await ctx.reply(t(prefs.lang, 'searching'));
    try {
      const results = await webSearch(query);
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, results, { parse_mode: 'Markdown' })
        .catch(() => ctx.reply(results, { parse_mode: 'Markdown' }));
    } catch {
      await ctx.reply('❌ Search failed');
    }
  });

  bot.command('remind', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'reminders')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }

    const parts = ctx.match?.trim().split(/\s+/) ?? [];
    const minutes = parseInt(parts[parts.length - 1]);
    if (isNaN(minutes) || parts.length < 2) {
      await ctx.reply(lang === 'ru'
        ? 'Формат: /remind Текст напоминания 30 (минут)'
        : 'Format: /remind Reminder text 30 (minutes)');
      return;
    }
    const text = parts.slice(0, -1).join(' ');
    const fireAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reminders (chat_id, text, fire_at) VALUES (?, ?, ?)').run(ctx.chat.id, text, fireAt);
    await ctx.reply(t(lang, 'reminder_set') + ` (${minutes}m)`);
  });

  bot.command('reminders', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'reminders')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }

    const rows = db.prepare(
      "SELECT * FROM reminders WHERE chat_id = ? AND done = 0 ORDER BY fire_at ASC LIMIT 10"
    ).all(ctx.chat.id) as { id: number; text: string; fire_at: string }[];

    if (!rows.length) {
      await ctx.reply(lang === 'ru' ? '📭 Нет активных напоминаний' : '📭 No active reminders');
      return;
    }
    const list = rows.map((r, i) =>
      `${i + 1}. ⏰ ${r.text} — ${new Date(r.fire_at).toLocaleString()}`
    ).join('\n');
    await ctx.reply(list);
  });

  bot.command('memory', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'memory')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }
    const rows = db.prepare("SELECT key, value FROM memory WHERE uid = ? AND key != 'preferences' LIMIT 20").all(uid) as
      { key: string; value: string }[];
    if (!rows.length) {
      await ctx.reply(lang === 'ru' ? '🧠 Память пуста' : '🧠 Memory is empty'); return;
    }
    const mem = rows.map(r => `• *${r.key}*: ${r.value}`).join('\n');
    await ctx.reply(mem, { parse_mode: 'Markdown' });
  });

  bot.command('forget', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'memory')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }
    db.prepare("DELETE FROM memory WHERE uid = ? AND key != 'preferences'").run(uid);
    await ctx.reply(t(lang, 'memory_cleared'));
  });

  bot.command('voice', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'voice')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }
    const newVal = !prefs.voiceMode;
    setPreference(uid, 'voiceMode', newVal);
    await ctx.reply(t(lang, newVal ? 'voice_on' : 'voice_off'));
  });

  bot.command('lang', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = ctx.match?.trim().toLowerCase() as 'ru' | 'en' | undefined;
    if (lang !== 'ru' && lang !== 'en') {
      await ctx.reply('🌍 /lang ru  |  /lang en'); return;
    }
    setLang(uid, lang);
    await ctx.reply(t(lang, 'lang_changed'));
  });

  bot.command('apps', async (ctx) => {
    const uid  = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'mini_apps')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'Middle' })); return;
    }
    const baseUrl = process.env.APP_URL ?? 'https://your-app.railway.app';
    await ctx.reply(`📱 *NEXUM Mini Apps*\n\n` +
      `💰 [Finance](${baseUrl}/app/finance)\n` +
      `✅ [Tasks](${baseUrl}/app/tasks)\n` +
      `📝 [Notes](${baseUrl}/app/notes)\n` +
      `📅 [Calendar](${baseUrl}/app/calendar)\n` +
      `📇 [Contacts](${baseUrl}/app/contacts)\n` +
      `💪 [Habits](${baseUrl}/app/habits)\n` +
      `⚙️ [Settings](${baseUrl}/app/settings)`,
      { parse_mode: 'Markdown' });
  });
}
