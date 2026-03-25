// NEXUM Commands — full command suite, separate DM vs Group menus

import { Bot, Context, InlineKeyboard } from 'grammy';
import { config } from '../core/config';
import { db, ensureUser, setUserApiKey } from '../core/db';
import { getTariffConfig, getUpgradeMessage, hasFeature, getPcAgentAccess } from '../core/billing';
import { clearHistory, getMemories, clearMemory, saveMemory } from '../agent/memory';
import { execute, runSubagent } from '../agent/executor';
import { webSearch } from '../tools/search';
import { VOICES, getUserVoicePref, setUserVoicePref } from '../tools/tts';
import { streamReply } from './handler';
import { isAgentOnline } from '../agent/pairing';

function isAdmin(uid: number) { return config.adminIds.includes(uid); }

// ── DM command list (shown in private chat) ───────────────────────────────────

const DM_COMMANDS = [
  { command: 'start',     description: 'Start' },
  { command: 'help',      description: 'All commands' },
  { command: 'clear',     description: 'Clear chat history' },
  { command: 'memory',    description: 'What I remember about you' },
  { command: 'forget',    description: 'Clear my memory' },
  { command: 'status',    description: 'System status' },
  { command: 'mystats',   description: 'Your statistics' },
  { command: 'apps',      description: 'Open mini apps' },
  { command: 'finance',   description: 'Finance tracker' },
  { command: 'notes',     description: 'Notes' },
  { command: 'tasks',     description: 'Tasks' },
  { command: 'habits',    description: 'Habits' },
  { command: 'search',    description: 'Web search' },
  { command: 'remind',    description: 'Set reminder' },
  { command: 'voice',     description: 'Toggle voice mode' },
  { command: 'setkey',    description: 'Add API key' },
  { command: 'mykeys',    description: 'My API keys' },
  { command: 'tariffs',   description: 'Tariff plans (Free/Middle/Pro)' },
  { command: 'link',      description: 'Pair your computer' },
  { command: 'devices',   description: 'Paired devices' },
  { command: 'pc',        description: 'PC agent status' },
  { command: 'run',       description: 'Run shell command' },
  { command: 'screenshot',description: 'Take screenshot' },
  { command: 'bgrun',     description: 'Background AI task' },
  { command: 'bglist',    description: 'Background tasks' },
  { command: 'sysinfo',   description: 'System info' },
];

// ── Group command list (minimal — only what makes sense in groups) ────────────

const GROUP_COMMANDS = [
  { command: 'help',    description: 'Help' },
  { command: 'status',  description: 'Status' },
  { command: 'search',  description: 'Web search' },
];

export function setupCommands(bot: Bot): void {

  // ── Register command menus ─────────────────────────────────────────────────
  // Called on bot start — sets different menus for DM vs groups
  bot.api.setMyCommands(DM_COMMANDS, { scope: { type: 'all_private_chats' } }).catch(() => {});
  bot.api.setMyCommands(GROUP_COMMANDS, { scope: { type: 'all_group_chats' } }).catch(() => {});

  // ── /start ─────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const name = ctx.from?.first_name || '';
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
    const adminNote = isAdmin(uid) ? '\n\nYou have admin access.' : '';
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Apps', config.webappUrl) : undefined;
    await ctx.reply(
      `${name ? name + '.\n\n' : ''}I\'m NEXUM — your personal AI assistant.${adminNote}\n\nJust write what you need.`,
      kb ? { reply_markup: kb } : undefined
    );
  });

  // ── /help ──────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

    if (isGroup) {
      const botInfo = await bot.api.getMe();
      await ctx.reply(`Mention me @${botInfo.username} or reply to my messages to chat.\n\n/search [query] — web search\n/status — system status`);
      return;
    }

    const adminSection = isAdmin(uid) ? '\n\nAdmin: /admin\\_stats /broadcast /admin\\_keys /admin\\_db /approve' : '';
    await ctx.reply(
      `*Commands*\n\n` +
      `/clear — clear history\n/memory — what I remember\n/forget — clear memory\n/status — status\n/mystats — your stats\n\n` +
      `/setkey [provider] [key] — add API key\n/mykeys — saved keys\n\n` +
      `/apps — mini apps\n/finance — finance\n/notes — notes\n/tasks — tasks\n/habits — habits\n\n` +
      `/search [query] — web search\n/remind [text] [min] — reminder\n/voice — voice mode\n\n` +
      `/link — pair computer\n/devices — devices\n/pc — agent status\n/run [cmd] — run command\n/screenshot — screenshot\n/bgrun [task] — background task\n/bglist — background tasks\n/sysinfo — system info${adminSection}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /status ────────────────────────────────────────────────────────────────
  bot.command('status', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const providers = Object.entries(config.ai).filter(([,k]) => k.length).map(([p,k]) => `${p}(${k.length})`).join(', ');
    const online = isAgentOnline(uid);
    const mems = getMemories(uid).length;
    const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c || 0;
    await ctx.reply(`*NEXUM Status*\n\nProviders: ${providers||'none'}\nPC Agent: ${online?'online':'offline'}\nMemory: ${mems} facts\nHistory: ${msgs} messages`, { parse_mode:'Markdown' });
  });

  // ── /clear ─────────────────────────────────────────────────────────────────
  bot.command('clear', async (ctx: Context) => {
    clearHistory(ctx.from?.id || 0);
    await ctx.reply('History cleared.');
  });

  // ── /memory ────────────────────────────────────────────────────────────────
  bot.command('memory', async (ctx: Context) => {
    const mems = getMemories(ctx.from?.id || 0);
    if (!mems.length) { await ctx.reply('No memories yet.'); return; }
    await ctx.reply(mems.map(m => `*${m.key}:* ${m.value}`).join('\n'), { parse_mode:'Markdown' });
  });

  // ── /forget ────────────────────────────────────────────────────────────────
  bot.command('forget', async (ctx: Context) => {
    clearMemory(ctx.from?.id || 0);
    await ctx.reply('Memory cleared.');
  });

  // ── /mystats ───────────────────────────────────────────────────────────────
  bot.command('mystats', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c||0;
    const notes = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any)?.c||0;
    const tasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any)?.c||0;
    const finance = (db.prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any)?.c||0;
    const user = db.prepare('SELECT created_at FROM users WHERE uid=?').get(uid) as any;
    await ctx.reply(
      `*Your Stats*\n\nMessages: ${msgs}\nNotes: ${notes}\nOpen tasks: ${tasks}\nFinance entries: ${finance}\nMember since: ${user?.created_at?.split('T')[0]||'?'}${isAdmin(uid)?'\n\nRole: Admin':''}`,
      { parse_mode:'Markdown' }
    );
  });

  // ── /setkey ────────────────────────────────────────────────────────────────
  bot.command('setkey', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    if (!args || args.length < 3) {
      await ctx.reply('Usage: `/setkey [provider] [key]`\n\nProviders: cerebras, groq, gemini, deepseek, claude, openrouter, grok', { parse_mode:'Markdown' });
      return;
    }
    setUserApiKey(uid, args[1].toLowerCase(), args[2]);
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(`Key for *${args[1]}* saved.`, { parse_mode:'Markdown' });
  });

  // ── /mykeys ────────────────────────────────────────────────────────────────
  bot.command('mykeys', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const keys = db.prepare('SELECT provider, substr(api_key,1,8)||"…" as k FROM user_api_keys WHERE uid=?').all(uid) as any[];
    if (!keys.length) { await ctx.reply('No personal keys. Use /setkey to add one.'); return; }
    await ctx.reply(keys.map(k => `*${k.provider}:* ${k.k}`).join('\n'), { parse_mode:'Markdown' });
  });

  // ── /tariffs ───────────────────────────────────────────────────────────────
  bot.command('tariffs', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tariff = getTariffConfig(uid);
    const upgradeMsg = getUpgradeMessage(tariff.plan);
    
    const kb = new InlineKeyboard()
      .url('💳 Upgrade (Middle $9)', 'https://t.me/gi_deon_bot?start=upgrade_middle')
      .url('🚀 Upgrade (Pro $15)', 'https://t.me/gi_deon_bot?start=upgrade_pro')
      .row()
      .url('ℹ️ More info', 'https://nexum-bot.com/tariffs');
    
    await ctx.reply(
      `📊 *Your Tariff: ${tariff.plan.toUpperCase()}*\n\n` +
      `• Price: $${tariff.priceUsd}/мес\n` +
      `• Messages: ${tariff.dailyMessageLimit || '∞'}/день\n` +
      `• Memory: ${tariff.hasMemory ? '✅' : '❌'}\n` +
      `• Mini Apps: ${tariff.hasMiniApps ? '✅' : '❌'}\n` +
      `• BYOK: ${tariff.hasBYOK ? '✅' : '❌'}\n` +
      `• PC Agent: ${tariff.hasPcAgent ? '✅' : '❌'}\n\n` +
      upgradeMsg,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // ── /apps ──────────────────────────────────────────────────────────────────
  bot.command('apps', async (ctx: Context) => {
    if (!config.webappUrl) { await ctx.reply('Mini apps not configured.'); return; }
    const kb = new InlineKeyboard()
      .webApp('Finance', `${config.webappUrl}/finance`).webApp('Notes', `${config.webappUrl}/notes`).row()
      .webApp('Tasks', `${config.webappUrl}/tasks`).webApp('Habits', `${config.webappUrl}/habits`).row()
      .webApp('Hub', `${config.webappUrl}/`);
    await ctx.reply('Mini Apps', { reply_markup: kb });
  });

  // ── /finance ───────────────────────────────────────────────────────────────
  bot.command('finance', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const rows = db.prepare('SELECT type,SUM(amount) as t FROM finance WHERE uid=? GROUP BY type').all(uid) as any[];
    const inc = rows.find(r => r.type==='income')?.t||0;
    const exp = rows.find(r => r.type==='expense')?.t||0;
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Finance', `${config.webappUrl}/finance`) : undefined;
    await ctx.reply(`*Finance*\n\nIncome: ${inc.toLocaleString()}\nExpenses: ${exp.toLocaleString()}\nBalance: ${(inc-exp).toLocaleString()}`, { parse_mode:'Markdown', reply_markup: kb });
  });

  // ── /notes ─────────────────────────────────────────────────────────────────
  bot.command('notes', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const notes = db.prepare('SELECT title,substr(content,1,60) as p FROM notes WHERE uid=? ORDER BY pinned DESC,updated_at DESC LIMIT 6').all(uid) as any[];
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Notes', `${config.webappUrl}/notes`) : undefined;
    if (!notes.length) { await ctx.reply('No notes yet.', { reply_markup: kb }); return; }
    await ctx.reply(notes.map(n => `*${n.title||'Untitled'}*\n${n.p}…`).join('\n\n'), { parse_mode:'Markdown', reply_markup: kb });
  });

  bot.command('note_add', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const text = ctx.message?.text.replace('/note_add','').trim();
    if (!text || !text.includes('|')) { await ctx.reply('Usage: `/note_add Title | Content`', { parse_mode:'Markdown' }); return; }
    const [title, content] = text.split('|').map(s => s.trim());
    db.prepare('INSERT INTO notes (uid,title,content) VALUES (?,?,?)').run(uid, title, content);
    await ctx.reply(`Note saved: *${title}*`, { parse_mode:'Markdown' });
  });

  // ── /tasks ─────────────────────────────────────────────────────────────────
  bot.command('tasks', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tasks = db.prepare("SELECT title,priority FROM tasks WHERE uid=? AND status!='done' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 10").all(uid) as any[];
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Tasks', `${config.webappUrl}/tasks`) : undefined;
    if (!tasks.length) { await ctx.reply('No open tasks.', { reply_markup: kb }); return; }
    await ctx.reply(tasks.map(t => `• [${t.priority[0].toUpperCase()}] ${t.title}`).join('\n'), { reply_markup: kb });
  });

  bot.command('task_add', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const title = ctx.message?.text.replace('/task_add','').trim();
    if (!title) { await ctx.reply('Usage: `/task_add Task title`', { parse_mode:'Markdown' }); return; }
    db.prepare('INSERT INTO tasks (uid,title,priority) VALUES (?,?,?)').run(uid, title, 'medium');
    await ctx.reply(`Task added: *${title}*`, { parse_mode:'Markdown' });
  });

  // ── /habits ────────────────────────────────────────────────────────────────
  bot.command('habits', async (ctx: Context) => {
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Habits', `${config.webappUrl}/habits`) : undefined;
    await ctx.reply('Habits tracker', { reply_markup: kb });
  });

  // ── /search ────────────────────────────────────────────────────────────────
  bot.command('search', async (ctx: Context) => {
    const query = ctx.message?.text.replace('/search','').trim();
    if (!query) { await ctx.reply('Usage: `/search [query]`', { parse_mode:'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    try {
      const results = await webSearch(query);
      await streamReply(ctx, results);
    } catch (e: any) { await ctx.reply(`Search failed: ${e.message}`); }
  });

  // ── /remind ────────────────────────────────────────────────────────────────
  bot.command('remind', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/remind','').trim().split(' ');
    if (!args?.length) { await ctx.reply('Usage: `/remind [text] [minutes]`', { parse_mode:'Markdown' }); return; }
    const lastArg = args[args.length-1];
    const mins = !isNaN(parseInt(lastArg)) ? parseInt(lastArg) : 30;
    const text = args.slice(0, isNaN(parseInt(lastArg)) ? undefined : -1).join(' ');
    if (!text) { await ctx.reply('Usage: `/remind Call mom 30`', { parse_mode:'Markdown' }); return; }
    const fireAt = new Date(Date.now() + mins * 60000).toISOString();
    db.prepare('INSERT INTO reminders (uid,chat_id,text,fire_at) VALUES (?,?,?,?)').run(uid, ctx.chat!.id, text, fireAt);
    await ctx.reply(`Reminder in ${mins}m: *${text}*`, { parse_mode:'Markdown' });
  });

  // ── /voice ─────────────────────────────────────────────────────────────────
  bot.command('voice', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const pref = getUserVoicePref(uid);
    if (pref.lang === 'off') { setUserVoicePref(uid, 'auto', 0); await ctx.reply('Voice mode enabled.'); }
    else { setUserVoicePref(uid, 'off', 0); await ctx.reply('Voice mode disabled.'); }
  });

  bot.command('voices', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const pref = getUserVoicePref(uid);
    const langs = Object.entries(VOICES).map(([c,v]) => `${c===pref.lang?'→':' '} ${c}: ${v.name}`).join('\n');
    await ctx.reply(`Voices:\n\n${langs}\n\nUse: \`/setvoice ru 1\``, { parse_mode:'Markdown' });
  });

  bot.command('setvoice', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    setUserVoicePref(uid, args?.[1]||'auto', parseInt(args?.[2]||'0')||0);
    await ctx.reply(`Voice: ${args?.[1]||'auto'} #${args?.[2]||'0'}`);
  });

  // ── PC Agent commands ──────────────────────────────────────────────────────

  bot.command('link', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const { generatePairingCode } = await import('../agent/pairing');
    const code = generatePairingCode(uid);
    await ctx.reply(`*Link Your Computer*\n\nPairing code: \`${code}\`\n\nRun nexum_agent.py and enter this code.\nExpires in 10 minutes.`, { parse_mode:'Markdown' });
  });

  bot.command('devices', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const { getPairedAgents } = await import('../agent/pairing');
    const agents = getPairedAgents(uid);
    if (!agents.length) { await ctx.reply('No devices paired. Use /link.'); return; }
    await ctx.reply(`*Devices:*\n\n${agents.map((a,i) => `${i+1}. ${a}`).join('\n')}`, { parse_mode:'Markdown' });
  });

  bot.command('pc', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const online = isAgentOnline(uid);
    const agent = db.prepare('SELECT device_name,platform,last_seen FROM pc_agents WHERE uid=?').get(uid) as any;
    if (!agent) { await ctx.reply('No PC agent paired. Use /link.'); return; }
    await ctx.reply(`*PC Agent*\n\nDevice: ${agent.device_name||'?'}\nPlatform: ${agent.platform||'?'}\nStatus: ${online?'online':'offline'}\nLast seen: ${agent.last_seen||'never'}`, { parse_mode:'Markdown' });
  });

  // Generic PC command relay via WebSocket
  async function relayToAgent(uid: number, cmd: object): Promise<string> {
    const serverApp = (global as any).__nexumApp;
    if (!serverApp?.sendToAgent) return 'PC agent relay not initialized.';
    if (!isAgentOnline(uid)) return 'PC agent is offline. Run nexum_agent.py on your computer.';
    try {
      const result = await serverApp.sendToAgent(uid, cmd);
      return result?.output || result?.data || JSON.stringify(result).slice(0,2000);
    } catch (e: any) { return `Agent error: ${e.message}`; }
  }

  bot.command('run', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    // Check PC Agent access
    const pcAccess = getPcAgentAccess(uid);
    if (!pcAccess.ok) {
      await ctx.reply(`⚠️ ${pcAccess.reason}`);
      return;
    }
    const cmd = ctx.message?.text.replace('/run','').trim();
    if (!cmd) { await ctx.reply('Usage: `/run [command]`', { parse_mode:'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    const result = await relayToAgent(uid, { type:'run', command:cmd });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode:'Markdown' });
  });

  bot.command('screenshot', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    // Check PC Agent access
    const pcAccess = getPcAgentAccess(uid);
    if (!pcAccess.ok) {
      await ctx.reply(`⚠️ ${pcAccess.reason}`);
      return;
    }
    await ctx.replyWithChatAction('upload_photo');
    const result = await relayToAgent(uid, { type:'screenshot' });
    if (result.includes('SCREENSHOT_BASE64:')) {
      const imgBuf = Buffer.from(result.replace('SCREENSHOT_BASE64:',''), 'base64');
      const { InputFile } = await import('grammy');
      await ctx.replyWithPhoto(new InputFile(imgBuf, 'screenshot.jpg'));
    } else {
      await ctx.reply(result);
    }
  });

  bot.command('sysinfo', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    await ctx.replyWithChatAction('typing');
    const result = await relayToAgent(uid, { type:'sysinfo' });
    await ctx.reply(result);
  });

  bot.command('ps', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const result = await relayToAgent(uid, { type:'ps' });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode:'Markdown' });
  });

  bot.command('kill', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const target = ctx.message?.text.replace('/kill','').trim();
    if (!target) { await ctx.reply('Usage: `/kill [name or PID]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'kill', target });
    await ctx.reply(result);
  });

  bot.command('files', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/files','').trim() || 'list ~';
    const [op, ...rest] = args.split(' ');
    const result = await relayToAgent(uid, { type:'files', operation: op, path: rest.join(' ') || '~' });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode:'Markdown' });
  });

  bot.command('clipboard', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const result = await relayToAgent(uid, { type:'clipboard' });
    await ctx.reply(result);
  });

  bot.command('notify', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const msg = ctx.message?.text.replace('/notify','').trim();
    if (!msg) { await ctx.reply('Usage: `/notify [message]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'notify', message: msg });
    await ctx.reply(result);
  });

  bot.command('window', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/window','').trim();
    const [op, ...rest] = args.split(' ');
    const result = await relayToAgent(uid, { type:'window', operation: op, params: rest.join(' ') });
    await ctx.reply(result);
  });

  bot.command('mouse', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/mouse','').trim();
    const [action, x, y] = args.split(' ');
    const result = await relayToAgent(uid, { type:'mouse', action, x: parseInt(x)||0, y: parseInt(y)||0 });
    await ctx.reply(result);
  });

  bot.command('keyboard', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const text = ctx.message?.text.replace('/keyboard','').trim();
    if (!text) { await ctx.reply('Usage: `/keyboard [text]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'keyboard', text });
    await ctx.reply(result);
  });

  bot.command('hotkey', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const combo = ctx.message?.text.replace('/hotkey','').trim();
    if (!combo) { await ctx.reply('Usage: `/hotkey [Ctrl+Shift+K]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'hotkey', combo });
    await ctx.reply(result);
  });

  bot.command('network', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const result = await relayToAgent(uid, { type:'network' });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode:'Markdown' });
  });

  bot.command('browser', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const url = ctx.message?.text.replace('/browser','').trim();
    if (!url) { await ctx.reply('Usage: `/browser [url]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'browser', url });
    await ctx.reply(result);
  });

  bot.command('openapp', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const name = ctx.message?.text.replace('/openapp','').trim();
    if (!name) { await ctx.reply('Usage: `/openapp [app name]`', { parse_mode:'Markdown' }); return; }
    const result = await relayToAgent(uid, { type:'openapp', name });
    await ctx.reply(result);
  });

  bot.command('http', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/http','').trim();
    const [method, url, ...bodyParts] = args.split(' ');
    const result = await relayToAgent(uid, { type:'http', method: method||'GET', url: url||'', body: bodyParts.join(' ') });
    await ctx.reply(`\`\`\`\n${result}\n\`\`\``, { parse_mode:'Markdown' });
  });

  // ── Background tasks ────────────────────────────────────────────────────────

  bot.command('bgrun', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const task = ctx.message?.text.replace('/bgrun','').trim();
    if (!task) { await ctx.reply('Usage: `/bgrun [task description]`', { parse_mode:'Markdown' }); return; }
    const runId = await runSubagent(uid, task, bot);
    await ctx.reply(`Task [${runId}] started:\n${task.slice(0,100)}`);
  });

  bot.command('bglist', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const runs = db.prepare('SELECT id,task,status FROM subagent_runs WHERE uid=? ORDER BY started_at DESC LIMIT 10').all(uid) as any[];
    if (!runs.length) { await ctx.reply('No background tasks.'); return; }
    await ctx.reply(runs.map(r => `[${r.id}] ${r.status} — ${r.task.slice(0,40)}`).join('\n'));
  });

  // ── Website / tools ─────────────────────────────────────────────────────────

  bot.command('website', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const desc = ctx.message?.text.replace('/website','').trim();
    if (!desc) { await ctx.reply('Usage: `/website [description]`', { parse_mode:'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    try {
      const response = await execute(uid, `Generate a complete single-file HTML website for: ${desc}. Return ONLY the HTML.`);
      const html = response.match(/```html\n?([\s\S]+?)\n?```/)?.[1] || response;
      const r = db.prepare('INSERT INTO websites (uid,name,html) VALUES (?,?,?)').run(uid, desc.slice(0,30), html);
      const url = `${config.webappUrl}/site/${r.lastInsertRowid}`;
      await ctx.reply(`Website generated: ${url}`, { reply_markup: new InlineKeyboard().url('Open', url) });
    } catch (e: any) { await ctx.reply(`Failed: ${e.message}`); }
  });

  bot.command('tools', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Tools', `${config.webappUrl}/tools`) : undefined;
    await ctx.reply('Custom tools', { reply_markup: kb });
  });

  bot.command('newtool', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const desc = ctx.message?.text.replace('/newtool','').trim();
    if (!desc) { await ctx.reply('Usage: `/newtool [description]`', { parse_mode:'Markdown' }); return; }
    const name = desc.slice(0,20).replace(/\s+/g,'_').toLowerCase();
    db.prepare('INSERT INTO custom_tools (uid,name,description,trigger_pattern,code) VALUES (?,?,?,?,?)').run(uid, name, desc, name, '');
    await ctx.reply(`Tool created: *${name}*`, { parse_mode:'Markdown' });
  });

  // ── Admin commands ──────────────────────────────────────────────────────────

  bot.command('admin_stats', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c||0;
    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as any)?.c||0;
    const top = db.prepare('SELECT u.uid,u.first_name,u.username,COUNT(c.id) as msgs FROM users u LEFT JOIN conversations c ON c.uid=u.uid GROUP BY u.uid ORDER BY msgs DESC LIMIT 10').all() as any[];
    const list = top.map((u,i) => `${i+1}. ${u.first_name||u.username||u.uid} — ${u.msgs} msg`).join('\n');
    await ctx.reply(`*Admin Stats*\n\nUsers: ${userCount}\nMessages: ${msgCount}\n\n*Top 10:*\n${list}`, { parse_mode:'Markdown' });
  });

  bot.command('admin_keys', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const pools = Object.entries(config.ai).filter(([,k]) => k.length).map(([p,k]) => `${p}: ${k.length} keys`).join('\n');
    await ctx.reply(`*Key Pools:*\n\n${pools||'none'}\nSerper: ${config.serper.length} keys`, { parse_mode:'Markdown' });
  });

  bot.command('admin_db', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const tables = ['users','conversations','notes','tasks','habits','finance','reminders','websites','custom_tools','pc_agents'];
    const counts = tables.map(t => {
      const c = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any)?.c||0;
      return `${t}: ${c}`;
    }).join('\n');
    await ctx.reply(`*DB Stats:*\n\n${counts}`, { parse_mode:'Markdown' });
  });

  bot.command('admin_clear_user', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const targetId = parseInt(ctx.message?.text.split(' ')[1]||'');
    if (!targetId) { await ctx.reply('Usage: `/admin_clear_user [uid]`', { parse_mode:'Markdown' }); return; }
    db.prepare('DELETE FROM conversations WHERE uid=?').run(targetId);
    db.prepare('DELETE FROM memory WHERE uid=?').run(targetId);
    await ctx.reply(`Cleared data for ${targetId}`);
  });

  bot.command('broadcast', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const msg = ctx.message?.text.replace('/broadcast','').trim();
    if (!msg) { await ctx.reply('Usage: `/broadcast [message]`', { parse_mode:'Markdown' }); return; }
    const users = db.prepare('SELECT DISTINCT uid FROM conversations').all() as any[];
    let sent = 0, failed = 0;
    for (const user of users) {
      try { await bot.api.sendMessage(user.uid, msg); sent++; await new Promise(r => setTimeout(r, 50)); }
      catch { failed++; }
    }
    await ctx.reply(`Broadcast: ${sent} sent, ${failed} failed`);
  });

  bot.command('approve', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const args = ctx.message?.text.split(' ');
    const id = args?.[1]; const action = args?.[2]||'approve';
    if (!id) { await ctx.reply('Usage: `/approve [id] [approve|deny]`', { parse_mode:'Markdown' }); return; }
    await ctx.reply(`${action} processed for ${id}`);
  });

  // ── Callback query handler ──────────────────────────────────────────────────
  bot.on('callback_query:data', async (ctx) => {
    const uid = ctx.from?.id || 0;
    const data = ctx.callbackQuery.data;
    if (!isAdmin(uid)) { await ctx.answerCallbackQuery('Access denied.'); return; }
    if (data.startsWith('approve_') || data.startsWith('deny_')) {
      try {
        const { pendingApprovals } = await import('../apps/server');
        const id = data.replace(/^(approve|deny)_/, '');
        const pending = pendingApprovals.get(id);
        if (pending) {
          pending.resolve(data.startsWith('approve_'));
          pendingApprovals.delete(id);
          await ctx.editMessageReplyMarkup({ reply_markup: undefined });
          await ctx.answerCallbackQuery(data.startsWith('approve_') ? 'Approved' : 'Denied');
        } else { await ctx.answerCallbackQuery('Not found or expired'); }
      } catch { await ctx.answerCallbackQuery('Error'); }
    } else { await ctx.answerCallbackQuery(); }
  });
}

// ── Exec approval callback (for non-admin exec requests) ─────────────────────
export function setupExecApprovalCallbacks(bot: Bot): void {
  bot.on('callback_query:data', async (ctx) => {
    const uid = ctx.from?.id || 0;
    const data = ctx.callbackQuery.data;
    if (!data.startsWith('exec_approve_') && !data.startsWith('exec_deny_')) return;
    if (!isAdmin(uid)) { await ctx.answerCallbackQuery('Access denied.'); return; }
    const id = data.replace(/^exec_(approve|deny)_/, '');
    const approved = data.startsWith('exec_approve_');
    try {
      const { execApprovals } = await import('../agent/executor');
      const pending = execApprovals.get(id);
      if (pending) {
        pending.resolve(approved);
        execApprovals.delete(id);
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await ctx.answerCallbackQuery(approved ? '✅ Approved' : '❌ Denied');
      } else {
        await ctx.answerCallbackQuery('Request expired');
      }
    } catch { await ctx.answerCallbackQuery('Error'); }
  });
}
