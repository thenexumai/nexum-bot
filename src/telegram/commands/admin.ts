import { Bot } from 'grammy';
import { grantPlan, getUserPlan } from '../../core/billing';
import { CONFIG, isAdmin as isAdminCheck } from '../../core/config';
import db from '../../core/db';
import { Logger } from '../../infra/logger';

// revokePlan inline (не существует в billing.ts)
const revokePlan = (uid: number) => {
    db.prepare(`UPDATE users SET subscription_plan = 'free', subscription_expires_at = NULL WHERE uid = ?`).run(uid);
};

function isAdmin(uid: number) { return isAdminCheck(uid); }

export function setupAdminCommands(bot: Bot) {

  bot.command('grant', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const parts = ctx.match?.trim().split(/\s+/) ?? [];
    if (parts.length < 3) { await ctx.reply('Usage: /grant USER_ID [free|middle|pro] DAYS'); return; }
    const [uidStr, plan, daysStr] = parts;
    const uid  = parseInt(uidStr);
    const days = parseInt(daysStr);
    if (isNaN(uid) || isNaN(days)) { await ctx.reply('❌ Invalid uid or days'); return; }
    if (!['free','middle','pro'].includes(plan)) { await ctx.reply('❌ Plan must be free|middle|pro'); return; }

    grantPlan(uid, plan as 'free'|'middle'|'pro', days);

    try {
      await ctx.api.sendMessage(uid,
        plan === 'pro'
          ? `🚀 Вам выдана *PRO* подписка на *${days}* дней!`
          : `💼 Вам выдана *${plan.toUpperCase()}* подписка на *${days}* дней!`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* blocked */ }

    await ctx.reply(`✅ User ${uid} → plan=${plan}, days=${days}`);
    Logger.info('admin', `Grant: uid=${uid} plan=${plan} days=${days}`);
  });

  bot.command('revoke', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const uid = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(uid)) { await ctx.reply('Usage: /revoke USER_ID'); return; }
    revokePlan(uid);
    await ctx.reply(`✅ User ${uid} reverted to free.`);
    Logger.info('admin', `Revoke: uid=${uid}`);
  });

  bot.command('check', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const uid = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(uid)) { await ctx.reply('Usage: /check USER_ID'); return; }
    const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as Record<string, unknown> | undefined;
    if (!user) { await ctx.reply('❌ User not found.'); return; }
    const plan = getUserPlan(uid);
    await ctx.reply(
      `👤 *User ${uid}*\nPlan: *${plan.toUpperCase()}*\nExpires: ${user.subscription_expires_at ?? 'N/A'}\nMessages today: ${user.msg_count_today ?? 0}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('admin_stats', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const total = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const proCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_plan = 'pro'").get() as { c: number }).c;
    const middleCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_plan = 'middle'").get() as { c: number }).c;
    const totalMsgs = (db.prepare('SELECT SUM(msg_count_today) as s FROM users').get() as { s: number | null }).s ?? 0;
    await ctx.reply(
      `📊 *NEXUM Stats*\n\n👥 Total: *${total}*\n🚀 PRO: *${proCount}*\n💼 MIDDLE: *${middleCount}*\n🆓 FREE: *${total - proCount - middleCount}*\n💬 Today: *${totalMsgs}*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('broadcast', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const message = ctx.match?.trim();
    if (!message) { await ctx.reply('Usage: /broadcast MESSAGE'); return; }
    const users = db.prepare('SELECT uid FROM users').all() as { uid: number }[];
    let sent = 0;
    for (const u of users) {
      try { await ctx.api.sendMessage(u.uid, message); sent++; await new Promise(r => setTimeout(r, 50)); } catch { /**/ }
    }
    await ctx.reply(`✅ Sent to ${sent}/${users.length} users.`);
  });

  bot.command('pending_fixes', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const fixes = db.prepare("SELECT id, error_msg, file_path, created_at FROM evolution_fixes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10").all() as any[];
    if (!fixes.length) { await ctx.reply('✅ No pending fixes'); return; }
    await ctx.reply(`🔧 *Pending: ${fixes.length}*\n\n${fixes.map(f => `#${f.id} — \`${f.file_path}\`\n${(f.error_msg||'').slice(0,80)}`).join('\n\n')}`, { parse_mode: 'Markdown' });
  });

  bot.command('approve_fix', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const id = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(id)) { await ctx.reply('Usage: /approve_fix ID'); return; }
    db.prepare("UPDATE evolution_fixes SET status = 'approved', resolved_at = datetime('now') WHERE id = ?").run(id);
    await ctx.reply(`✅ Fix #${id} approved.`);
  });

  bot.command('reject_fix', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const id = parseInt(ctx.match?.trim() ?? '');
    if (isNaN(id)) { await ctx.reply('Usage: /reject_fix ID'); return; }
    db.prepare("UPDATE evolution_fixes SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(id);
    await ctx.reply(`❌ Fix #${id} rejected.`);
  });

  bot.command('evolution_status', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) { await ctx.reply('🛡 Admin only.'); return; }
    const p = (q: string) => (db.prepare(q).get() as { c: number }).c;
    await ctx.reply(
      `🧬 *Evolution*\nTotal: ${p("SELECT COUNT(*) as c FROM evolution_fixes")}\n⏳ Pending: ${p("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='pending'")}\n✅ Approved: ${p("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='approved'")}\n❌ Rejected: ${p("SELECT COUNT(*) as c FROM evolution_fixes WHERE status='rejected'")}`,
      { parse_mode: 'Markdown' }
    );
  });
}
