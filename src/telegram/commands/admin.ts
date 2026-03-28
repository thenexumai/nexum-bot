import type { Bot, Context } from 'grammy';
import { config, isAdmin } from '../../core/config';
import { db } from '../../core/db';
import { setUserTariff, getUserTariff, type TariffPlan } from '../../core/billing';
import { t } from '../../i18n/index';

// ── Subscription helpers ──────────────────────────────────────────────────────

interface SubscriptionRow {
  tariff: string;
  sub_expires_at: string | null;
  username: string | null;
  first_name: string | null;
}

/** Ensure the sub_expires_at column exists (idempotent migration). */
function ensureSubExpires(): void {
  try {
    db.prepare(`ALTER TABLE users ADD COLUMN sub_expires_at TEXT`).run();
  } catch {
    // Column already exists — ignore
  }
}

function grantSubscription(targetUid: number, plan: TariffPlan, days: number): void {
  ensureSubExpires();
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  setUserTariff(targetUid, plan);
  db.prepare(`
    UPDATE users SET sub_expires_at = ?, updated_at = datetime('now') WHERE uid = ?
  `).run(expiresAt, targetUid);
  // Ensure user row exists even if they haven't started the bot yet
  db.prepare(`
    INSERT INTO users (uid, tariff, sub_expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      tariff = excluded.tariff,
      sub_expires_at = excluded.sub_expires_at,
      updated_at = datetime('now')
  `).run(targetUid, plan, expiresAt);
}

function revokeSubscription(targetUid: number): void {
  ensureSubExpires();
  setUserTariff(targetUid, 'free');
  db.prepare(`
    UPDATE users SET sub_expires_at = NULL, updated_at = datetime('now') WHERE uid = ?
  `).run(targetUid);
}

function getSubscriptionInfo(targetUid: number): SubscriptionRow | undefined {
  ensureSubExpires();
  return db.prepare(`
    SELECT tariff, sub_expires_at, username, first_name FROM users WHERE uid = ?
  `).get(targetUid) as SubscriptionRow | undefined;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'без срока';
  const d = new Date(expiresAt);
  const now = new Date();
  if (d < now) return `истекла (${d.toLocaleDateString('ru-RU')})`;
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  return `до ${d.toLocaleDateString('ru-RU')} (ещё ${days} д.)`;
}

// ── Register commands ─────────────────────────────────────────────────────────

export function registerAdminCommands(bot: Bot): void {

  // ── /admin_stats ─────────────────────────────────────────────────────────
  bot.command('admin_stats', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;
    const today  = new Date().toISOString().split('T')[0];
    const users  = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    const msgs   = (db.prepare('SELECT COUNT(*) AS c FROM conversations').get() as { c: number }).c;
    const active = (db.prepare(`SELECT COUNT(DISTINCT uid) AS c FROM conversations WHERE date(created_at)=?`).get(today) as { c: number }).c;
    const plans  = db.prepare('SELECT tariff, COUNT(*) AS c FROM users GROUP BY tariff').all() as { tariff: string; c: number }[];

    await ctx.reply(
      `${t(uid, 'admin.stats.title')}\n\n` +
      `${t(uid, 'admin.stats.users', { total: String(users), active: String(active) })}\n` +
      `${t(uid, 'admin.stats.messages', { count: String(msgs) })}\n` +
      `Plans: ${plans.map(p => `${p.tariff}:${p.c}`).join(' | ')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /broadcast ───────────────────────────────────────────────────────────
  bot.command('broadcast', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;
    const text = (ctx.message?.text ?? '').replace('/broadcast', '').trim();
    if (!text) { await ctx.reply(t(uid, 'admin.broadcast.usage')); return; }

    const users = db.prepare('SELECT uid FROM users').all() as { uid: number }[];
    let sent = 0, failed = 0;
    for (const u of users) {
      try { await bot.api.sendMessage(u.uid, text); sent++; }
      catch { failed++; }
      await new Promise(r => setTimeout(r, 50));
    }
    await ctx.reply(t(uid, 'admin.broadcast.done', { sent: String(sent), failed: String(failed) }));
  });

  // ── /approve (legacy, keep for compatibility) ─────────────────────────────
  bot.command('approve', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;
    const parts = (ctx.message?.text ?? '').split(' ');
    if (parts.length < 3) { await ctx.reply(t(uid, 'admin.approve.usage')); return; }

    const targetUid = parseInt(parts[1], 10);
    const plan      = parts[2] as TariffPlan;
    if (isNaN(targetUid)) { await ctx.reply(t(uid, 'admin.approve.invalid_uid')); return; }
    if (!['free', 'middle', 'pro'].includes(plan)) { await ctx.reply(t(uid, 'admin.approve.invalid_plan')); return; }

    setUserTariff(targetUid, plan);
    await ctx.reply(`✅ ${t(uid, 'admin.approve.done', { uid: String(targetUid), plan })}`, { parse_mode: 'Markdown' });
    await bot.api.sendMessage(targetUid, t(targetUid, 'admin.approve.notify', { plan: plan.toUpperCase() }), { parse_mode: 'Markdown' }).catch(() => {});
  });

  // ── /admin_keys ───────────────────────────────────────────────────────────
  bot.command('admin_keys', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;
    const providers = (Object.entries(config.ai) as [string, readonly string[]][])
      .filter(([, k]) => k.length).map(([p, k]) => `${p}: ${k.length}`);
    const serper = `serper: ${config.serper.length}`;
    await ctx.reply(`${t(uid, 'admin.keys.title')}\n\n${[...providers, serper].join('\n')}`, { parse_mode: 'Markdown' });
  });

  // ── /grant USER_ID PLAN DAYS ──────────────────────────────────────────────
  bot.command('grant', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;

    const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
    // parts: ['/grant', 'USER_ID', 'PLAN', 'DAYS']
    if (parts.length < 4) {
      await ctx.reply(
        '❌ *Использование:* `/grant USER_ID PLAN DAYS`\n\n' +
        'Планы: `free` | `middle` | `pro`\n' +
        'Пример: `/grant 123456789 pro 30`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const targetUid = parseInt(parts[1], 10);
    const plan      = parts[2].toLowerCase() as TariffPlan;
    const days      = parseInt(parts[3], 10);

    if (isNaN(targetUid) || targetUid <= 0) {
      await ctx.reply('❌ Некорректный USER_ID.'); return;
    }
    if (!['free', 'middle', 'pro'].includes(plan)) {
      await ctx.reply('❌ Некорректный план. Доступны: `free`, `middle`, `pro`', { parse_mode: 'Markdown' }); return;
    }
    if (isNaN(days) || days <= 0) {
      await ctx.reply('❌ Количество дней должно быть положительным числом.'); return;
    }

    grantSubscription(targetUid, plan, days);

    const expiresAt = new Date(Date.now() + days * 86_400_000).toLocaleDateString('ru-RU');
    await ctx.reply(
      `✅ Подписка выдана\n\n` +
      `👤 UID: \`${targetUid}\`\n` +
      `📦 План: *${plan.toUpperCase()}*\n` +
      `📅 До: ${expiresAt} (${days} дн.)`,
      { parse_mode: 'Markdown' }
    );

    // Notify the user
    await bot.api.sendMessage(
      targetUid,
      `🎉 Вам выдана подписка *${plan.toUpperCase()}* на ${days} дней!\n\nДействует до ${expiresAt}.\nПриятного использования NEXUM! 🚀`,
      { parse_mode: 'Markdown' }
    ).catch(() => {}); // user may not have started the bot
  });

  // ── /revoke USER_ID ───────────────────────────────────────────────────────
  bot.command('revoke', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;

    const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ *Использование:* `/revoke USER_ID`', { parse_mode: 'Markdown' });
      return;
    }

    const targetUid = parseInt(parts[1], 10);
    if (isNaN(targetUid) || targetUid <= 0) {
      await ctx.reply('❌ Некорректный USER_ID.'); return;
    }

    const info = getSubscriptionInfo(targetUid);
    const prevPlan = info?.tariff ?? 'free';

    revokeSubscription(targetUid);

    await ctx.reply(
      `✅ Подписка отменена\n\n` +
      `👤 UID: \`${targetUid}\`\n` +
      `📦 Был план: *${prevPlan.toUpperCase()}* → теперь *FREE*`,
      { parse_mode: 'Markdown' }
    );

    await bot.api.sendMessage(
      targetUid,
      `ℹ️ Ваша подписка была отменена администратором.\nПлан изменён на *FREE*.\n\nПо вопросам — обратитесь в поддержку.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });

  // ── /check USER_ID ────────────────────────────────────────────────────────
  bot.command('check', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!isAdmin(uid)) return;

    const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ *Использование:* `/check USER_ID`', { parse_mode: 'Markdown' });
      return;
    }

    const targetUid = parseInt(parts[1], 10);
    if (isNaN(targetUid) || targetUid <= 0) {
      await ctx.reply('❌ Некорректный USER_ID.'); return;
    }

    const info = getSubscriptionInfo(targetUid);
    if (!info) {
      await ctx.reply(
        `👤 UID: \`${targetUid}\`\n❌ Пользователь не найден в базе.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const plan = info.tariff ?? 'free';
    const expiry = formatExpiry(info.sub_expires_at);
    const name = [info.first_name, info.username ? `@${info.username}` : null]
      .filter(Boolean).join(' ') || '—';

    // Count today's messages
    const today = new Date().toISOString().split('T')[0];
    const msgsToday = (db.prepare(
      `SELECT COUNT(*) AS c FROM conversations WHERE uid=? AND date(created_at)=? AND role='user'`
    ).get(targetUid, today) as { c: number }).c;

    const msgsTotal = (db.prepare(
      `SELECT COUNT(*) AS c FROM conversations WHERE uid=?`
    ).get(targetUid) as { c: number }).c;

    await ctx.reply(
      `📋 *Статус пользователя*\n\n` +
      `👤 UID: \`${targetUid}\`\n` +
      `🏷️ Имя: ${name}\n` +
      `📦 План: *${plan.toUpperCase()}*\n` +
      `📅 Подписка: ${expiry}\n` +
      `💬 Сообщений сегодня: ${msgsToday}\n` +
      `💬 Всего сообщений: ${msgsTotal}`,
      { parse_mode: 'Markdown' }
    );
  });
}
