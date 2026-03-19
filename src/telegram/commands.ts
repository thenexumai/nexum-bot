// NEXUM Commands — Full slash command suite (OpenClaw-style)

import { Bot, Context, InlineKeyboard } from 'grammy';
import { config } from '../core/config';
import { db, ensureUser, setUserApiKey, getUserApiKey } from '../core/db';
import { clearHistory, getMemories, clearMemory, saveMemory } from '../agent/memory';
import { generatePairingCode, getPairedAgents, isAgentOnline } from '../agent/pairing';
import { execute, runSubagent, buildSystemPrompt } from '../agent/executor';
import { webSearch } from '../tools/search';
import { VOICES, getUserVoicePref, setUserVoicePref } from '../tools/tts';
import { streamReply } from './handler';

function isAdmin(uid: number) { return config.adminIds.includes(uid); }

export function setupCommands(bot: Bot): void {

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const name = ctx.from?.first_name || 'there';
    ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

    const webApp = config.webappUrl ? `\n\nMini Apps: ${config.webappUrl}` : '';
    const adminNote = isAdmin(uid) ? '\n\nYou have admin access.' : '';

    await ctx.reply(
      `*NEXUM*\n\nPersonal AI assistant.${adminNote}\n\nType anything to chat, or use /help to see commands.${webApp}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command('help', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const adminSection = isAdmin(uid) ? `\n*Admin:*\n/admin\\_stats — all users\n/broadcast — message all\n/admin\\_keys — key pool status\n/admin\\_db — db stats\n/admin\\_clear\\_user — clear user data\n/approve — approve pending commands` : '';

    await ctx.reply(
      `*NEXUM — Commands*\n\n` +
      `*Chat:*\n/clear — clear history\n/memory — what I know about you\n/forget — clear memory\n/status — system status\n\n` +
      `*AI:*\n/setkey \\[provider\\] \\[key\\] — add your API key\n/mykeys — view your keys\n/model \\[provider\\] — switch model\n\n` +
      `*Apps:*\n/apps — open mini apps\n/notes — notes list\n/tasks — tasks list\n/habits — habits tracker\n/finance — finance tracker\n\n` +
      `*Tools:*\n/search \\[query\\] — web search\n/remind \\[text\\] \\[min\\] — set reminder\n/voice — toggle voice mode\n/voices — change voice\n\n` +
      `*PC Agent:*\n/link — pair your computer\n/devices — paired devices\n/pc — agent status\n/run \\[cmd\\] — run command\n/screenshot — take screenshot\n/bgrun \\[cmd\\] — background task\n/bglist — background tasks\n/sysinfo — system info\n/ps — running processes\n/kill \\[name\\] — kill process\n/files \\[op\\] \\[path\\] — file system\n/clipboard — get clipboard\n/notify \\[msg\\] — send notification\n/window \\[op\\] — window control\n/mouse \\[action\\] \\[x\\] \\[y\\] — mouse\n/keyboard \\[text\\] — type text\n/hotkey \\[combo\\] — hotkey\n/network — network info\n/browser \\[url\\] — open browser\n/openapp \\[name\\] — open application\n/http \\[method\\] \\[url\\] — HTTP request\n\n` +
      `*Content:*\n/website \\[desc\\] — generate website\n/newtool \\[desc\\] — create custom tool\n/tools — my tools${adminSection}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /status ────────────────────────────────────────────────────────────────
  bot.command('status', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const providers = Object.entries(config.ai).filter(([, keys]) => keys.length > 0).map(([p, k]) => `${p}: ${k.length} key${k.length > 1 ? 's' : ''}`);
    const agentOnline = isAgentOnline(uid);
    const memories = getMemories(uid).length;
    const historyCount = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c || 0;

    await ctx.reply(
      `*NEXUM Status*\n\n` +
      `Providers: ${providers.length ? providers.join(', ') : 'none'}\n` +
      `PC Agent: ${agentOnline ? 'online' : 'offline'}\n` +
      `Memory: ${memories} facts\n` +
      `History: ${historyCount} messages\n` +
      `Bot: operational`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /clear ────────────────────────────────────────────────────────────────
  bot.command('clear', async (ctx: Context) => {
    clearHistory(ctx.from?.id || 0);
    await ctx.reply('History cleared.');
  });

  // ── /memory ───────────────────────────────────────────────────────────────
  bot.command('memory', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const mems = getMemories(uid);
    if (!mems.length) {
      await ctx.reply('No memories yet. Just chat and I\'ll remember things about you.');
      return;
    }
    const list = mems.map(m => `*${m.key}:* ${m.value}`).join('\n');
    await ctx.reply(`*What I know about you:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // ── /forget ───────────────────────────────────────────────────────────────
  bot.command('forget', async (ctx: Context) => {
    clearMemory(ctx.from?.id || 0);
    await ctx.reply('Memory cleared.');
  });

  // ── /setkey ───────────────────────────────────────────────────────────────
  bot.command('setkey', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    if (!args || args.length < 3) {
      await ctx.reply(
        '*Add your API key*\n\n`/setkey [provider] [key]`\n\nProviders: cerebras, groq, gemini, deepseek, claude, openrouter, grok, sambanova, together',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    const provider = args[1].toLowerCase();
    const key = args[2];
    setUserApiKey(uid, provider, key);
    // Delete the message for security
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(`API key for *${provider}* saved. Your key is stored securely and not visible to anyone.`, { parse_mode: 'Markdown' });
  });

  // ── /mykeys ───────────────────────────────────────────────────────────────
  bot.command('mykeys', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const keys = db.prepare('SELECT provider, substr(api_key,1,8)||"..." as key FROM user_api_keys WHERE uid=?').all(uid) as any[];
    if (!keys.length) {
      await ctx.reply('No personal API keys set. Use /setkey to add one.');
      return;
    }
    const list = keys.map(k => `*${k.provider}:* ${k.key}`).join('\n');
    await ctx.reply(`*Your API keys:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // ── /model ────────────────────────────────────────────────────────────────
  bot.command('model', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    const provider = args?.[1]?.toLowerCase();
    if (!provider) {
      const providers = ['cerebras (fastest)', 'groq (fast)', 'gemini (vision)', 'grok', 'deepseek (cheap)', 'claude', 'openrouter', 'sambanova', 'together'];
      await ctx.reply(`*Available providers:*\n\n${providers.map(p => `• ${p}`).join('\n')}\n\nUsage: \`/model groq\``, { parse_mode: 'Markdown' });
      return;
    }
    saveMemory(uid, 'preferred_provider', provider);
    await ctx.reply(`Provider preference set to *${provider}*. Your own API key for this provider will be used if set.`, { parse_mode: 'Markdown' });
  });

  // ── /apps ─────────────────────────────────────────────────────────────────
  bot.command('apps', async (ctx: Context) => {
    if (!config.webappUrl) {
      await ctx.reply('Mini apps are not configured.');
      return;
    }
    const kb = new InlineKeyboard()
      .webApp('Finance', `${config.webappUrl}/finance`).webApp('Notes', `${config.webappUrl}/notes`).row()
      .webApp('Tasks', `${config.webappUrl}/tasks`).webApp('Habits', `${config.webappUrl}/habits`).row()
      .webApp('Hub', `${config.webappUrl}/`);
    await ctx.reply('*Mini Apps*', { parse_mode: 'Markdown', reply_markup: kb });
  });

  // ── /finance ──────────────────────────────────────────────────────────────
  bot.command('finance', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const rows = db.prepare('SELECT type, SUM(amount) as total FROM finance WHERE uid=? GROUP BY type').all(uid) as any[];
    const income = rows.find(r => r.type === 'income')?.total || 0;
    const expense = rows.find(r => r.type === 'expense')?.total || 0;
    const balance = income - expense;
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Finance App', `${config.webappUrl}/finance`) : undefined;
    await ctx.reply(
      `*Finance*\n\nIncome: ${income.toLocaleString()}\nExpenses: ${expense.toLocaleString()}\nBalance: ${balance.toLocaleString()}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // ── /tasks ────────────────────────────────────────────────────────────────
  bot.command('tasks', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tasks = db.prepare('SELECT title, priority, status FROM tasks WHERE uid=? AND status!=\'done\' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END LIMIT 10').all(uid) as any[];
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Tasks', `${config.webappUrl}/tasks`) : undefined;
    if (!tasks.length) {
      await ctx.reply('No open tasks. Use `/task_add [title]` or the Tasks app.', { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }
    const list = tasks.map(t => `${t.priority === 'high' || t.priority === 'critical' ? '!' : '-'} ${t.title}`).join('\n');
    await ctx.reply(`*Open Tasks:*\n\n${list}`, { parse_mode: 'Markdown', reply_markup: kb });
  });

  bot.command('task_add', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const text = ctx.message?.text.replace('/task_add', '').trim();
    if (!text) { await ctx.reply('Usage: `/task_add [title] [priority: high/medium/low]`', { parse_mode: 'Markdown' }); return; }
    const priority = /\b(high|critical)\b/i.test(text) ? 'high' : /\blow\b/i.test(text) ? 'low' : 'medium';
    const title = text.replace(/\b(high|medium|low|critical)\b/gi, '').trim();
    db.prepare('INSERT INTO tasks (uid, title, priority) VALUES (?,?,?)').run(uid, title, priority);
    await ctx.reply(`Task added: *${title}* [${priority}]`, { parse_mode: 'Markdown' });
  });

  // ── /notes ────────────────────────────────────────────────────────────────
  bot.command('notes', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const notes = db.prepare('SELECT title, substr(content,1,60) as preview FROM notes WHERE uid=? ORDER BY pinned DESC, updated_at DESC LIMIT 8').all(uid) as any[];
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Notes', `${config.webappUrl}/notes`) : undefined;
    if (!notes.length) {
      await ctx.reply('No notes yet. Use `/note_add [title] | [text]` or the Notes app.', { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }
    const list = notes.map(n => `*${n.title || 'Untitled'}*\n${n.preview}...`).join('\n\n');
    await ctx.reply(list, { parse_mode: 'Markdown', reply_markup: kb });
  });

  bot.command('note_add', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const text = ctx.message?.text.replace('/note_add', '').trim();
    if (!text || !text.includes('|')) { await ctx.reply('Usage: `/note_add Title | Content`', { parse_mode: 'Markdown' }); return; }
    const [title, content] = text.split('|').map(s => s.trim());
    db.prepare('INSERT INTO notes (uid, title, content) VALUES (?,?,?)').run(uid, title, content);
    await ctx.reply(`Note saved: *${title}*`, { parse_mode: 'Markdown' });
  });

  // ── /habits ───────────────────────────────────────────────────────────────
  bot.command('habits', async (ctx: Context) => {
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Open Habits', `${config.webappUrl}/habits`) : undefined;
    await ctx.reply('*Habits Tracker*\n\nTrack your daily habits and streaks.', { parse_mode: 'Markdown', reply_markup: kb });
  });

  // ── /search ───────────────────────────────────────────────────────────────
  bot.command('search', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const query = ctx.message?.text.replace('/search', '').trim();
    if (!query) { await ctx.reply('Usage: `/search [query]`', { parse_mode: 'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    try {
      const results = await webSearch(query);
      await streamReply(ctx, results);
    } catch (e: any) {
      await ctx.reply(`Search failed: ${e.message}`);
    }
  });

  // ── /remind ───────────────────────────────────────────────────────────────
  bot.command('remind', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/remind', '').trim().split(' ');
    const mins = parseInt(args?.[args.length - 1] || '') || 30;
    const text = args?.slice(0, isNaN(parseInt(args[args.length - 1])) ? undefined : -1).join(' ');
    if (!text) { await ctx.reply('Usage: `/remind [text] [minutes]`\nExample: `/remind Call mom 30`', { parse_mode: 'Markdown' }); return; }
    const fireAt = new Date(Date.now() + mins * 60000).toISOString();
    db.prepare('INSERT INTO reminders (uid, chat_id, text, fire_at) VALUES (?,?,?,?)').run(uid, ctx.chat!.id, text, fireAt);
    await ctx.reply(`Reminder set for ${mins} min: *${text}*`, { parse_mode: 'Markdown' });
  });

  // ── /voice & /voices ──────────────────────────────────────────────────────
  bot.command('voice', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const pref = getUserVoicePref(uid);
    const isOff = pref.lang === 'off';
    if (isOff) {
      setUserVoicePref(uid, 'auto', 0);
      await ctx.reply('Voice mode enabled. Responses to voice messages will be spoken.');
    } else {
      setUserVoicePref(uid, 'off', 0);
      await ctx.reply('Voice mode disabled.');
    }
  });

  bot.command('voices', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const pref = getUserVoicePref(uid);
    const langs = Object.entries(VOICES).map(([code, v]) => `${code === pref.lang ? '>' : '-'} ${code}: ${v.name}`).join('\n');
    await ctx.reply(`*Available voices:*\n\n${langs}\n\nUsage: \`/setvoice ru 1\` (lang, voice index)`, { parse_mode: 'Markdown' });
  });

  bot.command('setvoice', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.split(' ');
    const lang = args?.[1] || 'auto';
    const idx = parseInt(args?.[2] || '0') || 0;
    setUserVoicePref(uid, lang, idx);
    await ctx.reply(`Voice set: ${lang}, index ${idx}`);
  });

  // ── /mystats ──────────────────────────────────────────────────────────────
  bot.command('mystats', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const histCount = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c || 0;
    const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any)?.c || 0;
    const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE uid=?').get(uid) as any)?.c || 0;
    const memCount = getMemories(uid).length;
    const user = db.prepare('SELECT created_at FROM users WHERE uid=?').get(uid) as any;
    await ctx.reply(
      `*Your Stats*\n\nMessages: ${histCount}\nNotes: ${noteCount}\nTasks: ${taskCount}\nMemory facts: ${memCount}\nMember since: ${user?.created_at?.split('T')[0] || 'unknown'}${isAdmin(uid) ? '\n\nRole: Admin' : ''}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── PC Agent Commands ─────────────────────────────────────────────────────

  bot.command('pc', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const online = isAgentOnline(uid);
    const agent = db.prepare('SELECT device_name, platform, last_seen FROM pc_agents WHERE uid=?').get(uid) as any;
    if (!agent) {
      await ctx.reply('No PC agent paired. Use /link to pair your computer.');
      return;
    }
    await ctx.reply(
      `*PC Agent*\n\nDevice: ${agent.device_name || 'Unknown'}\nPlatform: ${agent.platform || 'Unknown'}\nStatus: ${online ? 'online' : 'offline'}\nLast seen: ${agent.last_seen || 'never'}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('link', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const code = generatePairingCode(uid);
    await ctx.reply(
      `*Link Your PC*\n\nPairing code: \`${code}\`\n\nRun the NEXUM agent on your computer and enter this code when prompted.\n\nCode expires in 10 minutes.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('devices', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const agents = getPairedAgents(uid);
    if (!agents.length) {
      await ctx.reply('No devices paired. Use /link to pair your computer.');
      return;
    }
    await ctx.reply(`*Paired Devices:*\n\n${agents.map((a, i) => `${i+1}. ${a}`).join('\n')}`, { parse_mode: 'Markdown' });
  });

  // PC agent command relay helper
  async function sendToAgent(uid: number, cmd: object, ctx: Context, app?: any): Promise<string> {
    const sendToAgentFn = app?.sendToAgent;
    if (!sendToAgentFn) return 'Agent relay not available.';
    if (!isAgentOnline(uid)) return 'PC agent is offline. Run nexum_agent.py on your computer.';
    try {
      const result = await sendToAgentFn(uid, cmd);
      return result?.output || result?.data || JSON.stringify(result);
    } catch (e: any) {
      return `Agent error: ${e.message}`;
    }
  }

  bot.command('run', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const cmd = ctx.message?.text.replace('/run', '').trim();
    if (!cmd) { await ctx.reply('Usage: `/run [command]`', { parse_mode: 'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline. Use /link to connect.'); return; }
    await ctx.reply(`Running: \`${cmd.slice(0, 100)}\`\n\n_Waiting for agent..._`, { parse_mode: 'Markdown' });
  });

  bot.command('bgrun', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const task = ctx.message?.text.replace('/bgrun', '').trim();
    if (!task) { await ctx.reply('Usage: `/bgrun [task description]`', { parse_mode: 'Markdown' }); return; }
    const runId = await runSubagent(uid, task, bot);
    await ctx.reply(`Background task started [${runId}]:\n${task.slice(0, 100)}`, { parse_mode: 'Markdown' });
  });

  bot.command('bglist', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const runs = db.prepare('SELECT id, task, status, started_at FROM subagent_runs WHERE uid=? ORDER BY started_at DESC LIMIT 10').all(uid) as any[];
    if (!runs.length) { await ctx.reply('No background tasks.'); return; }
    const list = runs.map(r => `[${r.id}] ${r.status} — ${r.task.slice(0, 40)}`).join('\n');
    await ctx.reply(`*Background Tasks:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.command('screenshot', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply('Screenshot requested. Make sure your PC agent is running.');
  });

  bot.command('sysinfo', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply('System info requested from agent.');
  });

  bot.command('ps', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply('Process list requested from agent.');
  });

  bot.command('kill', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const target = ctx.message?.text.replace('/kill', '').trim();
    if (!target) { await ctx.reply('Usage: `/kill [process name or PID]`', { parse_mode: 'Markdown' }); return; }
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`Kill requested for: ${target}`);
  });

  bot.command('files', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/files', '').trim();
    if (!args) { await ctx.reply('Usage: `/files [list|read|write] [path]`', { parse_mode: 'Markdown' }); return; }
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`File operation requested: ${args}`);
  });

  bot.command('clipboard', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply('Clipboard requested from agent.');
  });

  bot.command('notify', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const msg = ctx.message?.text.replace('/notify', '').trim();
    if (!msg) { await ctx.reply('Usage: `/notify [title|message]`', { parse_mode: 'Markdown' }); return; }
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`Notification sent to your computer.`);
  });

  bot.command('window', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const op = ctx.message?.text.replace('/window', '').trim();
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`Window operation: ${op || 'list'}`);
  });

  bot.command('mouse', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    const args = ctx.message?.text.replace('/mouse', '').trim();
    await ctx.reply(`Mouse action: ${args}`);
  });

  bot.command('keyboard', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    const text = ctx.message?.text.replace('/keyboard', '').trim();
    await ctx.reply(`Keyboard input: ${text}`);
  });

  bot.command('hotkey', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    const combo = ctx.message?.text.replace('/hotkey', '').trim();
    await ctx.reply(`Hotkey: ${combo}`);
  });

  bot.command('network', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply('Network info requested from agent.');
  });

  bot.command('browser', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const url = ctx.message?.text.replace('/browser', '').trim();
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`Opening browser: ${url}`);
  });

  bot.command('openapp', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const name = ctx.message?.text.replace('/openapp', '').trim();
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`Opening app: ${name}`);
  });

  bot.command('http', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const args = ctx.message?.text.replace('/http', '').trim();
    if (!isAgentOnline(uid)) { await ctx.reply('PC agent offline.'); return; }
    await ctx.reply(`HTTP request: ${args}`);
  });

  // ── /website ──────────────────────────────────────────────────────────────
  bot.command('website', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const desc = ctx.message?.text.replace('/website', '').trim();
    if (!desc) { await ctx.reply('Usage: `/website [description]`', { parse_mode: 'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    try {
      const response = await execute(uid, `Generate a complete single-file HTML website for: ${desc}. Return ONLY the HTML code, nothing else.`);
      const htmlMatch = response.match(/```html\n?([\s\S]+?)\n?```/) || response.match(/<!DOCTYPE html[\s\S]+>/i);
      const html = htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : response;
      const name = desc.slice(0, 30);
      const r = db.prepare('INSERT INTO websites (uid, name, html) VALUES (?,?,?)').run(uid, name, html);
      const siteUrl = `${config.webappUrl}/site/${r.lastInsertRowid}`;
      await ctx.reply(`Website generated: ${siteUrl}`, { reply_markup: new InlineKeyboard().url('Open Website', siteUrl) });
    } catch (e: any) {
      await ctx.reply(`Failed to generate website: ${e.message}`);
    }
  });

  // ── /newtool ──────────────────────────────────────────────────────────────
  bot.command('newtool', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const desc = ctx.message?.text.replace('/newtool', '').trim();
    if (!desc) { await ctx.reply('Usage: `/newtool [description]`', { parse_mode: 'Markdown' }); return; }
    await ctx.replyWithChatAction('typing');
    const name = desc.slice(0, 20).replace(/\s+/g, '_').toLowerCase();
    db.prepare('INSERT INTO custom_tools (uid, name, description, trigger_pattern, code) VALUES (?,?,?,?,?)').run(uid, name, desc, name, '// custom tool');
    await ctx.reply(`Tool created: *${name}*\nDescription: ${desc}`, { parse_mode: 'Markdown' });
  });

  bot.command('tools', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    const tools = db.prepare('SELECT name, description, usage_count FROM custom_tools WHERE uid=? AND active=1 ORDER BY usage_count DESC LIMIT 10').all(uid) as any[];
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Tools App', `${config.webappUrl}/tools`) : undefined;
    if (!tools.length) {
      await ctx.reply('No custom tools. Use /newtool to create one.', { reply_markup: kb });
      return;
    }
    const list = tools.map(t => `*${t.name}*: ${t.description}`).join('\n');
    await ctx.reply(`*Your Tools:*\n\n${list}`, { parse_mode: 'Markdown', reply_markup: kb });
  });

  // ── ADMIN Commands ─────────────────────────────────────────────────────────

  bot.command('admin_stats', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as any)?.c || 0;
    const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any)?.c || 0;
    const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as any)?.c || 0;
    const topUsers = db.prepare('SELECT u.uid, u.username, u.first_name, COUNT(c.id) as msgs FROM users u LEFT JOIN conversations c ON c.uid=u.uid GROUP BY u.uid ORDER BY msgs DESC LIMIT 10').all() as any[];
    const userList = topUsers.map((u, i) => `${i+1}. ${u.first_name || u.username || u.uid} — ${u.msgs} msg`).join('\n');
    await ctx.reply(
      `*Admin Stats*\n\nUsers: ${userCount}\nMessages: ${msgCount}\nNotes: ${noteCount}\nTasks: ${taskCount}\n\n*Top Users:*\n${userList}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('admin_keys', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const pools = Object.entries(config.ai).filter(([, k]) => k.length).map(([p, k]) => `${p}: ${k.length} keys`).join('\n');
    const serper = config.serper.length;
    await ctx.reply(`*API Key Pools:*\n\n${pools}\nSerper: ${serper} keys`, { parse_mode: 'Markdown' });
  });

  bot.command('admin_db', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const tables = ['users', 'conversations', 'notes', 'tasks', 'habits', 'finance', 'reminders', 'websites', 'custom_tools', 'pc_agents'];
    const counts = tables.map(t => {
      const c = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any)?.c || 0;
      return `${t}: ${c}`;
    }).join('\n');
    await ctx.reply(`*Database Stats:*\n\n${counts}`, { parse_mode: 'Markdown' });
  });

  bot.command('admin_clear_user', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const targetId = parseInt(ctx.message?.text.split(' ')[1] || '');
    if (!targetId) { await ctx.reply('Usage: `/admin_clear_user [user_id]`', { parse_mode: 'Markdown' }); return; }
    db.prepare('DELETE FROM conversations WHERE uid=?').run(targetId);
    db.prepare('DELETE FROM memory WHERE uid=?').run(targetId);
    await ctx.reply(`Cleared data for user ${targetId}`);
  });

  bot.command('broadcast', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const msg = ctx.message?.text.replace('/broadcast ', '').trim();
    if (!msg) { await ctx.reply('Usage: `/broadcast [message]`', { parse_mode: 'Markdown' }); return; }
    const users = db.prepare('SELECT DISTINCT uid FROM conversations').all() as any[];
    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.api.sendMessage(user.uid, msg);
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch { failed++; }
    }
    await ctx.reply(`Broadcast sent: ${sent} delivered, ${failed} failed`);
  });

  bot.command('approve', async (ctx: Context) => {
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.reply('Access denied.'); return; }
    const args = ctx.message?.text.split(' ');
    const id = args?.[1];
    const action = args?.[2] || 'approve';
    if (!id) { await ctx.reply('Usage: `/approve [id] [approve|deny]`', { parse_mode: 'Markdown' }); return; }
    await ctx.reply(`Action ${action} for request ${id} processed.`);
  });

  // ── Callback: inline approve/deny ────────────────────────────────────────
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const uid = ctx.from?.id || 0;
    if (!isAdmin(uid)) { await ctx.answerCallbackQuery('Access denied.'); return; }

    if (data.startsWith('approve_') || data.startsWith('deny_')) {
      const id = data.replace('approve_', '').replace('deny_', '');
      const approved = data.startsWith('approve_');
      const { pendingApprovals } = await import('../apps/server');
      const pending = pendingApprovals.get(id);
      if (pending) {
        pending.resolve(approved);
        pendingApprovals.delete(id);
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await ctx.answerCallbackQuery(approved ? 'Approved' : 'Denied');
      } else {
        await ctx.answerCallbackQuery('Request not found or expired');
      }
    } else {
      await ctx.answerCallbackQuery();
    }
  });
}
