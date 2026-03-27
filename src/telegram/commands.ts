// NEXUM Commands — full command suite

import { Bot, Context, InlineKeyboard } from 'grammy';
import { config } from '../core/config';
import { db, ensureUser, setUserApiKey, deleteUserApiKey } from '../core/db';
import { getTariffConfig, setUserTariff, getUpgradeMessage, hasFeature, requireFeature, TariffPlan } from '../core/billing';
import { clearHistory, getMemories, clearMemory, saveMemory } from '../agent/memory';
import { execute, runSubagent, listSubagents, getSubagentResult } from '../agent/executor';
import { webSearch } from '../tools/search';
import { VOICES, getUserVoicePref, setUserVoicePref } from '../tools/tts';
import { streamReply } from './handler';
import { generateLinkCode, isAgentOnline, listDevices, getAgent } from '../agent/pairing';
import { sendCommand, isConnected } from '../agent/pcagent_protocol';

function isAdmin(uid: number) { return config.adminIds.includes(uid); }

// ── Command registry ──────────────────────────────────────────────────────────
// Single source of truth — used for both setMyCommands and /help

const DM_COMMANDS = [
  { command: 'start',      description: 'Start NEXUM' },
  { command: 'help',       description: 'All commands' },
  { command: 'status',     description: 'Your status & usage' },
  { command: 'new',        description: 'New conversation' },
  { command: 'memory',     description: 'What I remember about you' },
  { command: 'forget',     description: 'Clear memory' },
  { command: 'mystats',    description: 'Your statistics' },
  { command: 'tariffs',    description: 'Plans (Free/Middle/Pro)' },
  { command: 'apps',       description: 'Mini-apps menu' },
  { command: 'finance',    description: 'Finance tracker' },
  { command: 'tasks',      description: 'Task manager' },
  { command: 'notes',      description: 'Notes' },
  { command: 'habits',     description: 'Habit tracker' },
  { command: 'calendar',   description: 'Calendar' },
  { command: 'contacts',   description: 'Contacts' },
  { command: 'search',     description: 'Web search' },
  { command: 'remind',     description: 'Set a reminder' },
  { command: 'voice',      description: 'Toggle voice mode' },
  { command: 'setkey',     description: 'Add your API key (BYOK)' },
  { command: 'mykeys',     description: 'Your saved API keys' },
  { command: 'link',       description: 'Pair your PC (Pro)' },
  { command: 'devices',    description: 'Paired devices (Pro)' },
  { command: 'pc',         description: 'PC Agent status (Pro)' },
  { command: 'run',        description: 'Run shell command (Pro)' },
  { command: 'screenshot', description: 'Take screenshot (Pro)' },
  { command: 'bgrun',      description: 'Background AI task (Pro)' },
  { command: 'bglist',     description: 'Background task list (Pro)' },
];

const GROUP_COMMANDS = [
  { command: 'help',   description: 'Help' },
  { command: 'status', description: 'Status' },
  { command: 'search', description: 'Web search' },
];

export function setupCommands(bot: Bot): void {
  // Register menus
  bot.api.setMyCommands(DM_COMMANDS, { scope: { type: 'all_private_chats' } }).catch(() => {});
  bot.api.setMyCommands(GROUP_COMMANDS, { scope: { type: 'all_group_chats' } }).catch(() => {});

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const name = ctx.from?.first_name || '';
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    const adminNote = isAdmin(uid) ? '\n\n🔑 Admin access enabled.' : '';
    const greeting = name ? `Hey ${name}! ` : '';

    const kb = config.webappUrl
      ? new InlineKeyboard().webApp('Open Apps', config.webappUrl)
      : undefined;

    await ctx.reply(
      `${greeting}I'm *NEXUM* — your personal AI superagent.\n\nJust write anything, or use commands below.${adminNote}`,
      { parse_mode: 'Markdown', ...(kb ? { reply_markup: kb } : {}) }
    );
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const inGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (inGroup) {
      const info = await bot.api.getMe();
      await ctx.reply(`Mention @${info.username} or reply to my messages to chat.\n\n/search [query] — web search\n/status — status`);
      return;
    }

    const adminSection = isAdmin(uid)
      ? '\n\n*Admin:* /admin\\_stats /broadcast /approve'
      : '';

    const lines = DM_COMMANDS.map(c => `/${c.command} — ${c.description}`).join('\n');
    await ctx.reply(`*NEXUM Commands*\n\n${lines}${adminSection}`, { parse_mode: 'Markdown' });
  });

  // ── /status ───────────────────────────────────────────────────────────────
  bot.command('status', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tariff = getTariffConfig(uid);
    const providers = Object.entries(config.ai)
      .filter(([, k]) => k.length)
      .map(([p, k]) => `${p}(${k.length})`)
      .join(', ');
    const online = isAgentOnline(uid);
    const memCount = getMemories(uid).length;
    const msgCount = (db as any).prepare(
      'SELECT COUNT(*) as c FROM conversations WHERE uid=?'
    ).get(uid) as any;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = (db as any).prepare(
      `SELECT COUNT(*) as c FROM conversations WHERE uid=? AND date(created_at)=? AND role='user'`
    ).get(uid, today) as any;

    const limit = tariff.dailyMessageLimit !== null
      ? `${todayCount?.c || 0}/${tariff.dailyMessageLimit}`
      : '∞';

    await ctx.reply(
      `*NEXUM Status*\n\n` +
      `Plan: *${tariff.plan.toUpperCase()}* ($${tariff.priceUsd}/mo)\n` +
      `Messages today: ${limit}\n` +
      `Total messages: ${msgCount?.c || 0}\n` +
      `Memory: ${tariff.hasMemory ? `${memCount} facts` : '❌ (Middle/Pro)'}\n` +
      `Mini-apps: ${tariff.hasMiniApps ? '✅' : '❌'}\n` +
      `BYOK: ${tariff.hasBYOK ? '✅' : '❌'}\n` +
      `PC Agent: ${tariff.hasPcAgent ? (online ? '🟢 online' : '⚫ offline') : '❌'}\n\n` +
      `AI Providers: ${providers || 'none'}\n\n` +
      `/tariffs — upgrade`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /new ──────────────────────────────────────────────────────────────────
  bot.command('new', async (ctx: Context) => {
    clearHistory(ctx.from?.id || 0);
    await ctx.reply('New conversation started. ✨');
  });

  // ── /memory ───────────────────────────────────────────────────────────────
  bot.command('memory', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasMemory', 'Memory');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const mems = getMemories(uid);
    if (!mems.length) { await ctx.reply('Nothing saved yet. I learn from our conversations.'); return; }
    await ctx.reply(
      `*What I remember about you:*\n\n${mems.map(m => `• *${m.key}:* ${m.value}`).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /forget ───────────────────────────────────────────────────────────────
  bot.command('forget', async (ctx: Context) => {
    clearMemory(ctx.from?.id || 0);
    clearHistory(ctx.from?.id || 0);
    await ctx.reply('Memory and history cleared. Fresh start.');
  });

  // ── /mystats ──────────────────────────────────────────────────────────────
  bot.command('mystats', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const msgs   = (db as any).prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any;
    const notes  = (db as any).prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any;
    const tasks  = (db as any).prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any;
    const fin    = (db as any).prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any;
    const habits = (db as any).prepare('SELECT COUNT(*) as c FROM habits WHERE uid=?').get(uid) as any;
    const user   = (db as any).prepare('SELECT created_at FROM users WHERE uid=?').get(uid) as any;

    await ctx.reply(
      `*Your Stats*\n\n` +
      `Messages: ${msgs?.c || 0}\n` +
      `Notes: ${notes?.c || 0}\n` +
      `Active tasks: ${tasks?.c || 0}\n` +
      `Finance entries: ${fin?.c || 0}\n` +
      `Habits: ${habits?.c || 0}\n` +
      `Member since: ${user?.created_at?.split('T')[0] || '?'}` +
      (isAdmin(uid) ? '\n\nRole: Admin 🔑' : ''),
      { parse_mode: 'Markdown' }
    );
  });

  // ── /tariffs ──────────────────────────────────────────────────────────────
  bot.command('tariffs', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tariff = getTariffConfig(uid);

    await ctx.reply(
      `📊 *Tariff Plans*\n\n` +
      `*Free* — $0/mo\n• 70 messages/day\n• No memory\n• No mini-apps\n\n` +
      `*Middle* — $9/mo\n• 300 messages/day\n• Long-term memory\n• All mini-apps\n\n` +
      `*Pro* — $15/mo\n• Unlimited (BYOK)\n• Memory + mini-apps\n• PC Agent\n• Background tasks\n\n` +
      `Your current plan: *${tariff.plan.toUpperCase()}*\n\n` +
      getUpgradeMessage(tariff.plan),
      { parse_mode: 'Markdown' }
    );
  });

  // ── /setkey ───────────────────────────────────────────────────────────────
  bot.command('setkey', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    if (!args || args.length < 3) {
      await ctx.reply(
        'Usage: `/setkey [provider] [key]`\n\nProviders: cerebras, groq, gemini, deepseek, claude, openrouter, grok',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    setUserApiKey(uid, args[1].toLowerCase(), args[2]);
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(`✅ Key for *${args[1]}* saved.`, { parse_mode: 'Markdown' });
  });

  // ── /mykeys ───────────────────────────────────────────────────────────────
  bot.command('mykeys', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const keys = (db as any).prepare(
      `SELECT provider, substr(api_key,1,8)||'…' as k FROM user_api_keys WHERE uid=?`
    ).all(uid) as any[];
    if (!keys?.length) {
      await ctx.reply('No personal keys saved.\n\nUse `/setkey [provider] [key]` to add one.', { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply(
      `*Your API Keys:*\n\n${keys.map(k => `• *${k.provider}:* ${k.k}`).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /apps ─────────────────────────────────────────────────────────────────
  bot.command('apps', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!config.webappUrl) { await ctx.reply('Mini-apps are not configured (WEBAPP_URL missing).'); return; }
    const check = requireFeature(uid, 'hasMiniApps', 'Mini-apps');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const url = config.webappUrl;
    const kb = new InlineKeyboard()
      .webApp('💰 Finance', `${url}/finance`).webApp('✅ Tasks', `${url}/tasks`).row()
      .webApp('📝 Notes', `${url}/notes`).webApp('🔥 Habits', `${url}/habits`).row()
      .webApp('📅 Calendar', `${url}/calendar`).webApp('👤 Contacts', `${url}/contacts`).row()
      .webApp('🤖 Agent', `${url}/agent`).webApp('🏠 Hub', `${url}/`);
    await ctx.reply('*Mini-Apps*', { parse_mode: 'Markdown', reply_markup: kb });
  });

  // ── Individual app shortcuts ───────────────────────────────────────────────
  for (const [cmd, label, path] of [
    ['finance', '💰 Finance', '/finance'],
    ['tasks',   '✅ Tasks',   '/tasks'],
    ['notes',   '📝 Notes',   '/notes'],
    ['habits',  '🔥 Habits',  '/habits'],
    ['calendar','📅 Calendar','/calendar'],
    ['contacts','👤 Contacts','/contacts'],
  ] as Array<[string, string, string]>) {
    bot.command(cmd, async (ctx: Context) => {
      const uid = ctx.from?.id || 0;
      if (!config.webappUrl) { await ctx.reply('Mini-apps not configured.'); return; }
      const check = requireFeature(uid, 'hasMiniApps', label);
      if (!check.ok) { await ctx.reply(check.reason!); return; }
      const kb = new InlineKeyboard().webApp(`Open ${label}`, `${config.webappUrl}${path}`);
      await ctx.reply(label, { reply_markup: kb });
    });
  }

  // ── /search ───────────────────────────────────────────────────────────────
  bot.command('search', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const query = ctx.message?.text.replace('/search', '').trim();
    if (!query) { await ctx.reply('Usage: /search [query]'); return; }

    await ctx.replyWithChatAction('typing');
    const results = await webSearch(query);
    if (!results) { await ctx.reply('Search is not configured (SERPER_KEY missing) or failed.'); return; }

    const response = await execute(uid, `Search results for "${query}":\n\n${results}\n\nSummarize these results.`, { skipLimitCheck: true });
    await streamReply(ctx, response);
  });

  // ── /remind ───────────────────────────────────────────────────────────────
  bot.command('remind', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const parts = ctx.message?.text.split(' ') || [];
    // /remind [text] [minutes]
    const minutes = parseInt(parts[parts.length - 1]);
    const isValidMinutes = !isNaN(minutes) && minutes > 0;
    const text = isValidMinutes
      ? parts.slice(1, -1).join(' ')
      : parts.slice(1).join(' ');

    if (!text) {
      await ctx.reply('Usage: `/remind [text] [minutes]`\nExample: `/remind Take medicine 30`', { parse_mode: 'Markdown' });
      return;
    }

    const fireAt = new Date(Date.now() + (isValidMinutes ? minutes : 60) * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    (db as any).prepare(
      `INSERT INTO reminders (uid, chat_id, text, fire_at) VALUES (?,?,?,?)`
    ).run(uid, ctx.chat?.id, text, fireAt);

    const when = isValidMinutes ? `in ${minutes} minute${minutes !== 1 ? 's' : ''}` : 'in 1 hour';
    await ctx.reply(`✅ Reminder set for ${when}: _${text}_`, { parse_mode: 'Markdown' });
  });

  // ── /voice ────────────────────────────────────────────────────────────────
  bot.command('voice', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const pref = getUserVoicePref(uid);
    const newLang = pref.lang === 'off' ? 'en' : 'off';
    setUserVoicePref(uid, { ...pref, lang: newLang });
    await ctx.reply(newLang === 'off' ? 'Voice mode disabled.' : '🔊 Voice mode enabled.');
  });

  // ── /link ─────────────────────────────────────────────────────────────────
  bot.command('link', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const code = generateLinkCode(uid);
    await ctx.reply(
      `🖥️ *Link Your PC*\n\n` +
      `Run on your computer:\n` +
      `\`\`\`\npython nexum_agent.py --code ${code}\n\`\`\`\n\n` +
      `Code expires in 10 minutes.`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /devices ──────────────────────────────────────────────────────────────
  bot.command('devices', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const devices = listDevices(uid);
    if (!devices?.length) {
      await ctx.reply('No devices paired. Use /link to connect your PC.');
      return;
    }
    const list = devices.map(d =>
      `${d.status === 'online' ? '🟢' : '⚫'} *${d.device_name || 'Unknown'}* (${d.platform || '?'})\nLast seen: ${d.last_seen?.split('T')[0] || '?'}`
    ).join('\n\n');
    await ctx.reply(`*Paired Devices*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // ── /pc ───────────────────────────────────────────────────────────────────
  bot.command('pc', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const connected = isConnected(uid);
    const agent = getAgent(uid);
    if (!agent) {
      await ctx.reply('No PC paired. Use /link to connect your computer.');
      return;
    }
    await ctx.reply(
      `🖥️ *PC Agent*\n\n` +
      `Status: ${connected ? '🟢 Connected' : '⚫ Offline'}\n` +
      `Device: ${agent.device_name || 'Unknown'}\n` +
      `Platform: ${agent.platform || 'Unknown'}\n` +
      `Last seen: ${agent.last_seen?.replace('T', ' ').slice(0, 16) || '?'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /run ──────────────────────────────────────────────────────────────────
  bot.command('run', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const cmd = ctx.message?.text.replace('/run', '').trim();
    if (!cmd) { await ctx.reply('Usage: /run [command]'); return; }

    if (!isConnected(uid)) {
      await ctx.reply('PC Agent is offline. Use /link to connect.');
      return;
    }

    await ctx.replyWithChatAction('typing');
    try {
      const res = await sendCommand(uid, 'run_cmd', { command: cmd });
      if (!res.success) throw new Error(res.error || 'Command failed');
      const out = res.data?.output || res.data || 'Done.';
      await ctx.reply(`\`\`\`\n${String(out).slice(0, 3000)}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  // ── /screenshot ───────────────────────────────────────────────────────────
  bot.command('screenshot', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    if (!isConnected(uid)) {
      await ctx.reply('PC Agent is offline. Use /link to connect.');
      return;
    }

    await ctx.replyWithChatAction('upload_photo');
    try {
      const res = await sendCommand(uid, 'screenshot', {}, 15_000);
      if (!res.success) throw new Error(res.error || 'Screenshot failed');

      const b64 = res.data?.image;
      if (!b64) throw new Error('No image data returned');

      const buf = Buffer.from(b64, 'base64');
      await (ctx.api as any).sendPhoto(ctx.chat!.id, new Blob([buf], { type: 'image/png' }));
    } catch (e: any) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  // ── /bgrun ────────────────────────────────────────────────────────────────
  bot.command('bgrun', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasSubagents', 'Background tasks');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const task = ctx.message?.text.replace('/bgrun', '').trim();
    if (!task) { await ctx.reply('Usage: /bgrun [task description]'); return; }

    try {
      const { id } = await runSubagent(uid, task);
      await ctx.reply(`⚙️ Background task started.\nID: \`${id}\`\n\nCheck with /bglist`, { parse_mode: 'Markdown' });
    } catch (e: any) {
      await ctx.reply(`❌ ${e.message}`);
    }
  });

  // ── /bglist ───────────────────────────────────────────────────────────────
  bot.command('bglist', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const check = requireFeature(uid, 'hasSubagents', 'Background tasks');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const runs = listSubagents(uid);
    if (!runs?.length) { await ctx.reply('No background tasks yet. Use /bgrun [task]'); return; }

    const statusIcon = (s: string) => s === 'done' ? '✅' : s === 'error' ? '❌' : '⏳';
    const lines = runs.map(r =>
      `${statusIcon(r.status)} ${r.task.slice(0, 60)}${r.task.length > 60 ? '…' : ''}\n_${r.started_at?.split('T')[0]}_`
    ).join('\n\n');
    await ctx.reply(`*Background Tasks*\n\n${lines}`, { parse_mode: 'Markdown' });
  });

  // ── Admin commands ────────────────────────────────────────────────────────

  bot.command('admin_stats', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const users    = (db as any).prepare('SELECT COUNT(*) as c FROM users').get() as any;
    const msgs     = (db as any).prepare('SELECT COUNT(*) as c FROM conversations').get() as any;
    const today    = new Date().toISOString().split('T')[0];
    const active   = (db as any).prepare(`SELECT COUNT(DISTINCT uid) as c FROM conversations WHERE date(created_at)=?`).get(today) as any;
    const plans    = (db as any).prepare('SELECT tariff, COUNT(*) as c FROM users GROUP BY tariff').all() as any[];
    const planStr  = (plans || []).map((p: any) => `${p.tariff}: ${p.c}`).join(', ');

    await ctx.reply(
      `*Admin Stats*\n\n` +
      `Total users: ${users?.c || 0}\n` +
      `Messages: ${msgs?.c || 0}\n` +
      `Active today: ${active?.c || 0}\n` +
      `Plans: ${planStr || 'none'}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('broadcast', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const text = ctx.message?.text.replace('/broadcast', '').trim();
    if (!text) { await ctx.reply('Usage: /broadcast [message]'); return; }

    const users = (db as any).prepare('SELECT uid FROM users').all() as any[];
    let sent = 0, failed = 0;
    for (const u of (users || [])) {
      try { await bot.api.sendMessage(u.uid, text); sent++; } catch { failed++; }
      await new Promise(r => setTimeout(r, 50)); // rate limit
    }
    await ctx.reply(`Broadcast done. Sent: ${sent}, Failed: ${failed}`);
  });

  bot.command('approve', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const parts = ctx.message?.text.split(' ');
    if (!parts || parts.length < 3) {
      await ctx.reply('Usage: /approve [user_id] [free|middle|pro]');
      return;
    }
    const targetUid = parseInt(parts[1]);
    const plan = parts[2] as TariffPlan;
    if (!['free', 'middle', 'pro'].includes(plan)) {
      await ctx.reply('Invalid plan. Use: free, middle, pro');
      return;
    }
    setUserTariff(targetUid, plan);
    await ctx.reply(`✅ User ${targetUid} set to *${plan}*`, { parse_mode: 'Markdown' });
    await bot.api.sendMessage(targetUid, `Your plan has been updated to *${plan.toUpperCase()}*! Use /status to see your features.`).catch(() => {});
  });

  bot.command('admin_keys', async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const providers = Object.entries(config.ai)
      .filter(([, k]) => k.length)
      .map(([p, k]) => `${p}: ${k.length} key(s)`);
    const serper = config.serper.length ? `serper: ${config.serper.length} key(s)` : 'serper: none';
    await ctx.reply(`*System API Keys*\n\n${[...providers, serper].join('\n')}`, { parse_mode: 'Markdown' });
  });
}

// ── Exec approval callbacks (stub for extensibility) ─────────────────────────

export function setupExecApprovalCallbacks(bot: Bot): void {
  bot.callbackQuery(/^approve_exec_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Action approved');
  });
  bot.callbackQuery(/^deny_exec_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Action denied');
  });
}
