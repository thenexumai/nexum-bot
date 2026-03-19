// NEXUM Agent Executor — полный аналог OpenClaw агента
// Цикл инструментов: AI → tool call → результат → AI продолжает (до 8 итераций)

import { chat } from './router';
import { getMemories, getHistory, saveMessage, autoExtract, saveMemory } from './memory';
import { config } from '../core/config';
import { db } from '../core/db';
import { webSearch } from '../tools/search';

interface Tool {
  name: string;
  description: string;
  params: string;
  handler: (uid: number, args: Record<string, string>) => Promise<string>;
}

export const TOOLS: Tool[] = [
  {
    name: 'web_search',
    description: 'Поиск в интернете',
    params: 'query: строка запроса',
    handler: async (_uid, args) => webSearch(args.query || ''),
  },
  {
    name: 'web_fetch',
    description: 'Загрузить и прочитать URL',
    params: 'url: адрес страницы',
    handler: async (_uid, args) => {
      try {
        const r = await fetch(args.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
        const html = await r.text();
        const text = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s{3,}/g,'\n\n').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,4000);
        return `Содержимое ${args.url}:\n\n${text}`;
      } catch (e: any) { return `Ошибка загрузки: ${e.message}`; }
    },
  },
  {
    name: 'finance_add',
    description: 'Записать доход или расход в Finance',
    params: 'type: income|expense, amount: сумма числом, category: категория, note: описание',
    handler: async (uid, args) => {
      const amount = parseFloat(args.amount);
      if (isNaN(amount)) return 'Ошибка: неверная сумма';
      db.prepare('INSERT INTO finance (uid, type, amount, category, note) VALUES (?,?,?,?,?)').run(uid, args.type||'expense', amount, args.category||'other', args.note||'');
      return `${args.type==='income'?'Доход':'Расход'} ${amount.toLocaleString()} записан (${args.category||'other'})`;
    },
  },
  {
    name: 'finance_balance',
    description: 'Показать баланс и статистику',
    params: 'period: month|week|today|all',
    handler: async (uid, args) => {
      const period = args.period||'month';
      const now = new Date();
      let since = '';
      if (period==='today') since=now.toISOString().split('T')[0];
      else if (period==='week') { const d=new Date(now); d.setDate(d.getDate()-7); since=d.toISOString().split('T')[0]; }
      else if (period==='month') since=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const where = since ? `AND date(created_at)>='${since}'` : '';
      const rows = db.prepare(`SELECT type, SUM(amount) as total FROM finance WHERE uid=? ${where} GROUP BY type`).all(uid) as any[];
      const income = rows.find(r=>r.type==='income')?.total||0;
      const expense = rows.find(r=>r.type==='expense')?.total||0;
      const recent = db.prepare(`SELECT type,amount,category,note FROM finance WHERE uid=? ${where} ORDER BY id DESC LIMIT 5`).all(uid) as any[];
      const list = recent.map(r=>`• ${r.type==='income'?'+':'-'}${r.amount} ${r.category}${r.note?' ('+r.note+')':''}`).join('\n');
      return `Финансы (${period}):\nДоходы: ${income.toLocaleString()}\nРасходы: ${expense.toLocaleString()}\nБаланс: ${(income-expense).toLocaleString()}\n\nПоследние:\n${list||'нет'}`;
    },
  },
  {
    name: 'task_create',
    description: 'Создать задачу в Tasks',
    params: 'title: название, priority: high|medium|low, project: проект (необязательно)',
    handler: async (uid, args) => {
      if (!args.title) return 'Ошибка: нужно название';
      const p = ['high','medium','low','critical'].includes(args.priority) ? args.priority : 'medium';
      db.prepare('INSERT INTO tasks (uid,title,priority,project) VALUES (?,?,?,?)').run(uid, args.title, p, args.project||'General');
      return `Задача создана: "${args.title}" [${p}]`;
    },
  },
  {
    name: 'task_list',
    description: 'Список задач',
    params: 'status: open|done|all',
    handler: async (uid, args) => {
      const where = args.status==='done' ? "status='done'" : args.status==='all' ? '1=1' : "status!='done'";
      const tasks = db.prepare(`SELECT title,priority,project FROM tasks WHERE uid=? AND ${where} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 15`).all(uid) as any[];
      if (!tasks.length) return 'Задач нет';
      return tasks.map(t=>`• [${t.priority[0].toUpperCase()}] ${t.title}${t.project!=='General'?' ('+t.project+')':''}`).join('\n');
    },
  },
  {
    name: 'note_save',
    description: 'Сохранить заметку в Notes',
    params: 'title: заголовок, content: текст заметки',
    handler: async (uid, args) => {
      if (!args.content) return 'Ошибка: нужен текст';
      db.prepare('INSERT INTO notes (uid,title,content) VALUES (?,?,?)').run(uid, args.title||'', args.content);
      return `Заметка сохранена: "${args.title||'Без названия'}"`;
    },
  },
  {
    name: 'note_list',
    description: 'Список заметок',
    params: 'search: поиск (необязательно)',
    handler: async (uid, args) => {
      const notes = args.search
        ? db.prepare('SELECT title,substr(content,1,80) as p FROM notes WHERE uid=? AND (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT 8').all(uid,`%${args.search}%`,`%${args.search}%`) as any[]
        : db.prepare('SELECT title,substr(content,1,80) as p FROM notes WHERE uid=? ORDER BY pinned DESC,updated_at DESC LIMIT 8').all(uid) as any[];
      if (!notes.length) return 'Заметок нет';
      return notes.map(n=>`• ${n.title||'Без названия'}: ${n.p}...`).join('\n');
    },
  },
  {
    name: 'habit_check',
    description: 'Показать привычки с прогрессом',
    params: '',
    handler: async (uid, _args) => {
      const today = new Date().toISOString().split('T')[0];
      const habits = db.prepare('SELECT * FROM habits WHERE uid=? ORDER BY id').all(uid) as any[];
      if (!habits.length) return 'Привычек нет. Создай через /habits';
      return habits.map(h => {
        const done = db.prepare('SELECT id FROM habit_logs WHERE habit_id=? AND date(done_at)=?').get(h.id,today);
        return `${done?'✓':'○'} ${h.name} — серия: ${h.streak}д`;
      }).join('\n');
    },
  },
  {
    name: 'memory_save',
    description: 'Запомнить факт о пользователе',
    params: 'key: ключ, value: значение',
    handler: async (uid, args) => {
      if (!args.key||!args.value) return 'Ошибка: нужны key и value';
      saveMemory(uid, args.key, args.value);
      return `Запомнил: ${args.key} = ${args.value}`;
    },
  },
  {
    name: 'memory_get',
    description: 'Всё что знаю о пользователе',
    params: '',
    handler: async (uid, _args) => {
      const mems = getMemories(uid);
      return mems.length ? mems.map(m=>`${m.key}: ${m.value}`).join('\n') : 'Память пуста';
    },
  },
  {
    name: 'reminder_set',
    description: 'Поставить напоминание',
    params: 'text: текст, minutes: через сколько минут',
    handler: async (uid, args) => {
      const mins = parseInt(args.minutes)||30;
      const fireAt = new Date(Date.now()+mins*60000).toISOString();
      db.prepare('INSERT INTO reminders (uid,chat_id,text,fire_at) VALUES (?,?,?,?)').run(uid,uid,args.text||'Напоминание',fireAt);
      const label = mins>=60 ? `${Math.floor(mins/60)}ч ${mins%60}м` : `${mins}м`;
      return `Напоминание через ${label}: "${args.text}"`;
    },
  },
  {
    name: 'stats',
    description: 'Статистика пользователя',
    params: '',
    handler: async (uid, _args) => {
      const msgs = (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE uid=?').get(uid) as any)?.c||0;
      const notes = (db.prepare('SELECT COUNT(*) as c FROM notes WHERE uid=?').get(uid) as any)?.c||0;
      const tasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE uid=? AND status!='done'").get(uid) as any)?.c||0;
      const finance = (db.prepare('SELECT COUNT(*) as c FROM finance WHERE uid=?').get(uid) as any)?.c||0;
      return `Сообщений: ${msgs}\nЗаметок: ${notes}\nАктивных задач: ${tasks}\nФинансовых записей: ${finance}`;
    },
  },
];

// ── Парсер вызовов инструментов ───────────────────────────────────────────────

interface ToolCall { tool: string; args: Record<string, string>; }

function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  // XML-style: <tool name="web_search" query="запрос" />
  const xmlRe = /<tool\s+name="([^"]+)"([^\/]*)\s*\/>/g;
  let m;
  while ((m = xmlRe.exec(text)) !== null) {
    const args: Record<string,string> = {};
    const attrRe = /(\w+)="([^"]*)"/g; let a;
    while ((a = attrRe.exec(m[2])) !== null) args[a[1]] = a[2];
    calls.push({ tool: m[1], args });
  }
  // Pipe-style fallback: [TOOL:name|key=val]
  const pipeRe = /\[TOOL:([^\]|]+)\|?([^\]]*)\]/g;
  while ((m = pipeRe.exec(text)) !== null) {
    const name = m[1].trim();
    const args: Record<string,string> = {};
    if (m[2]) {
      if (m[2].includes('=')) { m[2].split('|').forEach(p=>{ const [k,...v]=p.split('='); if(k) args[k.trim()]=v.join('=').trim(); }); }
      else { const tool=TOOLS.find(t=>t.name===name); args[tool?.params.split(':')[0]?.trim()||'query']=m[2].split('|')[0]?.trim()||''; }
    }
    if (!calls.find(c=>c.tool===name)) calls.push({ tool: name, args });
  }
  return calls;
}

function stripToolCalls(text: string): string {
  return text.replace(/<tool\s+name="[^"]+"\s*[^\/]*\/>/g,'').replace(/\[TOOL:[^\]]+\]/g,'').replace(/\n{3,}/g,'\n\n').trim();
}

// ── Системный промпт ───────────────────────────────────────────────────────────

export function buildSystemPrompt(uid: number): string {
  const memories = getMemories(uid).filter(m=>!['voice_mode','voice_lang','voice_idx'].includes(m.key));
  const isAdmin = config.adminIds.includes(uid);
  const timeStr = new Date().toLocaleString('ru-RU',{ timeZone:'Asia/Tashkent', dateStyle:'short', timeStyle:'short' });
  const toolList = TOOLS.map(t=>`- **${t.name}**: ${t.description} | Параметры: ${t.params}`).join('\n');

  let prompt = `Ты NEXUM — личный AI-ассистент. Умный, прямой, полезный.

## Стиль ответов
- Отвечай на языке пользователя
- Структурируй текст: абзацы, списки по делу
- Без воды и лишних слов
- Код в блоках \`\`\`
- Не начинай с "Конечно!", "Отлично!" и т.п.

## Время
${timeStr} (Ташкент UTC+5)`;

  if (isAdmin) prompt += `\n\n## Роль\nADMIN — полный доступ к системе.`;
  if (memories.length>0) prompt += `\n\n## Знаю о пользователе\n${memories.map(m=>`- ${m.key}: ${m.value}`).join('\n')}`;

  prompt += `\n\n## Инструменты
Вызывай инструменты через XML:
\`<tool name="название" параметр1="значение" />\`

${toolList}

## Правила
- Вызывай инструменты СРАЗУ, не жди подтверждения
- Упомянул деньги/расход → finance_add
- Упомянул задачу → task_create  
- Хочет запомнить → note_save или memory_save
- Вопрос о текущих событиях → web_search
- Можно несколько инструментов за раз

Пример:
Пользователь: "потратил 50000 на продукты"
<tool name="finance_add" type="expense" amount="50000" category="food" note="Продукты" />
Записал расход 50 000 в категорию "Еда".`;

  return prompt;
}

// ── Главная функция — цикл инструментов ──────────────────────────────────────

export async function execute(uid: number, input: string, hasImage = false): Promise<string> {
  autoExtract(uid, input);
  const systemPrompt = buildSystemPrompt(uid);
  const history = getHistory(uid, 20);
  let messages: Array<{role:'user'|'assistant'|'system'; content:string}> = [
    ...history.map(h=>({ role:h.role as 'user'|'assistant', content:h.content })),
    { role:'user', content:input },
  ];

  let finalResponse = '';
  for (let iter=0; iter<8; iter++) {
    let response: string;
    try { response = await chat(uid, messages, systemPrompt, hasImage); }
    catch (e:any) { return `Ошибка AI: ${e.message}`; }

    const toolCalls = parseToolCalls(response);
    if (toolCalls.length===0) { finalResponse=response; break; }

    const toolResults: string[] = [];
    for (const call of toolCalls) {
      const tool = TOOLS.find(t=>t.name===call.tool);
      if (!tool) { toolResults.push(`[${call.tool}]: Инструмент не найден`); continue; }
      try {
        console.log(`[tool] ${call.tool}`, call.args);
        const result = await tool.handler(uid, call.args);
        toolResults.push(`[${call.tool}]: ${result}`);
      } catch (e:any) { toolResults.push(`[${call.tool}]: Ошибка — ${e.message}`); }
    }

    const cleanResponse = stripToolCalls(response);
    if (cleanResponse) finalResponse = cleanResponse;
    messages.push({ role:'assistant', content:response });
    messages.push({ role:'user', content:`Результаты:\n${toolResults.join('\n')}` });
  }

  const result = stripToolCalls(finalResponse) || finalResponse;
  saveMessage(uid, 'user', input);
  saveMessage(uid, 'assistant', result);
  return result;
}

export async function runSubagent(uid: number, task: string, bot: any): Promise<string> {
  const runId = require('crypto').randomUUID().slice(0,8);
  db.prepare(`INSERT INTO subagent_runs (id,uid,task,status) VALUES (?,?,?,'running')`).run(runId,uid,task);
  try { await bot.api.sendMessage(uid,`Запущена задача [${runId}]:\n${task.slice(0,100)}`); } catch {}
  (async()=>{
    try {
      const result = await execute(uid, task);
      db.prepare(`UPDATE subagent_runs SET status='done',result=?,finished_at=datetime('now') WHERE id=?`).run(result.slice(0,2000),runId);
      await bot.api.sendMessage(uid,`Задача [${runId}] выполнена:\n\n${result.slice(0,3000)}`);
    } catch(e:any) {
      db.prepare(`UPDATE subagent_runs SET status='error',error=?,finished_at=datetime('now') WHERE id=?`).run(e.message,runId);
      await bot.api.sendMessage(uid,`Задача [${runId}] упала: ${e.message}`).catch(()=>{});
    }
  })();
  return runId;
}

export default { execute, buildSystemPrompt, runSubagent };
