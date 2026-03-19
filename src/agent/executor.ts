// NEXUM Agent — OpenClaw architecture
// Tool loop: AI → XML tool call → execute → result → AI continues (up to 8 rounds)

import { chat } from './router';
import { getMemories, getHistory, saveMessage, autoExtract, saveMemory } from './memory';
import { config } from '../core/config';
import { db } from '../core/db';
import { webSearch } from '../tools/search';

// ── Tools ─────────────────────────────────────────────────────────────────────

interface Tool {
  name: string;
  summary: string;
  handler: (uid: number, args: Record<string, string>) => Promise<string>;
}

export const TOOLS: Tool[] = [
  {
    name: 'web_search',
    summary: 'Search the web',
    handler: async (_uid, args) => {
      const q = args.query || args.q || '';
      if (!q) return 'Error: provide query';
      return webSearch(q);
    },
  },
  {
    name: 'web_fetch',
    summary: 'Fetch and extract readable content from a URL',
    handler: async (_uid, args) => {
      const url = args.url || '';
      if (!url) return 'Error: provide url';
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexumBot/1.0)' },
          signal: AbortSignal.timeout(12000),
        });
        const html = await r.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .trim().slice(0, 5000);
        return text || 'Empty page';
      } catch (e: any) {
        return `Fetch error: ${e.message}`;
      }
    },
  },
  {
    name: 'finance_add',
    summary: 'Record income or expense',
    handler: async (uid, args) => {
      const amount = parseFloat(args.amount || '0');
      if (!amount || isNaN(amount)) return 'Error: invalid amount';
      const type = args.type === 'income' ? 'income' : 'expense';
      const category = (args.category || 'other').toLowerCase();
      const note = args.note || '';
      db.prepare('INSERT INTO finance (uid,type,amount,category,note) VALUES (?,?,?,?,?)')
        .run(uid, type, amount, category, note);
      const label = type === 'income' ? 'Income' : 'Expense';
      return `${label} recorded: ${amount.toLocaleString()} (${category})${note ? ' — ' + note : ''}`;
    },
  },
  {
    name: 'finance_summary',
    summary: 'Show balance and recent transactions',
    handler: async (uid, args) => {
      const period = args.period || 'month';
      const now = new Date();
      let since = '';
      if (period === 'today') since = now.toISOString().split('T')[0];
      else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); since = d.toISOString().split('T')[0]; }
      else if (period === 'month') since = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const w = since ? `AND date(created_at)>='${since}'` : '';
      const rows = db.prepare(`SELECT type,SUM(amount) as t FROM finance WHERE uid=? ${w} GROUP BY type`).all(uid) as any[];
      const inc = rows.find(r => r.type==='income')?.t || 0;
      const exp = rows.find(r => r.type==='expense')?.t || 0;
      const recent = db.prepare(`SELECT type,amount,category,note FROM finance WHERE uid=? ${w} ORDER BY id DESC LIMIT 5`).all(uid) as any[];
      const lines = recent.map(r => `• ${r.type==='income'?'+':'-'}${r.amount} ${r.category}${r.note?' ('+r.note+')':''}`);
      return `Balance (${period}): ${(inc-exp).toLocaleString()}\nIncome: ${inc.toLocaleString()} | Expenses: ${exp.toLocaleString()}\n${lines.length ? '\nRecent:\n' + lines.join('\n') : ''}`.trim();
    },
  },
  {
    name: 'task_create',
    summary: 'Create a task',
    handler: async (uid, args) => {
      const title = args.title || args.name || '';
      if (!title) return 'Error: provide title';
      const priority = ['high','medium','low','critical'].includes(args.priority||'') ? args.priority : 'medium';
      const project = args.project || 'General';
      db.prepare('INSERT INTO tasks (uid,title,priority,project) VALUES (?,?,?,?)').run(uid, title, priority, project);
      return `Task created: "${title}" [${priority}]`;
    },
  },
  {
    name: 'task_list',
    summary: 'List tasks',
    handler: async (uid, args) => {
      const filter = args.status || 'open';
      const w = filter === 'done' ? "status='done'" : filter === 'all' ? '1=1' : "status!='done'";
      const rows = db.prepare(`SELECT title,priority,project,status FROM tasks WHERE uid=? AND ${w} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,id DESC LIMIT 15`).all(uid) as any[];
      if (!rows.length) return 'No tasks';
      return rows.map(t => `• [${t.priority[0].toUpperCase()}] ${t.title}${t.project!=='General'?' ('+t.project+')':''}`).join('\n');
    },
  },
  {
    name: 'note_save',
    summary: 'Save a note',
    handler: async (uid, args) => {
      const content = args.content || args.text || '';
      if (!content) return 'Error: provide content';
      const title = args.title || '';
      db.prepare('INSERT INTO notes (uid,title,content) VALUES (?,?,?)').run(uid, title, content);
      return `Note saved: "${title || 'Untitled'}"`;
    },
  },
  {
    name: 'note_list',
    summary: 'List or search notes',
    handler: async (uid, args) => {
      const q = args.query || args.search || '';
      const rows = q
        ? db.prepare('SELECT title,substr(content,1,100) as p FROM notes WHERE uid=? AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 8').all(uid,`%${q}%`,`%${q}%`) as any[]
        : db.prepare('SELECT title,substr(content,1,100) as p FROM notes WHERE uid=? ORDER BY pinned DESC,updated_at DESC LIMIT 8').all(uid) as any[];
      if (!rows.length) return 'No notes';
      return rows.map(n => `• ${n.title||'Untitled'}: ${n.p}…`).join('\n');
    },
  },
  {
    name: 'habit_status',
    summary: 'Show habits with streaks',
    handler: async (uid, _args) => {
      const today = new Date().toISOString().split('T')[0];
      const habits = db.prepare('SELECT * FROM habits WHERE uid=? ORDER BY id').all(uid) as any[];
      if (!habits.length) return 'No habits. Create via /habits app.';
      return habits.map(h => {
        const done = db.prepare('SELECT id FROM habit_logs WHERE habit_id=? AND date(done_at)=?').get(h.id, today);
        return `${done ? '✓' : '○'} ${h.name} — streak: ${h.streak} days`;
      }).join('\n');
    },
  },
  {
    name: 'memory_save',
    summary: 'Remember a fact about the user',
    handler: async (uid, args) => {
      const key = args.key || '';
      const value = args.value || '';
      if (!key || !value) return 'Error: provide key and value';
      saveMemory(uid, key, value);
      return `Remembered: ${key} = ${value}`;
    },
  },
  {
    name: 'memory_recall',
    summary: 'Recall stored facts about the user',
    handler: async (uid, _args) => {
      const mems = getMemories(uid);
      return mems.length ? mems.map(m => `${m.key}: ${m.value}`).join('\n') : 'No memories stored';
    },
  },
  {
    name: 'reminder_set',
    summary: 'Set a reminder (use for time-based requests)',
    handler: async (uid, args) => {
      const text = args.text || args.message || '';
      if (!text) return 'Error: provide reminder text';
      const mins = parseInt(args.minutes || args.mins || '30') || 30;
      const fireAt = new Date(Date.now() + mins * 60000).toISOString();
      db.prepare('INSERT INTO reminders (uid,chat_id,text,fire_at) VALUES (?,?,?,?)').run(uid, uid, text, fireAt);
      const label = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60>0?mins%60+'m':''}` : `${mins}m`;
      return `Reminder set for ${label.trim()}: "${text}"`;
    },
  },
  {
    name: 'user_stats',
    summary: 'Show user activity statistics',
    handler: async (uid, _args) => {
      const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c || 0;
      const notes = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any)?.c || 0;
      const openTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any)?.c || 0;
      const txCount = (db.prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any)?.c || 0;
      return `Messages: ${msgs} | Notes: ${notes} | Open tasks: ${openTasks} | Finance entries: ${txCount}`;
    },
  },
];

// ── Tool call parser ───────────────────────────────────────────────────────────

interface ToolCall { name: string; args: Record<string, string>; }

function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  // Primary format: <tool name="x" key="val" />
  const re = /<tool\s+name="([^"]+)"([^>]*?)\/>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const args: Record<string, string> = {};
    const ar = /(\w+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[2])) !== null) args[a[1]] = a[2];
    calls.push({ name: m[1].trim(), args });
  }
  return calls;
}

// Strip ALL tool XML from text — user must never see it
function stripToolXML(text: string): string {
  return text
    .replace(/<tool\s+name="[^"]*"[^>]*?\/>/gs, '')
    .replace(/<tool\s+name="[^"]*"[^>]*?>[\s\S]*?<\/tool>/gs, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── System prompt — OpenClaw style ────────────────────────────────────────────

export function buildSystemPrompt(uid: number): string {
  const memories = getMemories(uid).filter(m => !['voice_mode','voice_lang','voice_idx'].includes(m.key));
  const isAdmin = config.adminIds.includes(uid);

  const toolLines = TOOLS.map(t => `- ${t.name}: ${t.summary}`).join('\n');

  const lines = [
    'You are a personal assistant running inside NEXUM.',
    '',
    '## Tooling',
    'Tool names are case-sensitive. Call tools exactly as listed.',
    toolLines,
    '',
    '## Tool Call Style',
    'Do not narrate routine tool calls — just call the tool.',
    'Call tools only when actually needed. Do not call tools for simple conversational replies.',
    'When you record a finance entry, task, or note — confirm it briefly in natural language.',
    'NEVER show XML tool syntax to the user. It is internal only.',
    '',
    '## Reply Style',
    'You are a personal assistant — be helpful, direct, and natural.',
    'Match the user\'s language (auto-detect Russian, English, Uzbek, etc.).',
    'Keep responses concise. Use short paragraphs. Use lists only when listing things.',
    'Do not start replies with "Of course", "Sure", "Great", "Certainly", "I can help".',
    'Do not pepper replies with multiple questions — ask one if needed.',
    'For greetings, respond naturally and briefly.',
    '',
  ];

  if (isAdmin) {
    lines.push('## Role', 'You are talking to the system admin. Full access to all features.', '');
  }

  if (memories.length > 0) {
    lines.push('## About this user', memories.map(m => `- ${m.key}: ${m.value}`).join('\n'), '');
  }

  const now = new Date();
  const timeStr = now.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'long', year: 'numeric' });
  lines.push('## Current Time', `${dateStr}, ${timeStr} (Tashkent, UTC+5)`, '');

  lines.push(
    '## Finance recording',
    'When user mentions receiving money, a salary, income → call finance_add with type="income".',
    'When user mentions spending money, a purchase, expense → call finance_add with type="expense".',
    'Parse amounts intelligently: "5 тысяч" = 5000, "миллион" = 1000000, "$50" = amount=50 currency=USD.',
    '',
    '## Reminders',
    'When user asks to be reminded about something → call reminder_set.',
    'Use cron tool hints: write the reminder text naturally as it will appear when it fires.',
    '',
  );

  return lines.join('\n');
}

// ── Main execute — full tool loop ─────────────────────────────────────────────

export async function execute(uid: number, input: string, hasImage = false): Promise<string> {
  autoExtract(uid, input);

  const systemPrompt = buildSystemPrompt(uid);
  const history = getHistory(uid, 20);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: input },
  ];

  let finalText = '';
  let toolsExecuted = false;

  for (let round = 0; round < 8; round++) {
    let response: string;
    try {
      response = await chat(uid, messages, systemPrompt, hasImage);
    } catch (e: any) {
      return `AI error: ${e.message}`;
    }

    const calls = parseToolCalls(response);

    if (calls.length === 0) {
      // No tools — this is the final answer
      finalText = response;
      break;
    }

    // Execute all tool calls
    toolsExecuted = true;
    const results: string[] = [];

    for (const call of calls) {
      const tool = TOOLS.find(t => t.name === call.name);
      if (!tool) { results.push(`[${call.name}]: unknown tool`); continue; }
      try {
        console.log(`[tool] ${call.name}`, JSON.stringify(call.args).slice(0, 100));
        const out = await tool.handler(uid, call.args);
        results.push(`[${call.name}]: ${out}`);
      } catch (e: any) {
        results.push(`[${call.name}]: error — ${e.message}`);
      }
    }

    // Add to conversation
    messages.push({ role: 'assistant', content: response });
    messages.push({
      role: 'user',
      content: `Tool results:\n${results.join('\n')}\n\nNow give the user a natural reply based on these results. Do not show XML or tool names.`,
    });

    // Store clean text as partial result
    const clean = stripToolXML(response);
    if (clean.length > 5) finalText = clean;
  }

  // Always strip any leaked XML from final answer
  const result = stripToolXML(finalText).trim() || finalText.trim();

  saveMessage(uid, 'user', input);
  saveMessage(uid, 'assistant', result);
  return result;
}

// ── Subagent ──────────────────────────────────────────────────────────────────

export async function runSubagent(uid: number, task: string, bot: any): Promise<string> {
  const { randomUUID } = require('crypto');
  const runId = randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO subagent_runs (id,uid,task,status) VALUES (?,?,?,'running')`).run(runId, uid, task);
  try { await bot.api.sendMessage(uid, `Background task started [${runId}]:\n${task.slice(0, 100)}`); } catch {}
  (async () => {
    try {
      const result = await execute(uid, task);
      db.prepare(`UPDATE subagent_runs SET status='done',result=?,finished_at=datetime('now') WHERE id=?`).run(result.slice(0, 2000), runId);
      await bot.api.sendMessage(uid, `Task [${runId}] done:\n\n${result.slice(0, 3000)}`);
    } catch (e: any) {
      db.prepare(`UPDATE subagent_runs SET status='error',error=?,finished_at=datetime('now') WHERE id=?`).run(e.message, runId);
      await bot.api.sendMessage(uid, `Task [${runId}] failed: ${e.message}`).catch(() => {});
    }
  })();
  return runId;
}

export default { execute, buildSystemPrompt, runSubagent };
