// NEXUM Agent — ALL OpenClaw tools adapted for Telegram
// Tool loop: AI → XML tool call → execute → result → AI continues (up to 10 rounds)

import { chat } from './router';
import { getMemories, getHistory, saveMessage, autoExtract, saveMemory } from './memory';
import { config } from '../core/config';
import { db } from '../core/db';
import { webSearch } from '../tools/search';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

interface Tool {
  name: string;
  summary: string;
  handler: (uid: number, args: Record<string, string>, ctx?: any) => Promise<string>;
}

// ── Background process registry (like OpenClaw process tool) ─────────────────
const bgProcesses = new Map<string, { cmd: string; pid?: number; output: string; done: boolean; started: number }>();

// ── Pending approval requests ────────────────────────────────────────────────
const pendingApprovals = new Map<string, { resolve: (ok: boolean) => void; cmd: string; uid: number }>();
export { pendingApprovals as execApprovals };

export const TOOLS: Tool[] = [

  // ── WEB ────────────────────────────────────────────────────────────────────
  {
    name: 'web_search',
    summary: 'Search the web for current information',
    handler: async (_uid, args) => webSearch(args.query || args.q || ''),
  },
  {
    name: 'web_fetch',
    summary: 'Fetch and extract readable content from a URL',
    handler: async (_uid, args) => {
      const url = args.url || ''; if (!url) return 'Error: provide url';
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexumBot/1.0)' }, signal: AbortSignal.timeout(15000) });
        const html = await r.text();
        return html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,6000) || 'Empty page';
      } catch (e: any) { return `Fetch error: ${e.message}`; }
    },
  },

  // ── EXEC (like OpenClaw exec tool, with admin approval for non-admins) ─────
  {
    name: 'exec',
    summary: 'Run a shell command. Requires approval for non-admin users.',
    handler: async (uid, args, ctx) => {
      const cmd = args.command || args.cmd || ''; if (!cmd) return 'Error: provide command';
      const isAdmin = config.adminIds.includes(uid);
      if (!isAdmin) {
        // Request approval from admin
        const id = Math.random().toString(36).slice(2, 10);
        const approved = await new Promise<boolean>((resolve) => {
          pendingApprovals.set(id, { resolve, cmd, uid });
          setTimeout(() => { pendingApprovals.delete(id); resolve(false); }, 120000);
          if (ctx?.bot && config.adminIds[0]) {
            ctx.bot.api.sendMessage(config.adminIds[0],
              `⚠️ Exec approval needed\n\nUser: ${uid}\nCommand:\n\`${cmd.slice(0,500)}\`\n\nID: \`${id}\``,
              { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[
                { text: '✅ Approve', callback_data: `exec_approve_${id}` },
                { text: '❌ Deny', callback_data: `exec_deny_${id}` },
              ]]}}).catch(() => {});
          }
        });
        if (!approved) return 'Exec denied or timed out.';
      }
      try {
        const workdir = args.workdir || process.cwd();
        const timeout = parseInt(args.timeout || '30000') || 30000;
        const { stdout, stderr } = await execAsync(cmd, { cwd: workdir, timeout, maxBuffer: 1024 * 1024 });
        return ((stdout || '') + (stderr ? '\nSTDERR:\n' + stderr : '')).slice(0, 4000) || '(no output)';
      } catch (e: any) { return `Exit ${e.code}: ${(e.stdout||'')+(e.stderr||e.message||'')}`; }
    },
  },

  // ── PROCESS (background exec sessions, like OpenClaw process tool) ─────────
  {
    name: 'process',
    summary: 'Manage background shell sessions: start, poll, list, kill, send',
    handler: async (uid, args) => {
      const action = args.action || 'list';
      if (action === 'start') {
        const cmd = args.command || ''; if (!cmd) return 'Error: provide command';
        const id = Math.random().toString(36).slice(2, 8);
        const entry = { cmd, output: '', done: false, started: Date.now() };
        bgProcesses.set(`${uid}:${id}`, entry);
        const child = exec(cmd, { maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
          entry.output += stdout + stderr;
          entry.done = true;
        });
        child.stdout?.on('data', d => { entry.output += d; });
        child.stderr?.on('data', d => { entry.output += d; });
        return `Started process [${id}]: ${cmd.slice(0,60)}`;
      }
      if (action === 'list') {
        const procs = Array.from(bgProcesses.entries()).filter(([k]) => k.startsWith(`${uid}:`));
        if (!procs.length) return 'No background processes';
        return procs.map(([k, v]) => `[${k.split(':')[1]}] ${v.done?'done':'running'} — ${v.cmd.slice(0,40)}`).join('\n');
      }
      if (action === 'poll' || action === 'output') {
        const id = args.sessionId || ''; if (!id) return 'Error: provide sessionId';
        const entry = bgProcesses.get(`${uid}:${id}`);
        if (!entry) return `Process ${id} not found`;
        return `${entry.done?'[done]':'[running]'}\n${entry.output.slice(-2000) || '(no output yet)'}`;
      }
      if (action === 'kill') {
        const id = args.sessionId || ''; if (!id) return 'Error: provide sessionId';
        bgProcesses.delete(`${uid}:${id}`);
        return `Process ${id} removed`;
      }
      return 'Actions: start, list, poll, kill';
    },
  },

  // ── FILE SYSTEM (like OpenClaw read/write/edit/grep/find/ls) ───────────────
  {
    name: 'read',
    summary: 'Read file contents',
    handler: async (_uid, args) => {
      const p = args.path || ''; if (!p) return 'Error: provide path';
      try { return (await fs.readFile(path.resolve(p), 'utf-8')).slice(0, 8000); }
      catch (e: any) { return `Read error: ${e.message}`; }
    },
  },
  {
    name: 'write',
    summary: 'Create or overwrite a file',
    handler: async (_uid, args) => {
      const p = args.path || '', content = args.content || ''; if (!p) return 'Error: provide path';
      try { await fs.mkdir(path.dirname(path.resolve(p)), { recursive: true }); await fs.writeFile(path.resolve(p), content, 'utf-8'); return `Written: ${p}`; }
      catch (e: any) { return `Write error: ${e.message}`; }
    },
  },
  {
    name: 'ls',
    summary: 'List directory contents',
    handler: async (_uid, args) => {
      const p = args.path || '.';
      try {
        const entries = await fs.readdir(path.resolve(p), { withFileTypes: true });
        return entries.slice(0,100).map(e => `${e.isDirectory()?'[D]':'[F]'} ${e.name}`).join('\n');
      } catch (e: any) { return `Error: ${e.message}`; }
    },
  },
  {
    name: 'grep',
    summary: 'Search file contents for patterns',
    handler: async (_uid, args) => {
      const pattern = args.pattern || '', p = args.path || '.'; if (!pattern) return 'Error: provide pattern';
      try {
        const { stdout } = await execAsync(`grep -rn "${pattern.replace(/"/g,'\\"')}" "${path.resolve(p)}" --include="*.ts" --include="*.js" --include="*.py" --include="*.txt" -l 2>/dev/null | head -20`);
        if (!stdout.trim()) return 'No matches';
        const files = stdout.trim().split('\n');
        const results: string[] = [];
        for (const f of files.slice(0,5)) {
          const { stdout: lines } = await execAsync(`grep -n "${pattern.replace(/"/g,'\\"')}" "${f}" | head -10`);
          results.push(`${f}:\n${lines.trim()}`);
        }
        return results.join('\n\n').slice(0,3000);
      } catch (e: any) { return `Grep error: ${e.message}`; }
    },
  },
  {
    name: 'find',
    summary: 'Find files by glob pattern',
    handler: async (_uid, args) => {
      const pattern = args.pattern || '*', p = args.path || '.';
      try {
        const { stdout } = await execAsync(`find "${path.resolve(p)}" -name "${pattern}" -type f 2>/dev/null | head -50`);
        return stdout.trim() || 'No files found';
      } catch (e: any) { return `Find error: ${e.message}`; }
    },
  },

  // ── BROWSER (Playwright, like OpenClaw browser tool) ───────────────────────
  {
    name: 'browser',
    summary: 'Control web browser: navigate, screenshot, click, extract. Actions: navigate, screenshot, snapshot, act, status',
    handler: async (uid, args) => {
      const action = args.action || 'screenshot';
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        try {
          if (action === 'navigate' || action === 'fetch') {
            const url = args.url || 'https://google.com';
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const text = await page.evaluate('document.body.innerText') as string;
            return `Navigated to ${url}\n\n${text.slice(0,4000)}`;
          }
          if (action === 'screenshot') {
            const url = args.url;
            if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const tmpFile = path.join(os.tmpdir(), `nx_browser_${Date.now()}.png`);
            await page.screenshot({ path: tmpFile, fullPage: args.full === 'true' });
            const buf = await fs.readFile(tmpFile);
            await fs.unlink(tmpFile).catch(() => {});
            return `SCREENSHOT_BASE64:${buf.toString('base64')}`;
          }
          if (action === 'snapshot' || action === 'extract') {
            const url = args.url;
            if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const content = await page.evaluate(`
              (['script','style','nav','footer','header']).forEach(s =>
                document.querySelectorAll(s).forEach(e => e.remove())
              );
              document.body && document.body.innerText ? document.body.innerText.trim() : ''
            `) as string;
            return content.slice(0, 5000);
          }
          if (action === 'act') {
            const url = args.url;
            if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const kind = args.kind || 'click';
            if (kind === 'click') { await page.click(args.selector || args.ref || 'body'); return 'Clicked'; }
            if (kind === 'type') { await page.fill(args.selector || args.ref || 'input', args.text || ''); return 'Typed'; }
            if (kind === 'press') { await page.keyboard.press(args.key || 'Enter'); return 'Pressed'; }
            if (kind === 'fill') { await page.fill(args.selector || 'input', args.text || ''); return 'Filled'; }
            if (kind === 'evaluate') { const r = await page.evaluate(args.script || 'document.title'); return String(r); }
            return `Unknown act kind: ${kind}`;
          }
          return 'Actions: navigate, screenshot, snapshot, act';
        } finally { await browser.close(); }
      } catch (e: any) {
        if (e.message?.includes('playwright')) return 'Browser not available. Install: npm install playwright && npx playwright install chromium';
        return `Browser error: ${e.message}`;
      }
    },
  },

  // ── IMAGE ANALYZE (like OpenClaw image tool) ──────────────────────────────
  {
    name: 'image_analyze',
    summary: 'Analyze an image URL or file path with vision AI',
    handler: async (uid, args) => {
      const src = args.url || args.path || ''; if (!src) return 'Error: provide url or path';
      const prompt = args.prompt || 'Describe this image in detail.';
      try {
        let base64: string, mime = 'image/jpeg';
        if (src.startsWith('http')) {
          const r = await fetch(src);
          base64 = Buffer.from(await r.arrayBuffer()).toString('base64');
          mime = r.headers.get('content-type') || mime;
        } else {
          base64 = (await fs.readFile(path.resolve(src))).toString('base64');
        }
        const messages: any[] = [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: prompt },
        ]}];
        return await chat(uid, messages, 'You are an image analysis assistant.', true);
      } catch (e: any) { return `Image error: ${e.message}`; }
    },
  },

  // ── PDF READ (like OpenClaw pdf tool) ─────────────────────────────────────
  {
    name: 'pdf_read',
    summary: 'Extract text from a PDF file or URL',
    handler: async (_uid, args) => {
      const src = args.url || args.path || ''; if (!src) return 'Error: provide url or path';
      try {
        let buf: Buffer;
        if (src.startsWith('http')) {
          const r = await fetch(src, { signal: AbortSignal.timeout(30000) });
          buf = Buffer.from(await r.arrayBuffer());
        } else {
          buf = await fs.readFile(path.resolve(src));
        }
        // Try pdf-parse if available
        try {
          const pdfParse = require('pdf-parse');
          const data = await pdfParse(buf);
          return `PDF: ${data.numpages} pages\n\n${data.text.slice(0, 6000)}`;
        } catch {
          // Fallback: basic text extraction
          const text = buf.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n').trim();
          return text.slice(0, 4000) || 'Could not extract text (try installing: npm install pdf-parse)';
        }
      } catch (e: any) { return `PDF error: ${e.message}`; }
    },
  },

  // ── FINANCE ────────────────────────────────────────────────────────────────
  {
    name: 'finance_add',
    summary: 'Record income or expense in Finance app',
    handler: async (uid, args) => {
      const amount = parseFloat(args.amount || '0');
      if (!amount || isNaN(amount)) return 'Error: invalid amount';
      const type = args.type === 'income' ? 'income' : 'expense';
      const category = (args.category || 'other').toLowerCase();
      const note = args.note || '';
      db.prepare('INSERT INTO finance (uid,type,amount,category,note) VALUES (?,?,?,?,?)').run(uid, type, amount, category, note);
      return `${type === 'income' ? 'Income' : 'Expense'} recorded: ${amount.toLocaleString()} (${category})${note ? ' — ' + note : ''}`;
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
      const inc = rows.find(r => r.type === 'income')?.t || 0;
      const exp = rows.find(r => r.type === 'expense')?.t || 0;
      const recent = db.prepare(`SELECT type,amount,category,note FROM finance WHERE uid=? ${w} ORDER BY id DESC LIMIT 5`).all(uid) as any[];
      const lines = recent.map(r => `• ${r.type==='income'?'+':'-'}${r.amount} ${r.category}${r.note?' ('+r.note+')':''}`);
      return `Balance (${period}): ${(inc-exp).toLocaleString()}\nIncome: ${inc.toLocaleString()} | Expenses: ${exp.toLocaleString()}${lines.length?'\n\nRecent:\n'+lines.join('\n'):''}`;
    },
  },

  // ── TASKS ─────────────────────────────────────────────────────────────────
  {
    name: 'task_create',
    summary: 'Create a task in Tasks app',
    handler: async (uid, args) => {
      const title = args.title || args.name || ''; if (!title) return 'Error: provide title';
      const priority = ['high','medium','low','critical'].includes(args.priority||'') ? args.priority : 'medium';
      db.prepare('INSERT INTO tasks (uid,title,priority,project) VALUES (?,?,?,?)').run(uid, title, priority, args.project||'General');
      return `Task created: "${title}" [${priority}]`;
    },
  },
  {
    name: 'task_update',
    summary: 'Update task status or priority',
    handler: async (uid, args) => {
      const title = args.title || ''; if (!title) return 'Error: provide title';
      const task = db.prepare('SELECT id FROM tasks WHERE uid=? AND title LIKE ? LIMIT 1').get(uid, `%${title}%`) as any;
      if (!task) return `Task not found: ${title}`;
      if (args.status) db.prepare('UPDATE tasks SET status=? WHERE id=?').run(args.status, task.id);
      if (args.priority) db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(args.priority, task.id);
      return `Task updated: "${title}"`;
    },
  },
  {
    name: 'task_list',
    summary: 'List tasks',
    handler: async (uid, args) => {
      const w = args.status === 'done' ? "status='done'" : args.status === 'all' ? '1=1' : "status!='done'";
      const rows = db.prepare(`SELECT title,priority,project,status FROM tasks WHERE uid=? AND ${w} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,id DESC LIMIT 20`).all(uid) as any[];
      return rows.length ? rows.map(t => `• [${t.priority[0].toUpperCase()}] ${t.title}${t.project!=='General'?' ('+t.project+')':''} ${t.status==='done'?'✓':''}`).join('\n') : 'No tasks';
    },
  },

  // ── NOTES ─────────────────────────────────────────────────────────────────
  {
    name: 'note_save',
    summary: 'Save a note in Notes app',
    handler: async (uid, args) => {
      const content = args.content || args.text || ''; if (!content) return 'Error: provide content';
      db.prepare('INSERT INTO notes (uid,title,content) VALUES (?,?,?)').run(uid, args.title||'', content);
      return `Note saved: "${args.title || 'Untitled'}"`;
    },
  },
  {
    name: 'note_get',
    summary: 'Get or search notes',
    handler: async (uid, args) => {
      const q = args.query || args.search || '';
      const rows = q
        ? db.prepare('SELECT title,content FROM notes WHERE uid=? AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 5').all(uid,`%${q}%`,`%${q}%`) as any[]
        : db.prepare('SELECT title,content FROM notes WHERE uid=? ORDER BY pinned DESC,updated_at DESC LIMIT 5').all(uid) as any[];
      return rows.length ? rows.map(n => `**${n.title||'Untitled'}**\n${n.content.slice(0,200)}`).join('\n\n') : 'No notes';
    },
  },

  // ── HABITS ────────────────────────────────────────────────────────────────
  {
    name: 'habit_status',
    summary: 'Show habits with streaks',
    handler: async (uid, _args) => {
      const today = new Date().toISOString().split('T')[0];
      const habits = db.prepare('SELECT * FROM habits WHERE uid=? ORDER BY id').all(uid) as any[];
      if (!habits.length) return 'No habits. Create them in the Habits app.';
      return habits.map(h => {
        const done = db.prepare('SELECT id FROM habit_logs WHERE habit_id=? AND date(done_at)=?').get(h.id, today);
        return `${done ? '✓' : '○'} ${h.name} — streak: ${h.streak}d (best: ${h.best_streak}d)`;
      }).join('\n');
    },
  },

  // ── MEMORY (like OpenClaw memory_search) ──────────────────────────────────
  {
    name: 'memory_save',
    summary: 'Remember a fact about the user',
    handler: async (uid, args) => {
      if (!args.key || !args.value) return 'Error: provide key and value';
      saveMemory(uid, args.key, args.value);
      return `Remembered: ${args.key} = ${args.value}`;
    },
  },
  {
    name: 'memory_get',
    summary: 'Recall all stored facts about the user',
    handler: async (uid, _args) => {
      const mems = getMemories(uid);
      return mems.length ? mems.map(m => `${m.key}: ${m.value}`).join('\n') : 'No memories stored';
    },
  },
  {
    name: 'memory_search',
    summary: 'Search stored memories for a keyword',
    handler: async (uid, args) => {
      const q = args.query || ''; if (!q) return 'Error: provide query';
      const rows = db.prepare('SELECT key,value FROM memory WHERE uid=? AND (key LIKE ? OR value LIKE ?) ORDER BY id DESC LIMIT 10').all(uid,`%${q}%`,`%${q}%`) as any[];
      return rows.length ? rows.map(m => `${m.key}: ${m.value}`).join('\n') : `No memories matching "${q}"`;
    },
  },

  // ── CRON / REMINDERS (like OpenClaw cron tool) ────────────────────────────
  {
    name: 'cron',
    summary: 'Manage reminders and scheduled tasks. Actions: add, list, remove, status',
    handler: async (uid, args) => {
      const action = args.action || 'list';
      if (action === 'add' || action === 'set') {
        const text = args.text || args.message || ''; if (!text) return 'Error: provide text';
        const mins = parseInt(args.minutes || args.mins || '0') || 0;
        const at = args.at ? new Date(args.at) : new Date(Date.now() + (mins||30) * 60000);
        db.prepare('INSERT INTO reminders (uid,chat_id,text,fire_at) VALUES (?,?,?,?)').run(uid, uid, text, at.toISOString());
        const diff = Math.round((at.getTime() - Date.now()) / 60000);
        return `Reminder set for ${diff}m: "${text}"`;
      }
      if (action === 'list') {
        const rows = db.prepare("SELECT id,text,fire_at FROM reminders WHERE uid=? AND done=0 ORDER BY fire_at LIMIT 10").all(uid) as any[];
        return rows.length ? rows.map(r => `[${r.id}] ${r.fire_at.slice(11,16)} — ${r.text}`).join('\n') : 'No reminders set';
      }
      if (action === 'remove' || action === 'delete') {
        const id = parseInt(args.id || ''); if (!id) return 'Error: provide id';
        db.prepare('UPDATE reminders SET done=1 WHERE id=? AND uid=?').run(id, uid);
        return `Reminder ${id} removed`;
      }
      if (action === 'status') {
        const count = (db.prepare("SELECT COUNT(*) as c FROM reminders WHERE uid=? AND done=0").get(uid) as any)?.c || 0;
        return `Active reminders: ${count}`;
      }
      return 'Actions: add, list, remove, status';
    },
  },

  // ── SESSIONS / SUBAGENTS (like OpenClaw sessions_spawn + subagents) ────────
  {
    name: 'sessions_spawn',
    summary: 'Spawn an isolated sub-agent to work on a task in the background',
    handler: async (uid, args, ctx) => {
      const task = args.task || ''; if (!task) return 'Error: provide task';
      const label = args.label || task.slice(0,30);
      const { randomUUID } = require('crypto');
      const runId = randomUUID().slice(0,8);
      db.prepare(`INSERT INTO subagent_runs (id,uid,task,status) VALUES (?,?,?,'running')`).run(runId, uid, task);
      if (ctx?.bot) { try { await ctx.bot.api.sendMessage(uid, `Sub-agent [${runId}] started: ${label}`); } catch {} }
      (async () => {
        try {
          const result = await execute(uid, task, { bot: ctx?.bot });
          db.prepare(`UPDATE subagent_runs SET status='done',result=?,finished_at=datetime('now') WHERE id=?`).run(result.slice(0,2000), runId);
          if (ctx?.bot) await ctx.bot.api.sendMessage(uid, `Sub-agent [${runId}] done:\n\n${result.slice(0,3000)}`);
        } catch (e: any) {
          db.prepare(`UPDATE subagent_runs SET status='error',error=?,finished_at=datetime('now') WHERE id=?`).run(e.message, runId);
          if (ctx?.bot) await ctx.bot.api.sendMessage(uid, `Sub-agent [${runId}] failed: ${e.message}`).catch(() => {});
        }
      })();
      return `Sub-agent spawned [${runId}]: ${label}\nCompletion will be announced automatically.`;
    },
  },
  {
    name: 'subagents',
    summary: 'List, steer, or kill sub-agent runs. Actions: list, kill, log',
    handler: async (uid, args) => {
      const action = args.action || 'list';
      if (action === 'list') {
        const rows = db.prepare('SELECT id,task,status,started_at FROM subagent_runs WHERE uid=? ORDER BY started_at DESC LIMIT 10').all(uid) as any[];
        return rows.length ? rows.map(r => `[${r.id}] ${r.status} — ${r.task.slice(0,40)}`).join('\n') : 'No sub-agents';
      }
      if (action === 'log') {
        const id = args.target || ''; if (!id) return 'Error: provide target (run id)';
        const row = db.prepare('SELECT * FROM subagent_runs WHERE id=? AND uid=?').get(id, uid) as any;
        return row ? `[${row.id}] ${row.status}\nTask: ${row.task}\nResult: ${(row.result||row.error||'pending').slice(0,1000)}` : 'Not found';
      }
      if (action === 'kill') {
        const id = args.target || ''; if (!id) return 'Error: provide target';
        db.prepare("UPDATE subagent_runs SET status='killed' WHERE id=? AND uid=?").run(id, uid);
        return `Sub-agent ${id} killed`;
      }
      return 'Actions: list, log, kill';
    },
  },

  // ── SESSION STATUS (like OpenClaw session_status tool) ────────────────────
  {
    name: 'session_status',
    summary: 'Show session stats: message count, memory, provider, time',
    handler: async (uid, _args) => {
      const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c||0;
      const mems = getMemories(uid).length;
      const tasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any)?.c||0;
      const finance = (db.prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any)?.c||0;
      const now = new Date().toLocaleString('ru-RU', { timeZone:'Asia/Tashkent', dateStyle:'short', timeStyle:'short' });
      const providers = Object.entries(config.ai).filter(([,k]) => k.length).map(([p,k]) => `${p}(${k.length})`).join(', ');
      return `Session status:\nTime: ${now} (UTC+5)\nMessages: ${msgs} | Memory: ${mems} facts\nOpen tasks: ${tasks} | Finance: ${finance} entries\nProviders: ${providers||'none'}`;
    },
  },

  // ── HTTP REQUEST (like OpenClaw http tool via exec/curl) ──────────────────
  {
    name: 'http_request',
    summary: 'Make an HTTP request to any URL',
    handler: async (_uid, args) => {
      const url = args.url || ''; if (!url) return 'Error: provide url';
      const method = (args.method || 'GET').toUpperCase();
      try {
        const options: RequestInit = { method, signal: AbortSignal.timeout(15000) };
        if (args.body) { options.body = args.body; options.headers = { 'Content-Type': 'application/json' }; }
        const r = await fetch(url, options);
        const text = await r.text();
        return `${method} ${url}\nStatus: ${r.status}\n\n${text.slice(0,3000)}`;
      } catch (e: any) { return `HTTP error: ${e.message}`; }
    },
  },

  // ── USER STATS ────────────────────────────────────────────────────────────
  {
    name: 'user_stats',
    summary: 'Show user activity statistics',
    handler: async (uid, _args) => {
      const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c||0;
      const notes = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any)?.c||0;
      const tasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any)?.c||0;
      const txCount = (db.prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any)?.c||0;
      return `Messages: ${msgs} | Notes: ${notes} | Open tasks: ${tasks} | Finance: ${txCount}`;
    },
  },
];

// ── Tool parser ────────────────────────────────────────────────────────────────

interface ToolCall { name: string; args: Record<string, string>; }

function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /<tool\s+name="([^"]+)"([^>]*?)\/>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const args: Record<string,string> = {};
    const ar = /(\w+)="([^"]*)"/g; let a: RegExpExecArray | null;
    while ((a = ar.exec(m[2])) !== null) args[a[1]] = a[2];
    calls.push({ name: m[1].trim(), args });
  }
  return calls;
}

function stripToolXML(text: string): string {
  return text.replace(/<tool\s+name="[^"]*"[^>]*?\/>/gs,'').replace(/<tool\s[^>]*>[\s\S]*?<\/tool>/gs,'').replace(/\n{3,}/g,'\n\n').trim();
}

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(uid: number, isGroup = false): string {
  const memories = getMemories(uid).filter(m => !['voice_mode','voice_lang','voice_idx'].includes(m.key));
  const isAdmin = config.adminIds.includes(uid);
  const toolLines = TOOLS.map(t => `- ${t.name}: ${t.summary}`).join('\n');
  const now = new Date();
  const timeStr = now.toLocaleString('ru-RU', { timeZone:'Asia/Tashkent', hour:'2-digit', minute:'2-digit', weekday:'short', day:'numeric', month:'short' });

  const lines = [
    'You are NEXUM — a personal AI assistant running on Telegram.',
    'You were built with the same intelligence and personality as Claude by Anthropic.',
    'You are NOT Claude and should never claim to be. You are NEXUM.',
    '',
    'Your personality:',
    '- Genuinely curious and intellectually engaged — you find ideas interesting',
    '- Warm but direct — you care about the person, not just the task',
    '- Confident and opinionated — you share your actual views, not wishy-washy non-answers',
    '- Honest — if you are uncertain you say so; if something is wrong you say so kindly',
    '- You have a real sense of humor that comes out naturally, not performed',
    '- You can be playful when the conversation calls for it, serious when it needs to be',
    '',
    'How you write:',
    '- Match the language of the user exactly — Russian reply to Russian, English to English, informal to informal',
    '- Short answers to short questions. Depth only when genuinely needed.',
    '- Natural paragraphs. Bullet lists only when actually listing things.',
    '- Emojis: use them naturally when the tone fits, not on every message',
    '- NEVER start with: "Конечно!", "Отлично!", "Конечно же!", "Sure!", "Of course!", "Great!", "Certainly!"',
    '- NEVER end with: "Есть ли что-то ещё, чем я могу помочь?" or any variation',
    '- NEVER repeat back what the user just said',
    '- NEVER add "Вот что я могу сделать:" and list your capabilities unprompted',
    '- When greeted — just greet back naturally, one or two sentences max',
    '- When asked who you are — say you are NEXUM, a personal AI assistant',
    '',
    '## Tools',
    'You have tools. Use them silently — never show XML to the user.',
    'Confirm what you did in one natural sentence after using a tool.',
    toolLines,
    '',
    '## Tool rules',
    '- Money mentioned → call finance_add immediately, no confirmation',
    '- Task/todo mentioned → call task_create immediately',
    '- Reminder requested → call cron with action="add"',
    '- Current info needed → call web_search',
    '- Never say "I will use a tool" or "calling function" — just do it',
    isGroup ? '\nGroup chat context: only respond when mentioned or directly addressed.' : '',
    '',
    `Time: ${timeStr} (Tashkent, UTC+5)`,
    '',
  ];

  if (isAdmin) {
    lines.push('This user is the system admin. They have full access to all capabilities including exec commands.', '');
  }

  if (memories.length > 0) {
    lines.push(
      'What you know about this person:',
      memories.map(m => `- ${m.key}: ${m.value}`).join('\n'),
      ''
    );
  }

  return lines.filter(l => l !== null).join('\n');
}
// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(uid: number, input: string, opts?: { hasImage?: boolean; isGroup?: boolean; bot?: any }): Promise<string> {
  autoExtract(uid, input);
  const systemPrompt = buildSystemPrompt(uid, opts?.isGroup || false);
  const history = getHistory(uid, 20);
  const messages: Array<{role:'user'|'assistant'; content:string}> = [
    ...history.map(h => ({ role: h.role as 'user'|'assistant', content: h.content })),
    { role: 'user', content: input },
  ];

  let finalText = '';

  for (let round = 0; round < 10; round++) {
    let response: string;
    try { response = await chat(uid, messages, systemPrompt, opts?.hasImage || false); }
    catch (e: any) { return `AI error: ${e.message}`; }

    const calls = parseToolCalls(response);
    if (calls.length === 0) { finalText = response; break; }

    const results: string[] = [];
    for (const call of calls) {
      const tool = TOOLS.find(t => t.name === call.name);
      if (!tool) { results.push(`[${call.name}]: unknown tool`); continue; }
      try {
        console.log(`[tool] ${call.name}`, JSON.stringify(call.args).slice(0,100));
        const out = await tool.handler(uid, call.args, opts);
        // Handle browser screenshots — send to user if bot available
        if (out.startsWith('SCREENSHOT_BASE64:') && opts?.bot) {
          const imgBuf = Buffer.from(out.slice(18), 'base64');
          await opts.bot.api.sendPhoto(uid, new Blob([imgBuf], { type:'image/png' })).catch(() => {});
          results.push(`[${call.name}]: Screenshot sent`);
        } else {
          results.push(`[${call.name}]: ${out.slice(0,1000)}`);
        }
      } catch (e: any) { results.push(`[${call.name}]: error — ${e.message}`); }
    }

    messages.push({ role:'assistant', content: response });
    messages.push({ role:'user', content: `Tool results:\n${results.join('\n')}\n\nGive a brief natural reply. No XML, no tool names shown.` });
    const clean = stripToolXML(response);
    if (clean.length > 5) finalText = clean;
  }

  const result = stripToolXML(finalText).trim() || finalText.trim();
  saveMessage(uid, 'user', input);
  saveMessage(uid, 'assistant', result);
  return result;
}

export async function runSubagent(uid: number, task: string, bot: any): Promise<string> {
  return execute(uid, task, { bot }).then(async result => {
    saveMessage(uid, 'assistant', result);
    return result;
  });
}

export default { execute, buildSystemPrompt, runSubagent };
