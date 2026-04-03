import { Bot, InlineKeyboard } from 'grammy';
import { CONFIG, isOwner } from '../../core/config';
import { KnowledgeGraph } from '../../core/memory/knowledge_graph';
import { webSearchFormatted } from '../../tools/search';
import db from '../../core/db';

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

function getMainKeyboard(uid: number) {
    const baseUrl = CONFIG.WEBAPP_URL || 'https://nexum.railway.app';
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

export function setupGeneralCommands(bot: Bot) {

    bot.command('start', async (ctx) => {
        const uid = ctx.from!.id;
        const name = ctx.from?.first_name || 'друг';
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);

        const { setPersonalizedCommands } = await import('./index');
        await setPersonalizedCommands(bot, uid);

        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];
        await ctx.reply(
            `👋 Привет, ${name}! Я NEXUM — твой личный AI-агент.\n\n` +
            `${plan.emoji} Твой план: ${plan.name} (${plan.limit} сообщений/день)\n\n` +
            `Что умею:\n` +
            `🤖 Отвечать на вопросы и помогать с задачами\n` +
            `🧠 Запоминать важное о тебе\n` +
            `🔍 Искать актуальную информацию в сети\n` +
            `👁 Анализировать изображения (otprav' fото)\n` +
            `🖥 Управлять твоим компьютером (PC Агент)\n` +
            `📱 Mini Apps: задачи, финансы, заметки\n\n` +
            `Просто напиши мне что-нибудь!`,
            { reply_markup: getMainKeyboard(uid) }
        );
    });

    bot.command('help', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid) return;
        const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
        const plan = user?.subscription_plan || 'free';
        const owner = isOwner(uid);

        let helpText = '📚 NEXUM — Справка по командам\n\n';

        helpText += '🚀 Основные:\n';
        helpText += '/start — главное меню\n';
        helpText += '/help — эта справка\n';
        helpText += '/status — мой план и статистика\n';
        helpText += '/mode — режим ответов AI\n';
        helpText += '/apps — Mini Apps\n\n';

        helpText += '🧠 Память и навыки:\n';
        helpText += '/memory — что обо мне знает бот\n';
        helpText += '/skills — мои изученные навыки\n';
        helpText += '/profile — профиль личности\n';
        helpText += '/forget — очистить мою память\n\n';

        helpText += '🔍 Поиск и напоминания:\n';
        helpText += '/search <запрос> — поиск в интернете\n';
        helpText += '/remind <текст> через N мин\n';
        helpText += '/reminders — список напоминаний\n\n';

        helpText += '⚙️ Управление:\n';
        helpText += '/new — сбросить сессию\n';
        helpText += '/clear — очистить историю\n';
        helpText += '/tariffs — тарифы и подписки\n';
        helpText += '/lang ru|en — язык\n\n';

        if (plan === 'pro' || owner) {
            helpText += '💎 PRO:\n';
            helpText += '/byok — свои API ключи\n';
            helpText += '/link_pc — подключить PC Агент\n';
            helpText += '/pc_status — статус PC Агента\n';
            helpText += '/screenshot — снимок экрана с ПК\n\n';
        }

        if (owner) {
            helpText += '👑 OWNER — Управление ботом:\n';
            helpText += '/owner — панель управления\n';
            helpText += '/sub_give <uid> <plan> — выдать подписку\n';
            helpText += '/sub_revoke <uid> — сбросить подписку\n';
            helpText += '/sub_list — все подписки\n';
            helpText += '/user_info <uid> — инфо о юзере\n';
            helpText += '/broadcast <текст> — рассылка всем\n';
            helpText += '/stats — статистика бота\n';
            helpText += '/ban <uid> / /unban <uid>\n';
            helpText += '/diag — диагностика системы\n';
            helpText += '/fix <описание> — автоисправить баг\n\n';

            helpText += '💻 CODE:\n';
            helpText += '/code_read, /code_edit, /code_create\n';
            helpText += '/bash, /find, /tree, /grep\n';
            helpText += '/git_status, /git_diff, /git_commit\n';
        }

        helpText += '\n💬 Просто напиши мне что-нибудь для AI диалога!';

        await ctx.reply(helpText);
    });

    bot.command('status', async (ctx) => {
        const uid = ctx.from!.id;
        ensureUser(uid, ctx.from?.username, ctx.from?.first_name);
        const user = getUser(uid);
        const plan = PLANS[user?.subscription_plan || 'free'];
        const { agentConnections } = await import('../../index');
        await ctx.reply(
            `📊 Статус NEXUM\n\n` +
            `👤 ${ctx.from?.first_name || 'User'} (${uid})\n` +
            `${plan.emoji} План: ${plan.name}\n` +
            `💬 Сегодня: ${user?.msg_count_today || 0}/${plan.limit} сообщений\n` +
            `🖥 PC Агент: ${agentConnections.has(uid) ? '🟢 Online' : '🔴 Offline'}\n` +
            `🌍 Язык: ${user?.lang || 'ru'}`
        );
    });

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
        await ctx.reply(`📱 NEXUM Mini Apps\n\nВыбери приложение:`, { reply_markup: keyboard });
    });

    bot.command('new', async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare('DELETE FROM sessions WHERE uid = ?').run(uid);
        await ctx.reply('🔄 Сессия сброшена. Начинаем с чистого листа!');
    });

    bot.command('clear', async (ctx) => {
        const uid = ctx.from!.id;
        try { db.prepare('DELETE FROM messages WHERE uid = ?').run(uid); } catch {}
        await ctx.reply('🧹 История диалога очищена.');
    });

    bot.command('memory', async (ctx) => {
        const uid = ctx.from!.id;
        const facts = KnowledgeGraph.listFacts(uid);
        const ltm = db.prepare('SELECT compressed_summary, total_messages FROM long_term_memory WHERE uid=?').get(uid) as any;
        let text = `🧠 Память NEXUM о тебе\n\n`;
        if (ltm?.total_messages) text += `📊 Взаимодействий: ${ltm.total_messages}\n\n`;
        if (ltm?.compressed_summary) text += `📖 Сводка:\n${ltm.compressed_summary.slice(0, 500)}\n\n`;
        if (facts.length) {
            text += `🔹 Факты:\n` + facts.slice(0, 10).map((f: any) => `• ${f.key}: ${f.value}`).join('\n');
        } else {
            text += 'Фактов пока нет. Расскажи мне о себе!';
        }
        await ctx.reply(text);
    });

    bot.command('forget', async (ctx) => {
        const uid = ctx.from!.id;
        db.prepare('DELETE FROM memory WHERE uid=?').run(uid);
        db.prepare('DELETE FROM persistent_facts WHERE uid=?').run(uid);
        db.prepare('DELETE FROM long_term_memory WHERE uid=?').run(uid);
        db.prepare('DELETE FROM user_insights WHERE uid=?').run(uid);
        await ctx.reply('🗑 Вся память очищена.');
    });

    bot.command('search', async (ctx) => {
        const query = ctx.match?.trim() || '';
        if (!query) {
            await ctx.reply('🔍 Использование: /search ваш запрос');
            return;
        }
        const msg = await ctx.reply('🔍 Ищу...');
        try {
            const result = await webSearchFormatted(query);
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result)
                .catch(async () => ctx.reply(result));
        } catch {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, '❌ Ошибка поиска. Попробуй позже.').catch(() => {});
        }
    });

    bot.command('remind', async (ctx) => {
        const uid = ctx.from!.id;
        const args = ctx.match?.trim() || '';
        if (!args) {
            await ctx.reply(
                '⏰ Напоминание\n\nИспользование:\n/remind <текст> через N минут\n\n' +
                'Примеры:\n' +
                '/remind купить молоко через 30 минут\n' +
                '/remind позвонить клиенту через 2 часа'
            );
            return;
        }
        const patterns = [
            { re: /через\s+(\d+)\s*(минут|мин|м)/i, mult: 60000 },
            { re: /через\s+(\d+)\s*(час|ч)/i,        mult: 3600000 },
            { re: /in\s+(\d+)\s*(min|minute)/i,      mult: 60000 },
            { re: /in\s+(\d+)\s*(hour|h)/i,          mult: 3600000 },
        ];
        let ms = 0;
        for (const p of patterns) {
            const m = args.match(p.re);
            if (m) { ms = parseInt(m[1]) * p.mult; break; }
        }
        if (!ms) {
            await ctx.reply('❓ Не понял время. Напиши: /remind текст через N минут');
            return;
        }
        const reminderText = args.replace(/через\s+\d+\s*(минут|мин|час|часов|ч|min|hour|h)/i, '').trim() || args;
        const fireAt = new Date(Date.now() + ms).toISOString();
        db.prepare('INSERT INTO reminders (chat_id, uid, text, fire_at) VALUES (?, ?, ?, ?)').run(uid, uid, reminderText, fireAt);
        const minutes = Math.round(ms / 60000);
        await ctx.reply(`✅ Напомню через ${minutes < 60 ? minutes + ' мин' : Math.round(minutes/60) + ' ч'}:\n${reminderText}`);
    });

    bot.command('reminders', async (ctx) => {
        const uid = ctx.from!.id;
        const rows = db.prepare(
            `SELECT id, text, fire_at FROM reminders WHERE uid=? AND done=0 AND fire_at > datetime('now') ORDER BY fire_at LIMIT 10`
        ).all(uid) as any[];
        if (!rows.length) {
            await ctx.reply('📋 Активных напоминаний нет.');
            return;
        }
        const text = rows.map((r, i) => {
            const t = new Date(r.fire_at);
            const timeStr = t.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            return `${i+1}. ⏰ ${timeStr}\n   ${r.text.slice(0, 80)}`;
        }).join('\n\n');
        await ctx.reply(`📋 Твои напоминания:\n\n${text}`);
    });

    bot.command('tariffs', async (ctx) => {
        await ctx.reply(
            `💎 Тарифы NEXUM\n\n` +
            `🆓 Free — 50 сообщений/день\nБазовый AI, память, задачи\n\n` +
            `⚡ Middle — 200 сообщений/день\n+ Напоминания, голос, Mini Apps, навыки\n\n` +
            `💎 Pro — без ограничений\n+ PC Агент, свои API ключи, приоритетные модели`
        );
    });

    bot.command('lang', async (ctx) => {
        const uid = ctx.from!.id;
        const lang = ctx.match?.trim() || '';
        if (!lang || !['ru', 'en'].includes(lang)) {
            await ctx.reply('🌍 Использование: /lang ru или /lang en');
            return;
        }
        db.prepare('UPDATE users SET lang=? WHERE uid=?').run(lang, uid);
        await ctx.reply(lang === 'ru' ? '✅ Язык: Русский' : '✅ Language: English');
    });
}

export async function handleMainMenuCallback(data: string, uid: number, ctx: any) {
    const cmd = data.replace('cmd:', '');

    if (cmd === 'status') {
        const user = db.prepare('SELECT * FROM users WHERE uid=?').get(uid) as any;
        const PLAN = PLANS[user?.subscription_plan || 'free'];
        const { agentConnections } = await import('../../index');
        await ctx.reply(
            `📊 Твой статус\n\n` +
            `${PLAN.emoji} План: ${PLAN.name}\n` +
            `💬 Сообщений сегодня: ${user?.msg_count_today || 0}/${PLAN.limit}\n` +
            `🖥 PC Агент: ${agentConnections.has(uid) ? '🟢 Online' : '🔴 Offline'}\n` +
            `🌍 Язык: ${user?.lang || 'ru'}`
        );
    } else if (cmd === 'memory') {
        const facts = KnowledgeGraph.listFacts(uid);
        if (!facts.length) {
            await ctx.reply('🧠 Память пуста. Расскажи мне что-нибудь о себе!');
        } else {
            const text = facts.map((f: any) => `• ${f.key}: ${f.value}`).join('\n');
            await ctx.reply(`🧠 Что я о тебе знаю:\n\n${text}`);
        }
    } else if (cmd === 'pc_status') {
        const { agentConnections } = await import('../../index');
        const connected = agentConnections.has(uid);
        await ctx.reply(
            connected
                ? '🟢 PC Агент подключён и готов к работе.'
                : '🔴 PC Агент не подключён.\n\nИспользуй /link_pc чтобы подключить агент на своём компьютере.'
        );
    } else if (cmd === 'settings') {
        const user = db.prepare('SELECT * FROM users WHERE uid=?').get(uid) as any;
        await ctx.reply(
            `⚙️ Настройки\n\n` +
            `🌍 Язык: ${user?.lang || 'ru'}\n` +
            `Изменить: /lang ru  |  /lang en\n\n` +
            `🔑 API ключи: /byok\n` +
            `💎 Тариф: /tariffs`
        );
    } else if (cmd === 'tariffs') {
        await ctx.reply(
            `💎 Тарифы NEXUM\n\n` +
            `🆓 Free — 50 сообщений/день\n` +
            `⚡ Middle — 200 сообщений/день\n` +
            `💎 Pro — без ограничений`
        );
    } else if (cmd === 'help') {
        await ctx.reply(
            `📚 NEXUM — Справка\n\n` +
            `/start /status /mode /apps\n` +
            `/memory /skills /profile\n` +
            `/search /remind /reminders\n` +
            `/byok /link_pc /tariffs`
        );
    }
}
