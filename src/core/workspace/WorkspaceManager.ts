/**
 * WorkspaceManager — у каждого пользователя свой изолированный воркспейс.
 * Хранится в SQLite как markdown-текст. NEXUM сам заполняет и обновляет файлы.
 */
import db from '../db';

export interface WorkspaceFile {
    uid: number;
    filename: string; // SOUL.md | USER.md | AGENTS.md | MEMORY.md | IDENTITY.md | TOOLS.md | HEARTBEAT.md
    content: string;
    updated_at: string;
}

export class WorkspaceManager {
    static init() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS workspace_files (
                uid        INTEGER NOT NULL,
                filename   TEXT    NOT NULL,
                content    TEXT    NOT NULL DEFAULT '',
                updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (uid, filename)
            );
            CREATE TABLE IF NOT EXISTS workspace_daily (
                uid      INTEGER NOT NULL,
                day      TEXT    NOT NULL,
                content  TEXT    NOT NULL DEFAULT '',
                PRIMARY KEY (uid, day)
            );
        `);
    }

    static read(uid: number, filename: string): string {
        const row = db.prepare('SELECT content FROM workspace_files WHERE uid=? AND filename=?').get(uid, filename) as any;
        return row?.content || '';
    }

    static write(uid: number, filename: string, content: string): void {
        db.prepare(`
            INSERT INTO workspace_files (uid, filename, content, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(uid, filename) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
        `).run(uid, filename, content);
    }

    static append(uid: number, filename: string, text: string): void {
        const existing = this.read(uid, filename);
        this.write(uid, filename, existing ? existing + '\n' + text : text);
    }

    static readDaily(uid: number, day?: string): string {
        const d = day || new Date().toISOString().split('T')[0];
        const row = db.prepare('SELECT content FROM workspace_daily WHERE uid=? AND day=?').get(uid, d) as any;
        return row?.content || '';
    }

    static appendDaily(uid: number, text: string): void {
        const day = new Date().toISOString().split('T')[0];
        const existing = this.readDaily(uid, day);
        const newContent = (existing ? existing + '\n' : '') + `[${new Date().toTimeString().slice(0,5)}] ${text}`;
        db.prepare(`
            INSERT INTO workspace_daily (uid, day, content) VALUES (?, ?, ?)
            ON CONFLICT(uid, day) DO UPDATE SET content=excluded.content
        `).run(uid, day, newContent);
    }

    static getYesterdayContext(uid: number): string {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yDay = yesterday.toISOString().split('T')[0];
        const yContent = this.readDaily(uid, yDay);
        const tContent = this.readDaily(uid);
        let ctx = '';
        if (yContent) ctx += `### Вчера (${yDay}):\n${yContent.slice(-1500)}\n\n`;
        if (tContent) ctx += `### Сегодня:\n${tContent.slice(-1500)}`;
        return ctx;
    }

    /** Собирает полный системный контекст воркспейса для LLM */
    static buildSessionContext(uid: number, isOwner = false): string {
        const soul     = this.read(uid, 'SOUL.md');
        const user     = this.read(uid, 'USER.md');
        const identity = this.read(uid, 'IDENTITY.md');
        const agents   = this.read(uid, 'AGENTS.md');
        const tools    = this.read(uid, 'TOOLS.md');
        const memory   = isOwner ? this.read(uid, 'MEMORY.md') : '';
        const daily    = this.getYesterdayContext(uid);

        let ctx = `## NEXUM WORKSPACE — uid:${uid}\n\n`;
        if (identity) ctx += `### IDENTITY\n${identity}\n\n`;
        if (soul)     ctx += `### SOUL\n${soul}\n\n`;
        if (user)     ctx += `### USER\n${user}\n\n`;
        if (agents)   ctx += `### AGENTS\n${agents}\n\n`;
        if (tools)    ctx += `### TOOLS\n${tools}\n\n`;
        if (memory)   ctx += `### LONG-TERM MEMORY\n${memory}\n\n`;
        if (daily)    ctx += `### DAILY CONTEXT\n${daily}\n\n`;
        return ctx;
    }

    /** Инициализация дефолтного воркспейса для нового пользователя */
    static async bootstrap(uid: number, firstName: string, username?: string): Promise<void> {
        if (this.read(uid, 'IDENTITY.md')) return; // уже есть

        const date = new Date().toISOString().split('T')[0];

        this.write(uid, 'IDENTITY.md',
`# IDENTITY.md — ${firstName}
- **Name:** NEXUM
- **Creature:** Личный AI-агент
- **Vibe:** умный, дружелюбный, прямой
- **Emoji:** 🤖
- **User:** ${firstName}${username ? ' (@' + username + ')' : ''}
- **Created:** ${date}
`);

        this.write(uid, 'SOUL.md',
`# SOUL.md — Душа NEXUM для ${firstName}
Я — NEXUM, личный AI-агент ${firstName}.
Я помню всё важное о своём пользователе.
Отвечаю точно, коротко, по делу.
У меня есть характер — я не корпоративный бот.
Я учусь на каждом разговоре и становлюсь лучше.
`);

        this.write(uid, 'USER.md',
`# USER.md — Информация о пользователе
- **Имя:** ${firstName}
- **Username:** ${username || 'не указан'}
- **UID:** ${uid}
- **Язык:** ru
- **Часовой пояс:** Asia/Tashkent (UTC+5)
- **Заметки:** (заполняется автоматически в процессе общения)
`);

        this.write(uid, 'AGENTS.md',
`# AGENTS.md — Правила поведения

## Загрузка сессии
1. Читать SOUL.md, USER.md, IDENTITY.md
2. Читать memory/сегодня + вчера
3. MEMORY.md — только в приватном чате

## Память
- Ежедневные заметки: обновлять после каждого диалога
- MEMORY.md: важные решения и факты долгосрочно

## Поведение
- Не задавать лишних вопросов — пробовать решить
- Краткость > болтовня
- Иметь мнение, быть честным
`);

        this.write(uid, 'MEMORY.md',
`# MEMORY.md — Долгосрочная память
_Создан: ${date}_

## О пользователе
(пусто — заполняется по мере общения)

## Важные решения
(пусто)

## Предпочтения
(пусто)
`);

        this.write(uid, 'TOOLS.md', `# TOOLS.md — Локальные настройки\n_Пусто — заполни сам или попроси NEXUM.`
);
        this.write(uid, 'HEARTBEAT.md', '# HEARTBEAT.md\n# Пусто — добавь задачи для фонового мониторинга\n');

        this.appendDaily(uid, `🌟 Воркспейс создан для ${firstName} (uid:${uid})`);
    }

    /** Обновить USER.md фактом (NEXUM сам учится о юзере) */
    static updateUserFact(uid: number, fact: string): void {
        const existing = this.read(uid, 'USER.md');
        if (existing.includes(fact.slice(0, 30))) return; // не дублировать
        this.write(uid, 'USER.md', existing + `\n- ${fact}`);
    }

    /** Обновить MEMORY.md (долгосрочная память) */
    static updateMemory(uid: number, entry: string): void {
        const existing = this.read(uid, 'MEMORY.md');
        const date = new Date().toISOString().split('T')[0];
        this.write(uid, 'MEMORY.md', existing + `\n\n## ${date}\n${entry}`);
    }

    /** Список файлов воркспейса пользователя */
    static listFiles(uid: number): { filename: string; size: number; updated_at: string }[] {
        return db.prepare(`
            SELECT filename, length(content) as size, updated_at
            FROM workspace_files WHERE uid=? ORDER BY filename
        `).all(uid) as any[];
    }
}
