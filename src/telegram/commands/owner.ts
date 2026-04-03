/**
 * OWNER-ONLY команды — видны и доступны только владельцу (ADMIN_IDS из env).
 * Управление подписками, пользователями, рассылкой, статистикой.
 */
import { Bot } from 'grammy';
import { isOwner } from '../../core/config';
import db from '../../core/db';
import { Logger } from '../../infra/logger';

const VALID_PLANS = ['free', 'middle', 'pro'];

function ownerOnly(uid: number | undefined): boolean {
    return !!uid && isOwner(uid);
}

export function setupOwnerCommands(bot: Bot) {

    // /owner — панель управления
    bot.command('owner', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        await ctx.reply(
            '👑 NEXUM OWNER PANEL\n\n' +
            '━━ Подписки ━━\n' +
            '/sub_give <uid> <plan> — выдать подписку\n' +
            '   Планы: free | middle | pro\n' +
            '/sub_revoke <uid> — сбросить на free\n' +
            '/sub_list — все активные подписки\n\n' +
            '━━ Пользователи ━━\n' +
            '/user_info <uid> — инфо о юзере\n' +
            '/user_list — последние 20 пользователей\n' +
            '/ban <uid> — заблокировать\n' +
            '/unban <uid> — разблокировать\n\n' +
            '━━ Система ━━\n' +
            '/stats — статистика бота\n' +
            '/broadcast <текст> — рассылка всем\n' +
            '/diag — диагностика провайдеров\n' +
            '/fix <описание> — автопатч бага\n'
        );
    });

    // /sub_give <uid> <plan> — выдать подписку
    bot.command('sub_give', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const args = (ctx.match || '').trim().split(/\s+/);
        if (args.length < 2) {
            await ctx.reply('Использование: /sub_give <uid> <plan>\nПланы: free | middle | pro');
            return;
        }
        const targetUid = parseInt(args[0]);
        const plan = args[1].toLowerCase();
        if (isNaN(targetUid)) { await ctx.reply('❌ Неверный UID'); return; }
        if (!VALID_PLANS.includes(plan)) { await ctx.reply(`❌ Неверный план. Доступно: ${VALID_PLANS.join(', ')}`); return; }

        const exists = db.prepare('SELECT uid FROM users WHERE uid=?').get(targetUid);
        if (!exists) {
            db.prepare('INSERT OR IGNORE INTO users (uid, subscription_plan) VALUES (?, ?)').run(targetUid, plan);
        } else {
            db.prepare('UPDATE users SET subscription_plan=? WHERE uid=?').run(plan, targetUid);
        }

        const planEmoji: Record<string, string> = { free: '🆓', middle: '⚡', pro: '💎' };
        Logger.info('owner', `Sub granted: uid=${targetUid} plan=${plan} by owner=${ctx.from!.id}`);
        await ctx.reply(`✅ Подписка выдана\nUID: ${targetUid}\nПлан: ${planEmoji[plan]} ${plan.toUpperCase()}`);

        // Уведомить пользователя
        try {
            const msgMap: Record<string, string> = {
                free: '🆓 Твой план сброшен до Free.',
                middle: '⚡ Поздравляем! Тебе выдан план Middle — 200 сообщений/день!',
                pro: '💎 Поздравляем! Тебе выдан план Pro — без ограничений!',
            };
            await ctx.api.sendMessage(targetUid, `🎉 NEXUM: ${msgMap[plan]}`);
        } catch { /* пользователь мог не запустить бота */ }
    });

    // /sub_revoke <uid> — сбросить подписку до free
    bot.command('sub_revoke', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const targetUid = parseInt((ctx.match || '').trim());
        if (isNaN(targetUid)) { await ctx.reply('❌ Укажи UID: /sub_revoke <uid>'); return; }
        db.prepare('UPDATE users SET subscription_plan=? WHERE uid=?').run('free', targetUid);
        Logger.info('owner', `Sub revoked: uid=${targetUid}`);
        await ctx.reply(`✅ Подписка uid=${targetUid} сброшена до Free.`);
        try { await ctx.api.sendMessage(targetUid, 'ℹ️ NEXUM: Твоя подписка была сброшена до Free.'); } catch {}
    });

    // /sub_list — все пользователи с non-free планом
    bot.command('sub_list', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const rows = db.prepare(
            `SELECT uid, username, first_name, subscription_plan FROM users WHERE subscription_plan != 'free' ORDER BY subscription_plan DESC LIMIT 50`
        ).all() as any[];
        if (!rows.length) { await ctx.reply('📋 Нет активных платных подписок.'); return; }
        const planEmoji: Record<string, string> = { free: '🆓', middle: '⚡', pro: '💎' };
        const text = rows.map(r =>
            `${planEmoji[r.subscription_plan] || '?'} ${r.subscription_plan.toUpperCase()} — ${r.first_name || 'N/A'} (@${r.username || 'no_username'}) [${r.uid}]`
        ).join('\n');
        await ctx.reply(`💳 Активные подписки (${rows.length}):\n\n${text}`);
    });

    // /user_info <uid> — подробная инфо о пользователе
    bot.command('user_info', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const targetUid = parseInt((ctx.match || '').trim());
        if (isNaN(targetUid)) { await ctx.reply('❌ Укажи UID: /user_info <uid>'); return; }
        const user = db.prepare('SELECT * FROM users WHERE uid=?').get(targetUid) as any;
        if (!user) { await ctx.reply(`❌ Пользователь ${targetUid} не найден в БД.`); return; }
        const memCount = (db.prepare('SELECT COUNT(*) as c FROM memory WHERE uid=?').get(targetUid) as any)?.c || 0;
        const planEmoji: Record<string, string> = { free: '🆓', middle: '⚡', pro: '💎' };
        await ctx.reply(
            `👤 Пользователь #${targetUid}\n\n` +
            `Имя: ${user.first_name || 'N/A'}\n` +
            `Username: @${user.username || 'нет'}\n` +
            `${planEmoji[user.subscription_plan] || '?'} Подписка: ${user.subscription_plan || 'free'}\n` +
            `💬 Сообщений сегодня: ${user.msg_count_today || 0}\n` +
            `🧠 Фактов в памяти: ${memCount}\n` +
            `🌍 Язык: ${user.lang || 'ru'}\n` +
            `🚫 Забанен: ${user.banned ? 'Да' : 'Нет'}\n` +
            `📅 Зарегистрирован: ${user.created_at || 'неизвестно'}`
        );
    });

    // /user_list — последние 20 пользователей
    bot.command('user_list', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const rows = db.prepare(
            'SELECT uid, username, first_name, subscription_plan, msg_count_today FROM users ORDER BY rowid DESC LIMIT 20'
        ).all() as any[];
        if (!rows.length) { await ctx.reply('Нет пользователей.'); return; }
        const planEmoji: Record<string, string> = { free: '🆓', middle: '⚡', pro: '💎' };
        const text = rows.map((r, i) =>
            `${i+1}. ${planEmoji[r.subscription_plan] || '🆓'} ${r.first_name || 'N/A'} (@${r.username || '–'}) [${r.uid}] — 💬${r.msg_count_today || 0}`
        ).join('\n');
        await ctx.reply(`👥 Последние пользователи (${rows.length}):\n\n${text}`);
    });

    // /ban <uid> — заблокировать пользователя
    bot.command('ban', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const targetUid = parseInt((ctx.match || '').trim());
        if (isNaN(targetUid)) { await ctx.reply('❌ Укажи UID: /ban <uid>'); return; }
        if (isOwner(targetUid)) { await ctx.reply('❌ Нельзя забанить владельца.'); return; }
        try {
            db.prepare('UPDATE users SET banned=1 WHERE uid=?').run(targetUid);
        } catch {
            // Если колонки banned нет — добавляем
            try {
                db.prepare('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0').run();
                db.prepare('UPDATE users SET banned=1 WHERE uid=?').run(targetUid);
            } catch {}
        }
        Logger.info('owner', `Banned uid=${targetUid}`);
        await ctx.reply(`🚫 Пользователь ${targetUid} заблокирован.`);
    });

    // /unban <uid>
    bot.command('unban', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const targetUid = parseInt((ctx.match || '').trim());
        if (isNaN(targetUid)) { await ctx.reply('❌ Укажи UID: /unban <uid>'); return; }
        db.prepare('UPDATE users SET banned=0 WHERE uid=?').run(targetUid);
        Logger.info('owner', `Unbanned uid=${targetUid}`);
        await ctx.reply(`✅ Пользователь ${targetUid} разблокирован.`);
    });

    // /stats — статистика
    bot.command('stats', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const total = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
        const free = (db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_plan='free'").get() as any)?.c || 0;
        const middle = (db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_plan='middle'").get() as any)?.c || 0;
        const pro = (db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_plan='pro'").get() as any)?.c || 0;
        const active = (db.prepare("SELECT COUNT(*) as c FROM users WHERE msg_count_today > 0").get() as any)?.c || 0;
        const totalMsgs = (db.prepare('SELECT SUM(msg_count_today) as s FROM users').get() as any)?.s || 0;
        await ctx.reply(
            `📊 Статистика NEXUM\n\n` +
            `👥 Всего пользователей: ${total}\n` +
            `🆓 Free: ${free}\n` +
            `⚡ Middle: ${middle}\n` +
            `💎 Pro: ${pro}\n\n` +
            `📈 Активных сегодня: ${active}\n` +
            `💬 Сообщений сегодня: ${totalMsgs}`
        );
    });

    // /broadcast <текст> — рассылка всем пользователям
    bot.command('broadcast', async (ctx) => {
        if (!ownerOnly(ctx.from?.id)) return;
        const text = (ctx.match || '').trim();
        if (!text) { await ctx.reply('Использование: /broadcast <текст>'); return; }

        const users = db.prepare('SELECT uid FROM users WHERE banned IS NULL OR banned=0').all() as any[];
        const msg = await ctx.reply(`📢 Рассылка ${users.length} пользователям...`);

        let sent = 0, failed = 0;
        for (const u of users) {
            try {
                await ctx.api.sendMessage(u.uid, `📢 Сообщение от NEXUM:\n\n${text}`);
                sent++;
                // Небольшая задержка чтобы не словить rate limit
                await new Promise(r => setTimeout(r, 50));
            } catch { failed++; }
        }

        await ctx.api.editMessageText(
            ctx.chat!.id, msg.message_id,
            `✅ Рассылка завершена\nОтправлено: ${sent}\nОшибок: ${failed}`
        ).catch(() => {});
    });
}
