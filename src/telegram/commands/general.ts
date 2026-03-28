import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config, isAdmin } from '../../core/config';
import { db, ensureUser } from '../../core/db';
import { getTariffConfig, requireFeature, getUpgradeMessage } from '../../core/billing';
import { clearHistory, getMemories, clearMemory } from '../../agent/memory';
import { execute } from '../../agent/executor';
import { webSearch } from '../../tools/search';
import { getUserVoicePref, setUserVoicePref } from '../../tools/tts';
import { streamReply } from '../handler';
import { isDeviceOnline } from '../../agent/pairing';
import { truncateTelegram, formatPlanTable, getLocalizedUpgradeMessage } from '../../agent/persona';
import { t, detectLang, setUserLang, getUserLang } from '../../i18n/index';

export const DM_COMMANDS = [
  { command: 'start',      description: 'Start NEXUM' },
  { command: 'help',       description: 'All commands' },
  { command: 'status',     description: 'Your account & usage' },
  { command: 'new',        description: 'Start fresh conversation' },
  { command: 'memory',     description: 'What I remember about you' },
  { command: 'forget',     description: 'Clear memory & history' },
  { command: 'mystats',    description: 'Your statistics' },
  { command: 'tariffs',    description: 'Plans & pricing' },
  { command: 'lang',       description: 'Change language' },
  { command: 'settings',   description: 'Settings' },
  { command: 'apps',       description: 'Mini-apps' },
  { command: 'finance',    description: 'Finance tracker' },
  { command: 'tasks',      description: 'Task manager' },
  { command: 'notes',      description: 'Notes' },
  { command: 'habits',     description: 'Habit tracker' },
  { command: 'calendar',   description: 'Calendar' },
  { command: 'contacts',   description: 'Contacts' },
  { command: 'search',     description: 'Web search' },
  { command: 'remind',     description: 'Set a reminder' },
  { command: 'voice',      description: 'Toggle voice responses' },
  { command: 'setkey',     description: 'Add API key (BYOK)' },
  { command: 'mykeys',     description: 'Your API keys' },
  { command: 'link',       description: 'Pair your PC (Pro)' },
  { command: 'devices',    description: 'Paired devices' },
  { command: 'pc',         description: 'PC Agent status' },
  { command: 'run',        description: 'Run shell command (Pro)' },
  { command: 'screenshot', description: 'Take screenshot (Pro)' },
  { command: 'bgrun',      description: 'Background AI task (Pro)' },
  { command: 'bglist',     description: 'Background task list' },
];

export const GROUP_COMMANDS = [
  { command: 'help',   description: 'Help' },
  { command: 'status', description: 'Status' },
  { command: 'search', description: 'Web search' },
];

export function registerGeneralCommands(bot: Bot): void {

  // /start — detect language and save
  bot.command('start', async (ctx: Context) => {
    const uid  = ctx.from?.id ?? 0;
    const name = ctx.from?.first_name ?? '';
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    // Detect and save language
    const detectedLang = detectLang(ctx);
    setUserLang(uid, detectedLang);

    const msg = name
      ? t(uid, 'welcome', { name })
      : t(uid, 'welcome.anon');

    const kb = config.webappUrl
      ? new InlineKeyboard().webApp(t(uid, 'apps.open'), config.webappUrl)
      : undefined;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...(kb ? { reply_markup: kb } : {}) });
  });

  // /help
  bot.command('help', async (ctx: Context) => {
    const uid     = ctx.from?.id ?? 0;
    const inGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (inGroup) {
      const info = await bot.api.getMe();
      await ctx.reply(t(uid, 'help.group', { username: info.username ?? '' }));
      return;
    }

    const lines = DM_COMMANDS.map(c => `/${c.command} — ${c.description}`).join('\n');
    const adminLine = isAdmin(uid) ? `\n\n${t(uid, 'help.admin')}` : '';
    await ctx.reply(`${t(uid, 'help.title')}\n\n${lines}${adminLine}`, { parse_mode: 'Markdown' });
  });

  // /status
  bot.command('status', async (ctx: Context) => {
    const uid    = ctx.from?.id ?? 0;
    const tariff = getTariffConfig(uid);
    const today  = new Date().toISOString().split('T')[0];
    const total  = (db.prepare('SELECT COUNT(*) AS c FROM conversations WHERE uid=?').get(uid) as { c: number }).c;
    const todayN = (db.prepare(`SELECT COUNT(*) AS c FROM conversations WHERE uid=? AND date(created_at)=? AND role='user'`).get(uid, today) as { c: number }).c;
    const memN   = (db.prepare('SELECT COUNT(*) AS c FROM memory WHERE uid=?').get(uid) as { c: number }).c;
    const limit  = tariff.dailyMessageLimit !== null ? `${todayN}/${tariff.dailyMessageLimit}` : '∞';
    const online = isDeviceOnline(uid);

    const providers = (Object.entries(config.ai) as [string, readonly string[]][])
      .filter(([, k]) => k.length).map(([p, k]) => `${p}(${k.length})`).join(', ') || t(uid, 'common.none');

    const memoryValue = tariff.hasMemory
      ? t(uid, 'status.memory.facts', { count: String(memN) })
      : `❌ ${t(uid, 'status.memory.locked')}`;

    const pcValue = tariff.hasPcAgent
      ? (online ? `🟢 ${t(uid, 'status.pc_online')}` : `⚫ ${t(uid, 'status.pc_offline')}`)
      : '❌';

    await ctx.reply(truncateTelegram(
      `${t(uid, 'status.title')}\n\n` +
      `${t(uid, 'status.plan', { plan: tariff.plan.toUpperCase(), price: String(tariff.priceUsd) })}\n` +
      `${t(uid, 'status.messages_today', { count: limit })}\n` +
      `${t(uid, 'status.total_messages', { total: String(total) })}\n` +
      `${t(uid, 'status.memory', { value: memoryValue })}\n` +
      `${t(uid, 'status.mini_apps', { value: tariff.hasMiniApps ? '✅' : '❌' })}\n` +
      `${t(uid, 'status.byok', { value: tariff.hasBYOK ? '✅' : '❌' })}\n` +
      `${t(uid, 'status.pc_agent', { value: pcValue })}\n\n` +
      `${t(uid, 'status.providers', { value: providers })}\n\n` +
      (isAdmin(uid) ? `🔑 ${t(uid, 'status.admin')}\n\n` : '') +
      t(uid, 'status.upgrade')
    ), { parse_mode: 'Markdown' });
  });

  // /new
  bot.command('new', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    clearHistory(uid);
    await ctx.reply(`✨ ${t(uid, 'new.done')}`);
  });

  // /memory
  bot.command('memory', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasMemory', 'Memory');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const mems = getMemories(uid);
    if (!mems.length) { await ctx.reply(t(uid, 'memory.empty')); return; }
    await ctx.reply(
      `${t(uid, 'memory.title')}\n\n${mems.map(m => `• *${m.key}:* ${m.value}`).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /forget
  bot.command('forget', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    clearMemory(uid);
    clearHistory(uid);
    await ctx.reply(t(uid, 'forget.done'));
  });

  // /mystats
  bot.command('mystats', async (ctx: Context) => {
    const uid  = ctx.from?.id ?? 0;
    const get  = (q: string) => (db.prepare(q).get(uid) as { c: number }).c;
    const user = db.prepare('SELECT created_at FROM users WHERE uid=?').get(uid) as { created_at: string } | undefined;

    await ctx.reply(truncateTelegram(
      `${t(uid, 'mystats.title')}\n\n` +
      `${t(uid, 'mystats.messages', { count: String(get('SELECT COUNT(*) AS c FROM conversations WHERE uid=?')) })}\n` +
      `${t(uid, 'mystats.notes', { count: String(get('SELECT COUNT(*) AS c FROM notes WHERE uid=?')) })}\n` +
      `${t(uid, 'mystats.tasks', { count: String(get("SELECT COUNT(*) AS c FROM tasks WHERE uid=? AND status!='done'")) })}\n` +
      `${t(uid, 'mystats.finance', { count: String(get('SELECT COUNT(*) AS c FROM finance WHERE uid=?')) })}\n` +
      `${t(uid, 'mystats.habits', { count: String(get('SELECT COUNT(*) AS c FROM habits WHERE uid=?')) })}\n` +
      `${t(uid, 'mystats.member_since', { date: user?.created_at?.split('T')[0] ?? '?' })}`
    ), { parse_mode: 'Markdown' });
  });

  // /tariffs
  bot.command('tariffs', async (ctx: Context) => {
    const uid    = ctx.from?.id ?? 0;
    const tariff = getTariffConfig(uid);
    await ctx.reply(
      `${formatPlanTable(uid)}\n\n${t(uid, 'tariffs.current', { plan: tariff.plan.toUpperCase() })}\n\n${getLocalizedUpgradeMessage(uid, tariff.plan)}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /lang — language selection
  bot.command('lang', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    const kb = new InlineKeyboard()
      .text('🇬🇧 English', 'lang:en')
      .text('🇷🇺 Русский', 'lang:ru');

    await ctx.reply(t(uid, 'lang.title') + '\n\n' + t(uid, 'lang.prompt'), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // /settings
  bot.command('settings', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (config.webappUrl) {
      const kb = new InlineKeyboard().webApp(t(uid, 'settings.open'), `${config.webappUrl}/settings?uid=${uid}`);
      await ctx.reply(t(uid, 'settings.title'), { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      // Fallback: inline keyboard with options
      const kb = new InlineKeyboard()
        .text('🇬🇧/🇷🇺 ' + t(uid, 'apps.settings'), 'lang:pick')
        .row();
      await ctx.reply(t(uid, 'settings.title'), { parse_mode: 'Markdown', reply_markup: kb });
    }
  });

  // /search
  bot.command('search', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const query = (ctx.message?.text ?? '').replace('/search', '').trim();
    if (!query) { await ctx.reply(t(uid, 'search.usage')); return; }

    await ctx.replyWithChatAction('typing');
    const results = await webSearch(query);
    if (!results) { await ctx.reply(t(uid, 'search.unavailable')); return; }

    const response = await execute(uid, `Search: "${query}"\n\n${results}\n\nSummarize briefly.`, { skipLimitCheck: true });
    await streamReply(ctx, response);
  });

  // /remind
  bot.command('remind', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const parts = (ctx.message?.text ?? '').split(' ');
    const last  = parts[parts.length - 1];
    const mins  = parseInt(last, 10);
    const hasM  = !isNaN(mins) && mins > 0;
    const text  = hasM ? parts.slice(1, -1).join(' ') : parts.slice(1).join(' ');

    if (!text) {
      await ctx.reply(t(uid, 'remind.usage'), { parse_mode: 'Markdown' });
      return;
    }

    const delay  = hasM ? mins : 60;
    const fireAt = new Date(Date.now() + delay * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`INSERT INTO reminders (uid, chat_id, text, fire_at) VALUES (?, ?, ?, ?)`).run(uid, ctx.chat?.id, text, fireAt);
    await ctx.reply(`✅ ${t(uid, 'remind.set', { minutes: String(delay), text })}`, { parse_mode: 'Markdown' });
  });

  // /voice
  bot.command('voice', async (ctx: Context) => {
    const uid  = ctx.from?.id ?? 0;
    const pref = getUserVoicePref(uid);
    const next = pref.voice === 'off' ? 'alloy' : 'off';
    setUserVoicePref(uid, { voice: next });
    if (next === 'off') {
      await ctx.reply(t(uid, 'voice.off'));
    } else {
      await ctx.reply(`🔊 ${t(uid, 'voice.on', { voice: 'Alloy' })}`);
    }
  });

  // ── Callback query handlers ────────────────────────────────────────────────

  // Language selection
  bot.callbackQuery(/^lang:(en|ru)$/, async (ctx) => {
    const uid  = ctx.from?.id ?? 0;
    const lang = ctx.match[1] as 'en' | 'ru';
    setUserLang(uid, lang);
    await ctx.answerCallbackQuery(lang === 'en' ? 'English' : 'Русский');
    await ctx.editMessageText(t(uid, 'lang.set'), { parse_mode: 'Markdown' }).catch(() => {});
  });

  // Language picker (from /settings fallback)
  bot.callbackQuery('lang:pick', async (ctx) => {
    const uid = ctx.from?.id ?? 0;
    const kb = new InlineKeyboard()
      .text('🇬🇧 English', 'lang:en')
      .text('🇷🇺 Русский', 'lang:ru');
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(uid, 'lang.title') + '\n\n' + t(uid, 'lang.prompt'), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    }).catch(() => {});
  });
}
