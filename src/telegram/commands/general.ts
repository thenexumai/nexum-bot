import { Bot, InlineKeyboard } from 'grammy';
import { CONFIG } from '../../core/config';
import { KnowledgeGraph } from '../../core/memory/knowledge_graph';
import { webSearchFormatted } from '../../tools/search'; // ✅ FIXED: returns string, not WebSearchResult[]
import db from '../../core/db';

// ============================================================
//  PLAN INFO
// ============================================================
const PLANS: Record<string, { name: string; limit: number; emoji: string }> = {
    free:   { name: 'Free',   limit: 50,   emoji: '🆓' },
    middle: { name: 'Middle', limit: 200,  emoji: '⚡' },
    pro:    { name: 'Pro',    limit: 9999, emoji: '💎' },
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

// ============================================================
//  WELCOME KEYBOARD (Ecosystem Hub)
// ============================================================
function getMainKeyboard(uid: number) {
    const baseUrl = CONFIG.WEBAPP_URL || `https://nexum.railway.app`;
    return new InlineKeyboard()
        .webApp('📱 Mini Apps', `${baseUrl}/index.html?uid=${uid}`)
        .row()
        .text('📊 Мой статус', 'cmd:status')
        .text('🧠 Память', 'cmd:memory')
        .row()
        .text('🖥 PC Агент', 'cmd:pc_status')
        .text('⚙️ Настройки', 'cmd:settings')
        .row()
        .text('💎 Тарифы', 'cmd:tariffs')
        .text('❓ Помощь', 'cmd:help');
}

// ============================================================
//  COMMANDS
// ============================================================

export function setupGeneralCommands(bot: Bot) {

    // /start — welcome + ecosystem hub
    bot.command('start', async (ctx) => {
        const uid = ctx.from!.id;
        const name = ctx.from?.first_name || 'друг';
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];

        await ctx.reply(
            `👋 Привет, *${name}*! Я **NEXUM** — твой личный AI-агент.\n\n` +
            `${plan.emoji} Твой план: *${plan.name}* (${plan.limit} сообщений/день)\n\n` +
            `Что умею:\n` +
            `🤖 Отвечать на вопросы и помогать с задачами\n` +
            `🧠 Запоминать важное о тебе\n` +
            `🔍 Искать актуальную информацию в сети\n` +
            `🖥 Управлять твоим компьютером (PC Агент)\n` +
            `📱 Mini Apps: задачи, финансы, заметки\n\n` +
            `Просто напиши мне что-нибудь!`,
            { parse_mode: 'Markdown', reply_markup: getMainKeyboard(uid) }
        );
    });

    // Callback кнопки главного меню
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith('cmd:')) return;

        const uid = ctx.from!.id;
        const cmd = data.replace('cmd:', '');

        await ctx.answerCallbackQuery();

        if (cmd === 'status') {
            const user = getUser(uid);
            const plan = PLANS[user?.subscription_plan || 'free'];
            await ctx.reply(
                `📊 *Твой статус*\n\n` +
                `👤 ID: \`${uid}\`\n` +
                `${plan.emoji} План: *${plan.name}*\n` +
                `💬 Сообщений сегодня: *${user?.msg_count_today || 0}/${plan.limit}*\n` +
                `🌍 Язык: *${user?.lang || 'ru'}*`,
                { parse_mode: 'Markdown' }
            );
        }

        if (cmd === 'memory') {
            const facts = KnowledgeGraph.listFacts(uid);
            if (!facts.length) {
                await ctx.reply('🧠 Память пуста. Расскажи мне что-нибудь о себе!');
            } else {
                const text = facts.map(f => `• *${f.key}*: ${f.value}`).join('\n');
                await ctx.reply(`🧠 *Что я о тебе знаю:*\n\n${text}`, { parse_mode: 'Markdown' });
            }
        }

        if (cmd === 'help') {
            await ctx.reply(
                `📚 *NEXUM — Справка*\n\n` +
                `*Основные команды:*\n` +
                `/start — главное меню\n` +
                `/apps — Mini Apps (задачи, финансы, заметки)\n` +
                `/status — мой план и статистика\n` +
                `/new — сбросить историю диалога\n\n` +
                `*Память:*\n` +
                `/memory — что NEXUM знает обо мне\n` +
                `/forget — очистить память\n\n` +
                `*Инструменты:*\n` +
                `/search <запрос> — поиск в сети\n` +
                `/remind <текст> <минуты> — напоминание\n` +
                `/link_pc — подключить PC Агент\n` +
                `/screenshot — снимок экрана PC\n\n` +
                `*Pro функции:*\n` +
                `/byok — добавить свой API ключ\n` +
                `/tariffs — информация о тарифах`,
                { parse_mode: 'Markdown' }
            );
        }

        if (cmd === 'pc_status') {
            const { agentConnections } = await import('../../index');
            const connected = agentConnections.has(uid);
            await ctx.reply(
                connected
                    ? '🟢 *PC Агент подключён* и готов к работе.'
                    : '🔴 *PC Агент не подключён.*\n\nИспользуй /link_pc чтобы подключить агент на своём компьютере.',
                { parse_mode: 'Markdown' }
            );
        }

        if (cmd === 'settings') {
            const user = getUser(uid);
            await ctx.reply(
                `⚙️ *Настройки*\n\n` +
                `🌍 Язык: *${user?.lang || 'ru'}*\n` +
                `Изменить: /lang ru  |  /lang en\n\n` +
                `🔑 API ключи: /byok\n` +
                `💎 Тариф: /tariffs`,
                { parse_mode: 'Markdown' }
            );
        }

        if (cmd === 'tariffs') {
            await ctx.reply(
                `💎 *Тарифы NEXUM*\n\n` +
                `🆓 *Free* — 50 сообщений/день\n` +
                `Базовый AI, память, задачи\n\n` +
                `⚡ *Middle* — 200 сообщений/день\n` +
                `+ Напоминания, голосовые сообщения, Mini Apps\n\n` +
                `💎 *Pro* — без ограничений\n` +
                `+ PC Агент, свои API ключи, приоритетные модели\n\n` +
                `📩 Для подключения: @nexum_support`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    // /help command
    bot.command('help', async (ctx) => {
        const uid = ctx.from!.id;
        await ctx.reply(
            `📚 *NEXUM — Помощь*\n\n` +
            `/start — главное меню и Mini Apps\n` +
            `/status — мой план\n` +
            `/apps — открыть приложения\n` +
            `/memory — моя память\n` +
            `/search <запрос> — поиск\n` +
            `/link_pc — PC Агент\n` +
            `/byok — свои API ключи\n` +
            `/tariffs — тарифы`,
            { parse_mode: 'Markdown' }
        );
    });

    // /status command
    bot.command('status', async (ctx) => {
        const uid = ctx.from!.id;
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];
        const { agentConnections } = await import('../../index');

        await ctx.reply(
            `📊 *Статус NEXUM*\n\n` +
            `👤 *${ctx.from?.first_name || 'User'}* (\`${uid}\`)\n` +
            `${plan.emoji} План: *${plan.name}*\n` +
            `💬 Сегодня: *${user?.msg_count_today || 0}/${plan.limit}* сообщений\n` +
            `🖥 PC Агент: *${agentConnections.has(uid) ? '🟢 Online' : '🔴 Offline'}*\n` +
            `🌍 Язык: *${user?.lang || 'ru'}*`,
            { parse_mode: 'Markdown' }
        );
    });

    // /apps command — Mini Apps hub
    bot.command('apps', async (ctx) => {
        const uid = ctx.from!.id;
        const base = CONFIG.WEBAPP_URL || 'https://nexum.railway.app';

        const keyboard = new InlineKeyboard()
            .webApp('✅ Задачи',    `${base}/tasks.html?uid=${uid}`)
            .webApp('💰 Финансы',   `${base}/finance.html?uid=${uid}`)
            .row()
            .webApp('📝 Заметки',   `${base}/notes.html?uid=${uid}`)
            .webApp('📅 Календарь', `${base}/calendar.html?uid=${uid}`)
            .row()
            .webApp('💪 Привычки',  `${base}/habits.html?uid=${uid}`)
            .webApp('📇 Контакты',  `${base}/contacts.html?uid=${uid}`)
            .row()
            .webApp('⚙️ Настройки', `${base}/settings.html?uid=${uid}`);

        await ctx.reply(
            `📱 *NEXUM Mini Apps*\n\nВыбери приложение:`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    });

    // /new — reset session
    bot.command('new', async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare('DELETE FROM sessions WHERE uid = ?').run(uid);
        await ctx.reply('🔄 *Сессия сброшена.* Начинаем с чистого листа!', { parse_mode: 'Markdown' });
    });

    // /memory — show known facts
    bot.command('memory', async (ctx) => {
        const uid = ctx.from!.id;
        const facts = KnowledgeGraph.listFacts(uid);
        if (!facts.length) {
            await ctx.reply('🧠 Память пуста. Расскажи мне что-нибудь о себе!');
        } else {
            const text = facts.map(f => `• *${f.key}*: ${f.value}`).join('\n');
            await ctx.reply(`🧠 *Моя память о тебе:*\n\n${text}`, { parse_mode: 'Markdown' });
        }
    });

    // /forget — clear memory
    bot.command('forget', async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare("DELETE FROM memory WHERE uid = ?").run(uid);
        await ctx.reply('🗑 *Память очищена.*', { parse_mode: 'Markdown' });
    });

    // /search — quick web search
    bot.command('search', async (ctx) => {
        const query = ctx.match?.trim();
        if (!query) {
            await ctx.reply('Использование: /search <запрос>');
            return;
        }
        const msg = await ctx.reply('🔍 Ищу...');
        try {
            const result = await webSearchFormatted(query); // ✅ FIXED
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, result, { parse_mode: 'Markdown' })
                .catch(() => ctx.reply(result));
        } catch {
            await ctx.reply('❌ Поиск недоступен. Проверь SERPER_KEY в конфиге.');
        }
    });

    // /remind
    bot.command('remind', async (ctx) => {
        const uid = ctx.from!.id;
        const parts = ctx.match?.trim().split(/\s+/) || [];
        const minutes = parseInt(parts[parts.length - 1]);
        if (isNaN(minutes) || parts.length < 2) {
            await ctx.reply('Формат: /remind Текст напоминания 30\n(30 = через сколько минут)');
            return;
        }
        const text = parts.slice(0, -1).join(' ');
        const fireAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        db.prepare('INSERT INTO reminders (chat_id, text, fire_at) VALUES (?, ?, ?)').run(ctx.chat.id, text, fireAt);
        await ctx.reply(`⏰ *Напоминание установлено*\n"${text}"\nчерез ${minutes} мин.`, { parse_mode: 'Markdown' });
    });

    // /reminders
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

    // /tariffs
    bot.command('tariffs', async (ctx) => {
        await ctx.reply(
            `💎 *Тарифы NEXUM*\n\n` +
            `🆓 *Free* — бесплатно\n50 сообщений/день\nБазовый AI, задачи, заметки, финансы\n\n` +
            `⚡ *Middle* — скоро\n200 сообщений/день\n+ Голосовые сообщения, напоминания\n\n` +
            `💎 *Pro* — скоро\nБез ограничений\n+ PC Агент, свои API ключи (BYOK)\n+ Приоритетные AI модели\n\n` +
            `📩 По вопросам подписки: @nexum_support`,
            { parse_mode: 'Markdown' }
        );
    });

    // /lang
    bot.command('lang', async (ctx) => {
        const uid = ctx.from!.id;
        const lang = ctx.match?.trim().toLowerCase();
        if (lang !== 'ru' && lang !== 'en') {
            await ctx.reply('🌍 Выбери язык:\n/lang ru — Русский\n/lang en — English');
            return;
        }
        db.prepare('UPDATE users SET lang = ? WHERE uid = ?').run(lang, uid);
        await ctx.reply(lang === 'ru' ? '🇷🇺 Язык изменён на Русский' : '🇺🇸 Language changed to English');
    });
}
