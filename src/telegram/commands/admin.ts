import { Bot } from 'grammy';
import { grantPlan, revokePlan, getUserPlan } from '../../core/billing';
import { getPreferences } from '../../core/preferences';
import { config } from '../../core/config';
import t from '../../i18n';
import db from '../../core/db';
import logger from '../../infra/logger';

const ADMIN = config.adminUid;

function isAdmin(uid: number) { return uid === ADMIN; }

export function setupAdminCommands(bot: Bot) {

  // /grant USER_ID PLAN DAYS
  bot.command('grant', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const parts = ctx.match?.trim().split(/\s+/) ?? [];
    if (parts.length < 3) { await ctx.reply('Usage: /grant USER_ID [free|middle|pro] DAYS'); return; }
    const [uidStr, plan, daysStr] = parts;
    const uid  = parseInt(uidStr);
    const days = parseInt(daysStr);
    if (isNaN(uid) || isNaN(days)) { await ctx.reply('❌ Invalid uid or days'); return; }
    if (!['free','middle','pro'].includes(plan)) { await ctx.reply('❌ Plan must be free|middle|pro'); return; }

    grantPlan(uid, plan as 'free'|'middle'|'pro', days);

    // Notify the user
    try {
      await ctx.api.sendMessage(uid,
        plan === 'pro'
          ? `🚀 Вам выдана *PRO* подписка на *${days}* дней!\n\nПолный доступ ко всем функциям NEXUM.`
          : `💼 Вам выдана *${plan.toUpperCase()}* подписка на *${days}* дней!`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* user may have blocked bot */ }

    await ctx.reply(t('ru', 'grant_success', { uid, plan, days }));
    logger.info('admin', `Grant: uid=${uid} plan=${plan} days=${days}`);
  });

  // /revoke USER_ID
  bot.command('revoke', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const uid = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(uid)) { await ctx.reply('Usage: /revoke USER_ID'); return; }
    revokePlan(uid);
    await ctx.reply(t('ru', 'revoke_success', { uid }));
    logger.info('admin', `Revoke: uid=${uid}`);
  });

  // /check USER_ID
  bot.command('check', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const uid = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(uid)) { await ctx.reply('Usage: /check USER_ID'); return; }

    const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as Record<string, unknown> | undefined;
    if (!user) { await ctx.reply(t('ru', 'user_not_found')); return; }

    const plan = getUserPlan(uid);
    await ctx.reply(
      `👤 *User ${uid}*\n` +
      `Username: @${user.username ?? 'none'}\n` +
      `Name: ${user.first_name ?? '—'}\n` +
      `Plan: *${plan.toUpperCase()}*\n` +
      `Expires: ${user.subscription_expires_at ?? 'N/A'}\n` +
      `Messages today: ${user.msg_count_today ?? 0}\n` +
      `Lang: ${user.lang}\n` +
      `Joined: ${user.created_at}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /admin_stats
  bot.command('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }

    const total = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const today = new Date().toISOString().slice(0, 10);
    const active = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE msg_date = ?"
    ).get(today) as { c: number }).c;
    const proCount = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE subscription_plan = 'pro'"
    ).get() as { c: number }).c;
    const middleCount = (db.prepare(
      "SELECT COUNT(*) as c FROM users WHERE subscription_plan = 'middle'"
    ).get() as { c: number }).c;
    const totalMsgs = (db.prepare(
      'SELECT SUM(msg_count_today) as s FROM users'
    ).get() as { s: number | null }).s ?? 0;

    await ctx.reply(
      `📊 *NEXUM Stats*\n\n` +
      `👥 Total users: *${total}*\n` +
      `🟢 Active today: *${active}*\n` +
      `🚀 PRO: *${proCount}*\n` +
      `💼 MIDDLE: *${middleCount}*\n` +
      `🆓 FREE: *${total - proCount - middleCount}*\n` +
      `💬 Messages today: *${totalMsgs}*`,
      { parse_mode: 'Markdown' }
    );
  });

  // /broadcast MESSAGE
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const message = ctx.match?.trim();
    if (!message) { await ctx.reply('Usage: /broadcast Your message here'); return; }

    const users = db.prepare('SELECT uid FROM users').all() as { uid: number }[];
    let sent = 0;
    for (const u of users) {
      try {
        await ctx.api.sendMessage(u.uid, message, { parse_mode: 'Markdown' });
        sent++;
        await new Promise(r => setTimeout(r, 50)); // rate limit
      } catch { /* skip blocked users */ }
    }
    await ctx.reply(t('ru', 'broadcast_success', { count: sent }));
    logger.info('admin', `Broadcast sent to ${sent}/${users.length} users`);
  });

  // /pending_fixes
  bot.command('pending_fixes', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const fixes = db.prepare(
      "SELECT id, error_msg, file_path, created_at FROM evolution_fixes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10"
    ).all() as { id: number; error_msg: string; file_path: string; created_at: string }[];

    if (!fixes.length) { await ctx.reply('✅ No pending fixes'); return; }
    const list = fixes.map(f =>
      `#${f.id} — \`${f.file_path}\`\n${f.error_msg?.slice(0, 80)}\n${f.created_at}`
    ).join('\n\n');
    await ctx.reply(`🔧 *Pending fixes:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // /approve_fix ID
  bot.command('approve_fix', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const id = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(id)) { await ctx.reply('Usage: /approve_fix FIX_ID'); return; }

    const fix = db.prepare('SELECT * FROM evolution_fixes WHERE id = ?').get(id) as
      { id: number; diff_patch: string; explanation: string } | undefined;
    if (!fix) { await ctx.reply('❌ Fix not found'); return; }

    db.prepare(
      "UPDATE evolution_fixes SET status = 'approved', resolved_at = datetime('now') WHERE id = ?"
    ).run(id);

    await ctx.reply(`✅ Fix #${id} approved!\n\n${fix.explanation}\n\n_Deploy will be triggered if git is configured._`, {
      parse_mode: 'Markdown',
    });
    logger.info('admin', `Fix #${id} approved`);
  });

  // /reject_fix ID
  bot.command('reject_fix', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const id = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(id)) { await ctx.reply('Usage: /reject_fix FIX_ID'); return; }

    db.prepare(
      "UPDATE evolution_fixes SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?"
    ).run(id);
    await ctx.reply(`❌ Fix #${id} rejected.`);
    logger.info('admin', `Fix #${id} rejected`);
  });

  // /evolution_status
  bot.command('evolution_status', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.reply(t('ru', 'admin_only')); return; }
    const total    = (db.prepare("SELECT COUNT(*) as c FROM evolution_fixes").get() as { c: number }).c;
    const pending  = (db.prepare("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='pending'").get() as { c: number }).c;
    const approved = (db.prepare("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='approved'").get() as { c: number }).c;
    const rejected = (db.prepare("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='rejected'").get() as { c: number }).c;
    await ctx.reply(
      `🧬 *Evolution System*\n\n` +
      `Total fixes: ${total}\n⏳ Pending: ${pending}\n✅ Approved: ${approved}\n❌ Rejected: ${rejected}`,
      { parse_mode: 'Markdown' }
    );
  });
}
