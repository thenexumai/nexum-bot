import { Bot, InlineKeyboard } from 'grammy';
import { CONFIG } from '../../core/config';
import { KnowledgeGraph } from '../../core/memory/knowledge_graph';
import { webSearchFormatted } from '../../tools/search';
import db from '../../core/db';
import { getUserMode, setUserMode, ChatMode } from '../../soul/index';

// ── Plan definitions ─────────────────────────────────────────────────────────
const PLANS: Record<string, { name: string; limit: number; emoji: string; desc: string }> = {
    free:   { name: 'Free',   limit: 50,   emoji: '🆓', desc: 'Базовый AI, память, задачи, финансы' },
    middle: { name: 'Middle', limit: 200,  emoji: '⚡', desc: 'Голосовые сообщения, напоминания, все Mini Apps' },
    pro:    { name: 'Pro',    limit: 9999, emoji: '💎', desc: 'PC Агент, свои API ключи, безлимит' },
};

// ── Mode definitions ─────────────────────────────────────────────────────────
const MODES: Record<ChatMode, { emoji: string; name: string; desc: string }> = {
    default:  { emoji: '🤖', name: 'Стандартный', desc: 'Сбалансированные ответы' },
    deep:     { emoji: '🔬', name: 'Глубокий',   desc: 'Детальный анализ с источниками' },
    brief:    { emoji: '⚡', name: 'Краткий',    desc: 'Максимально короткие ответы' },
    creative: { emoji: '🎨', name: 'Творческий', desc: 'Свободный, образный стиль' },
    code:     { emoji: '💻', name: 'Код',        desc: 'Фокус на программировании' },
};

function getUser(uid: number) {
    return db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;
}

function ensureUser(uid: number, username?: string, firstName?: string) {
    db.prepare(`
        INSERT OR IGNORE INTO users (uid, username, first_name, msg_count_today, subscription_plan)
        VALUES (?, ?, ?, 0, 'free')
    `).run(uid, username || '', firstName || '');
}

// ── Main keyboard ─────────────────────────────────────────────────────────────
function getMainKeyboard(uid: number) {
    const baseUrl = CONFIG.WEBAPP_URL || `https://nexum.railway.app`;
    return new InlineKeyboard()
        .webApp('📱 Открыть NEXUM', `${baseUrl}/index.html?uid=${uid}`)
        .row()
        .text('📊 Статус', 'cmd:status')
        .text('🧠 Память', 'cmd:memory')
        .text('🎭 Режим', 'cmd:mode_menu')
        .row()
        .text('📱 Mini Apps', 'cmd:apps')
        .text('💎 Тарифы', 'cmd:tariffs')
        .text('❓ Помощь', 'cmd:help');
}

// ── Mode keyboard ─────────────────────────────────────────────────────────────
function getModeKeyboard(currentMode: ChatMode) {
    const kb = new InlineKeyboard();
    const modeList = Object.entries(MODES) as [ChatMode, typeof MODES[ChatMode]][];
    for (let i = 0; i < modeList.length; i += 2) {
        const [modeA, infoA] = modeList[i];
        const isActiveA = modeA === currentMode;
        const labelA = `${isActiveA ? '✓ ' : ''}${infoA.emoji} ${infoA.name}`;
        if (i + 1 < modeList.length) {
            const [modeB, infoB] = modeList[i + 1];
            const isActiveB = modeB === currentMode;
            const labelB = `${isActiveB ? '✓ ' : ''}${infoB.emoji} ${infoB.name}`;
            kb.text(labelA, `set_mode:${modeA}`).text(labelB, `set_mode:${modeB}`).row();
        } else {
            kb.text(labelA, `set_mode:${modeA}`).row();
        }
    }
    kb.text('↩️ Назад', 'cmd:back_main');
    return kb;
}

// ── Apps keyboard ─────────────────────────────────────────────────────────────
function getAppsKeyboard(uid: number) {
    const base = CONFIG.WEBAPP_URL || 'https://nexum.railway.app';
    return new InlineKeyboard()
        .webApp('✅ Задачи',    `${base}/tasks.html?uid=${uid}`)
        .webApp('💰 Финансы',   `${base}/finance.html?uid=${uid}`)
        .row()
        .webApp('📝 Заметки',   `${base}/notes.html?uid=${uid}`)
        .webApp('📅 Календарь', `${base}/calendar.html?uid=${uid}`)
        .row()
        .webApp('💪 Привычки',  `${base}/habits.html?uid=${uid}`)
        .webApp('📇 Контакты',  `${base}/contacts.html?uid=${uid}`)
        .row()
        .webApp('⚙️ Настройки', `${base}/settings.html?uid=${uid}`)
        .row()
        .text('↩️ Назад', 'cmd:back_main');
}

export function setupGeneralCommands(bot: Bot) {

    // ── /start ────────────────────────────────────────────────────────────
    bot.command('start', async (ctx) => {
        const uid = ctx.from!.id;
        const name = ctx.from?.first_name || 'друг';
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];
        const mode = getUserMode(uid);
        const modeInfo = MODES[mode];

        await ctx.reply(
            `✦ Привет, *${name}!*\n\n` +
            `Я **NEXUM** — твой AI-агент нового поколения.\n\n` +
            `${plan.emoji} *${plan.name}* · ${user?.msg_count_today || 0}/${plan.limit} сообщений сегодня\n` +
            `${modeInfo.emoji} Режим: *${modeInfo.name}*\n\n` +
            `Просто напиши что угодно — я готов.`,
            { parse_mode: 'Markdown', reply_markup: getMainKeyboard(uid) }
        );
    });

    // ── /new / /reset ─────────────────────────────────────────────────────
    bot.command(['new', 'reset'], async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare('DELETE FROM sessions WHERE uid = ?').run(uid);
        await ctx.reply(
            '🔄 *Новый чат начат.* История очищена — начинаем с чистого листа.',
            { parse_mode: 'Markdown' }
        );
    });

    // ── /mode — switch chat mode ───────────────────────────────────────────
    bot.command('mode', async (ctx) => {
        const uid = ctx.from!.id;
        const arg = ctx.match?.trim().toLowerCase() as ChatMode | undefined;

        if (arg && MODES[arg]) {
            setUserMode(uid, arg);
            const info = MODES[arg];
            await ctx.reply(
                `${info.emoji} *Режим изменён: ${info.name}*\n${info.desc}`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Show mode picker
        const currentMode = getUserMode(uid);
        const info = MODES[currentMode];
        await ctx.reply(
            `🎭 *Выбери режим общения*\n\nСейчас: ${info.emoji} *${info.name}* — ${info.desc}\n\n` +
            `🤖 *Стандартный* — сбалансированные ответы\n` +
            `🔬 *Глубокий* — анализ с источниками\n` +
            `⚡ *Краткий* — максимально коротко\n` +
            `🎨 *Творческий* — свободный стиль\n` +
            `💻 *Код* — фокус на программировании`,
            { parse_mode: 'Markdown', reply_markup: getModeKeyboard(currentMode) }
        );
    });

    // ── /help ─────────────────────────────────────────────────────────────
    bot.command('help', async (ctx) => {
        await ctx.reply(
            `📚 *NEXUM — Команды*\n\n` +
            `*Основное:*\n` +
            `/start — главное меню\n` +
            `/new — новый чат (очистить историю)\n` +
            `/mode — переключить режим общения\n` +
            `/status — мой план и статистика\n\n` +
            `*Инструменты:*\n` +
            `/search <запрос> — поиск в интернете\n` +
            `/remind <текст> <минуты> — напоминание\n` +
            `/reminders — активные напоминания\n\n` +
            `*Память:*\n` +
            `/memory — что NEXUM помнит обо мне\n` +
            `/forget — очистить память\n\n` +
            `*Настройки:*\n` +
            `/lang ru|en — язык\n` +
            `/byok — добавить свой API ключ\n` +
            `/tariffs — тарифы и подписка\n` +
            `/apps — Mini Apps`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── /status ───────────────────────────────────────────────────────────
    bot.command('status', async (ctx) => {
        const uid = ctx.from!.id;
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];
        const mode = getUserMode(uid);
        const modeInfo = MODES[mode];
        const { agentConnections } = await import('../../index');

        await ctx.reply(
            `📊 *Статус NEXUM*\n\n` +
            `👤 *${ctx.from?.first_name || 'User'}* (\`${uid}\`)\n` +
            `${plan.emoji} План: *${plan.name}*\n` +
            `💬 Сегодня: *${user?.msg_count_today || 0}/${plan.limit}* сообщений\n` +
            `${modeInfo.emoji} Режим: *${modeInfo.name}*\n` +
            `🖥 PC Агент: *${agentConnections.has(uid) ? '🟢 Online' : '🔴 Offline'}*\n` +
            `🌍 Язык: *${user?.lang || 'ru'}*`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── /apps ─────────────────────────────────────────────────────────────
    bot.command('apps', async (ctx) => {
        const uid = ctx.from!.id;
        await ctx.reply(
            `📱 *NEXUM Mini Apps*\n\nВыбери приложение:`,
            { parse_mode: 'Markdown', reply_markup: getAppsKeyboard(uid) }
        );
    });

    // ── /memory ───────────────────────────────────────────────────────────
    bot.command('memory', async (ctx) => {
        const uid = ctx.from!.id;
        const facts = KnowledgeGraph.listFacts(uid);
        if (!facts.length) {
            await ctx.reply(
                '🧠 Память пуста.\n\nРасскажи мне что-нибудь о себе — я запомню.',
                { parse_mode: 'Markdown' }
            );
        } else {
            const text = facts.map(f => `• *${f.key}*: ${f.value}`).join('\n');
            await ctx.reply(`🧠 *Что я о тебе помню:*\n\n${text}`, { parse_mode: 'Markdown' });
        }
    });

    // ── /forget ───────────────────────────────────────────────────────────
    bot.command('forget', async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare("DELETE FROM memory WHERE uid = ?").run(uid);
        await ctx.reply('🗑 *Память очищена.*', { parse_mode: 'Markdown' });
    });

    // ── /search ───────────────────────────────────────────────────────────
    bot.command('search', async (ctx) => {
        const query = ctx.match?.trim();
        if (!query) {
            await ctx.reply('Использование: `/search <запрос>`', { parse_mode: 'Markdown' });
            return;
        }
        const msg = await ctx.reply('🔍 Ищу...');
        try {
            const result = await webSearchFormatted(query);
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, result, { parse_mode: 'Markdown' })
                .catch(() => ctx.reply(result));
        } catch {
            await ctx.reply('❌ Поиск недоступен. Проверь `SERPER_KEY` в конфиге.', { parse_mode: 'Markdown' });
        }
    });

    // ── /remind ───────────────────────────────────────────────────────────
    bot.command('remind', async (ctx) => {
        const uid = ctx.from!.id;
        const parts = ctx.match?.trim().split(/\s+/) || [];
        const minutes = parseInt(parts[parts.length - 1]);
        if (isNaN(minutes) || parts.length < 2) {
            await ctx.reply('Формат: `/remind Текст 30` (30 = через сколько минут)', { parse_mode: 'Markdown' });
            return;
        }
        const text = parts.slice(0, -1).join(' ');
        const fireAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        db.prepare('INSERT INTO reminders (chat_id, text, fire_at) VALUES (?, ?, ?)').run(ctx.chat.id, text, fireAt);
        await ctx.reply(`⏰ *Напоминание:* "${text}" — через ${minutes} мин.`, { parse_mode: 'Markdown' });
    });

    // ── /reminders ────────────────────────────────────────────────────────
    bot.command('reminders', async (ctx) => {
        const rows = db.prepare(
            "SELECT * FROM reminders WHERE chat_id = ? AND done = 0 ORDER BY fire_at ASC LIMIT 10"
        ).all(ctx.chat.id) as any[];
        if (!rows.length) {
            await ctx.reply('📭 Нет активных напоминаний.');
            return;
        }
        const list = rows.map((r, i) =>
            `${i + 1}. ⏰ ${r.text}\n    📅 ${new Date(r.fire_at).toLocaleString('ru-RU')}`
        ).join('\n\n');
        await ctx.reply(`⏰ *Активные напоминания:*\n\n${list}`, { parse_mode: 'Markdown' });
    });

    // ── /tariffs ──────────────────────────────────────────────────────────
    bot.command('tariffs', async (ctx) => {
        await ctx.reply(
            `💎 *Тарифы NEXUM*\n\n` +
            `🆓 *Free* — бесплатно\n50 сообщений/день\nБазовый AI, память, задачи, финансы\n\n` +
            `⚡ *Middle* — скоро\n200 сообщений/день\n+ Голосовые, напоминания, все приложения\n\n` +
            `💎 *Pro* — скоро\nБез ограничений\n+ PC Агент, BYOK, приоритетные модели\n\n` +
            `📩 Подключить: @nexum_support`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── /clear ────────────────────────────────────────────────────────────
    bot.command('clear', async (ctx) => {
        const uid = ctx.from!.id;
        const { clearSession } = await import('../../state/session');
        clearSession(uid);
        await ctx.reply('История очищена. /new для нового чата.');
    });

    // ── /lang ─────────────────────────────────────────────────────────────
    bot.command('lang', async (ctx) => {
        const uid = ctx.from!.id;
        const lang = ctx.match?.trim().toLowerCase();
        if (lang !== 'ru' && lang !== 'en') {
            await ctx.reply('🌍 Выбери язык:\n/lang ru — Русский\n/lang en — English');
            return;
        }
        db.prepare('UPDATE users SET lang = ? WHERE uid = ?').run(lang, uid);
        await ctx.reply(lang === 'ru' ? '🇷🇺 Язык: Русский' : '🇺🇸 Language: English');
    });

    // ── Callback query router ─────────────────────────────────────────────
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith('cmd:') && !data.startsWith('set_mode:')) return;
        const uid = ctx.from!.id;
        await ctx.answerCallbackQuery();

        // ── Mode switching ───────────────────────────────────────────────
        if (data.startsWith('set_mode:')) {
            const newMode = data.replace('set_mode:', '') as ChatMode;
            if (!MODES[newMode]) return;
            setUserMode(uid, newMode);
            const info = MODES[newMode];
            await ctx.editMessageText(
                `${info.emoji} *Режим изменён: ${info.name}*\n\n${info.desc}\n\nПросто напиши сообщение — отвечу в новом режиме.`,
                { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('↩️ Назад', 'cmd:mode_menu') }
            ).catch(async () => {
                await ctx.reply(`${info.emoji} Режим изменён: *${info.name}*`, { parse_mode: 'Markdown' });
            });
            return;
        }

        const cmd = data.replace('cmd:', '');

        if (cmd === 'back_main') {
            await ctx.editMessageText(
                `✦ Главное меню *NEXUM*`,
                { parse_mode: 'Markdown', reply_markup: getMainKeyboard(uid) }
            ).catch(() => ctx.reply('Главное меню:', { reply_markup: getMainKeyboard(uid) }));
            return;
        }

        if (cmd === 'status') {
            const user = getUser(uid);
            const plan = PLANS[user?.subscription_plan || 'free'];
            const mode = getUserMode(uid);
            const modeInfo = MODES[mode];
            await ctx.reply(
                `📊 *Статус*\n\n` +
                `👤 \`${uid}\`\n` +
                `${plan.emoji} *${plan.name}* · ${user?.msg_count_today || 0}/${plan.limit} сообщений\n` +
                `${modeInfo.emoji} Режим: *${modeInfo.name}*`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (cmd === 'memory') {
            const facts = KnowledgeGraph.listFacts(uid);
            if (!facts.length) {
                await ctx.reply('🧠 Память пуста. Расскажи мне что-нибудь о себе!');
            } else {
                const text = facts.map(f => `• *${f.key}*: ${f.value}`).join('\n');
                await ctx.reply(`🧠 *Память:*\n\n${text}`, { parse_mode: 'Markdown' });
            }
            return;
        }

        if (cmd === 'mode_menu') {
            const currentMode = getUserMode(uid);
            const info = MODES[currentMode];
            await ctx.reply(
                `🎭 *Режим общения*\n\nСейчас: ${info.emoji} *${info.name}*\n${info.desc}`,
                { parse_mode: 'Markdown', reply_markup: getModeKeyboard(currentMode) }
            );
            return;
        }

        if (cmd === 'apps') {
            await ctx.reply(
                `📱 *Mini Apps*\n\nВыбери приложение:`,
                { parse_mode: 'Markdown', reply_markup: getAppsKeyboard(uid) }
            );
            return;
        }

        if (cmd === 'tariffs') {
            await ctx.reply(
                `💎 *Тарифы NEXUM*\n\n` +
                `🆓 *Free* — 50 сообщений/день\n` +
                `⚡ *Middle* — 200 сообщений/день\n` +
                `💎 *Pro* — без ограничений\n\n` +
                `📩 @nexum_support`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (cmd === 'help') {
            await ctx.reply(
                `📚 *Команды NEXUM*\n\n` +
                `/start · /new · /mode · /status\n` +
                `/search · /remind · /memory · /forget\n` +
                `/apps · /tariffs · /lang · /byok`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (cmd === 'pc_status') {
            const { agentConnections } = await import('../../index');
            const connected = agentConnections.has(uid);
            await ctx.reply(
                connected
                    ? '🟢 *PC Агент подключён* и готов к работе.'
                    : '🔴 *PC Агент не подключён.*\n\n/link_pc — подключить агент.',
                { parse_mode: 'Markdown' }
            );
            return;
        }
    });
}
