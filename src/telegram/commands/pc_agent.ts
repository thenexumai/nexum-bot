import { Bot, InlineKeyboard } from 'grammy';
import { canUseFeature } from '../../core/billing';
import { getPreferences } from '../../core/preferences';
import t from '../../i18n';
import db from '../../core/db';
import logger from '../../infra/logger';

// Pending dangerous action approvals: approvalId → { resolve, cmd, uid }
export const pendingApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
  cmd: string;
  uid: number;
}>();

function generateCode(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase() +
         Math.floor(1000 + Math.random() * 9000);
}

function getAgentWs(uid: number): boolean {
  const row = db.prepare('SELECT connected FROM pc_links WHERE uid = ?').get(uid) as
    { connected: number } | undefined;
  return (row?.connected ?? 0) === 1;
}

export function setupPcAgentCommands(bot: Bot) {

  // /link — generate pairing code
  bot.command('link', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }

    const code = generateCode();
    db.prepare(
      'INSERT OR REPLACE INTO pc_links (uid, code, connected) VALUES (?, ?, 0)'
    ).run(uid, code);

    const serverUrl = process.env.APP_URL ?? 'wss://your-app.railway.app';
    await ctx.reply(t(lang, 'pc_link_code', { code }), { parse_mode: 'Markdown' });
    await ctx.reply(
      `Full command:\n\`\`\`\npython nexum_agent.py --code ${code} --server ${serverUrl}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  });

  // /pc — agent status
  bot.command('pc', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }

    const connected = getAgentWs(uid);
    const row = db.prepare('SELECT * FROM pc_links WHERE uid = ?').get(uid) as
      Record<string, unknown> | undefined;

    if (!row) {
      await ctx.reply('❌ No PC linked. Use /link to connect.'); return;
    }

    const info = row.agent_info ? JSON.parse(String(row.agent_info)) : null;
    await ctx.reply(
      `🖥️ *PC Agent Status*\n\n` +
      `Status: ${connected ? '🟢 Connected' : '🔴 Disconnected'}\n` +
      (info ? `OS: ${info.os ?? '—'}\nHostname: ${info.hostname ?? '—'}\n` : '') +
      `Linked: ${row.linked_at}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /screenshot
  bot.command('screenshot', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }
    if (!getAgentWs(uid)) { await ctx.reply(t(lang, 'pc_disconnected')); return; }

    await ctx.reply('📸 Taking screenshot...');
    // Emit to WebSocket — handled in server.ts
    const { emitToAgent } = await import('../../apps/server');
    const result = await emitToAgent(uid, { action: 'screenshot' });
    if (result?.image) {
      await ctx.replyWithPhoto({ source: Buffer.from(result.image, 'base64') });
    } else {
      await ctx.reply('❌ Screenshot failed: ' + (result?.error ?? 'No response'));
    }
  });

  // /browse URL
  bot.command('browse', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }
    if (!getAgentWs(uid)) { await ctx.reply(t(lang, 'pc_disconnected')); return; }

    const url = ctx.match?.trim();
    if (!url) { await ctx.reply('Usage: /browse <url>'); return; }

    await ctx.reply(`🌐 Opening ${url}...`);
    const { emitToAgent } = await import('../../apps/server');
    const result = await emitToAgent(uid, { action: 'browse', url });
    await ctx.reply(result?.ok ? `✅ Opened ${url}` : `❌ Failed: ${result?.error}`);
  });

  // /run CMD — dangerous, requires approval
  bot.command('run', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }
    if (!getAgentWs(uid)) { await ctx.reply(t(lang, 'pc_disconnected')); return; }

    const cmd = ctx.match?.trim();
    if (!cmd) { await ctx.reply('Usage: /run <command>'); return; }

    // Two-phase approval for dangerous commands
    const approvalId = `${uid}_${Date.now()}`;
    const kb = new InlineKeyboard()
      .text('✅ Execute', `approve_${approvalId}`)
      .text('❌ Cancel', `reject_${approvalId}`);

    await ctx.reply(t(lang, 'pc_action_confirm', { cmd }), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });

    const approved = await new Promise<boolean>((resolve) => {
      pendingApprovals.set(approvalId, { resolve, cmd, uid });
      setTimeout(() => {
        pendingApprovals.delete(approvalId);
        resolve(false);
      }, 60_000);
    });

    if (!approved) {
      await ctx.reply('⏱️ Cancelled or timed out.');
      return;
    }

    const { emitToAgent } = await import('../../apps/server');
    const result = await emitToAgent(uid, { action: 'shell', cmd });
    const output = result?.output ?? result?.error ?? 'No output';
    await ctx.reply(`\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, { parse_mode: 'Markdown' });
    logger.info('pc_agent', `Shell cmd uid=${uid}: ${cmd}`);
  });

  // /read PATH
  bot.command('read', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'pc_agent')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }
    if (!getAgentWs(uid)) { await ctx.reply(t(lang, 'pc_disconnected')); return; }

    const filePath = ctx.match?.trim();
    if (!filePath) { await ctx.reply('Usage: /read <path>'); return; }

    const { emitToAgent } = await import('../../apps/server');
    const result = await emitToAgent(uid, { action: 'file_read', path: filePath });
    const content = result?.content ?? result?.error ?? 'Error reading file';
    await ctx.reply(`📄 \`${filePath}\`\n\n${content.slice(0, 3000)}`, { parse_mode: 'Markdown' });
  });

  // Callback query handler for approvals
  bot.callbackQuery(/^(approve|reject)_(.+)$/, async (ctx) => {
    const [, action, approvalId] = ctx.match!;
    const pending = pendingApprovals.get(approvalId);
    if (!pending) { await ctx.answerCallbackQuery('⏱️ Expired'); return; }

    pendingApprovals.delete(approvalId);
    pending.resolve(action === 'approve');
    await ctx.answerCallbackQuery(action === 'approve' ? '✅ Executing...' : '❌ Cancelled');
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  });
}
