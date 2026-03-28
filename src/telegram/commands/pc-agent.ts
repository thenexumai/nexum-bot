/**
 * NEXUM PC Agent Commands
 * Full capability set with safety layer + approval flow.
 * Now fully i18n-aware.
 */

import type { Bot, Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { requireFeature } from '../../core/billing';
import { generateLinkCode, isDeviceOnline, listDevices, getDevice } from '../../agent/pairing';
import { sendCommand, isConnected } from '../../agent/pcagent_protocol';
import { resolveApproval } from '../../agent/capabilities/safety';
import { runSubagent, listSubagents } from '../../agent/executor';
import { getAllCapabilities } from '../../agent/capabilities/registry';
import { formatCommandOutput } from '../../agent/persona';
import { t } from '../../i18n/index';
import { createLogger } from '../../infra/logger';

const log = createLogger('pc-commands');

export function registerPcAgentCommands(bot: Bot): void {

  // /link — generate pairing code
  bot.command('link', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const code   = generateLinkCode(uid);
    const server = process.env.WEBAPP_URL ?? 'wss://your-app.railway.app';

    await ctx.reply(
      `🖥️ ${t(uid, 'pc.link.title')}\n\n` +
      `${t(uid, 'pc.link.run')}\n` +
      `\`\`\`\npython nexum_agent.py --code ${code} --server ${server}\n\`\`\`\n\n` +
      t(uid, 'pc.link.expires'),
      { parse_mode: 'Markdown' }
    );
  });

  // /devices
  bot.command('devices', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const devices = listDevices(uid);
    if (!devices.length) { await ctx.reply(t(uid, 'pc.devices.empty')); return; }

    const lines = devices.map(d =>
      `${d.status === 'online' ? '🟢' : '⚫'} *${d.device_name ?? 'Unknown'}* (${d.platform ?? '?'})\n` +
      t(uid, 'pc.devices.last_seen', { date: d.last_seen?.split('T')[0] ?? '?' })
    ).join('\n\n');

    await ctx.reply(`${t(uid, 'pc.devices.title')}\n\n${lines}`, { parse_mode: 'Markdown' });
  });

  // /pc — status
  bot.command('pc', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const device = getDevice(uid);
    if (!device) { await ctx.reply(t(uid, 'pc.no_device')); return; }

    const connected = isConnected(uid);
    const caps      = getAllCapabilities();
    const safeCaps  = caps.filter(c => c.class === 'safe').map(c => `\`${c.name}\``).join(' ');

    await ctx.reply(
      `🖥️ ${t(uid, 'pc.status.title')}\n\n` +
      `Status: ${connected ? `🟢 ${t(uid, 'pc.status.connected')}` : `⚫ ${t(uid, 'pc.status.offline')}`}\n` +
      `${t(uid, 'pc.status.device', { name: device.device_name ?? 'Unknown' })}\n` +
      `${t(uid, 'pc.status.platform', { platform: device.platform ?? 'Unknown' })}\n` +
      `${t(uid, 'pc.status.last_seen', { date: device.last_seen?.replace('T', ' ').slice(0, 16) ?? '?' })}\n\n` +
      t(uid, 'pc.status.actions', { actions: safeCaps }),
      { parse_mode: 'Markdown' }
    );
  });

  // /run [command]
  bot.command('run', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const cmd = (ctx.message?.text ?? '').replace('/run', '').trim();
    if (!cmd) { await ctx.reply(t(uid, 'pc.run.usage'), { parse_mode: 'Markdown' }); return; }
    if (!isConnected(uid)) { await ctx.reply(t(uid, 'pc.offline')); return; }

    await ctx.replyWithChatAction('typing');

    const chatId = ctx.chat!.id;
    const sendApprovalRequest = async (cId: number, approvalId: string, _action: string, params: Record<string, unknown>) => {
      const kb = new InlineKeyboard()
        .text(`✅ ${t(uid, 'confirm.approve')}`, `exec_approve:${approvalId}`)
        .text(`❌ ${t(uid, 'confirm.deny')}`, `exec_deny:${approvalId}`);
      await bot.api.sendMessage(cId,
        `⚠️ ${t(uid, 'pc.confirm', { action: 'run_cmd', command: String(params.command ?? cmd).slice(0, 300) })}`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    };

    try {
      const res = await sendCommand(uid, 'run_cmd', { command: cmd }, {
        chatId, sendApprovalRequest,
      });
      if (!res.success) { await ctx.reply(`⚠️ ${t(uid, 'pc.action_blocked', { reason: res.error ?? 'unknown' })}`); return; }
      const output = String((res.data as { output?: string })?.output ?? res.data ?? '(no output)');
      await ctx.reply(formatCommandOutput(output), { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  });

  // /screenshot
  bot.command('screenshot', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }
    if (!isConnected(uid)) { await ctx.reply(t(uid, 'pc.offline')); return; }

    await ctx.replyWithChatAction('upload_photo');
    try {
      const res = await sendCommand(uid, 'screenshot', {}, { timeoutMs: 20_000 });
      if (!res.success) { await ctx.reply(`⚠️ ${t(uid, 'pc.action_blocked', { reason: res.error ?? 'unknown' })}`); return; }
      const b64 = (res.data as { image?: string })?.image;
      if (!b64) { await ctx.reply('No image data returned.'); return; }
      await ctx.replyWithPhoto(new InputFile(Buffer.from(b64, 'base64'), 'screenshot.png'));
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  });

  // /sysinfo
  bot.command('sysinfo', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasPcAgent', 'PC Agent');
    if (!check.ok) { await ctx.reply(check.reason!); return; }
    if (!isConnected(uid)) { await ctx.reply(t(uid, 'pc.offline')); return; }

    await ctx.replyWithChatAction('typing');
    try {
      const res = await sendCommand(uid, 'sysinfo', {});
      if (!res.success) { await ctx.reply(`❌ ${res.error}`); return; }
      const d = res.data as Record<string, unknown>;
      await ctx.reply(
        `💻 ${t(uid, 'pc.sysinfo.title')}\n\n` +
        `OS: ${d.platform}\n` +
        `Host: ${d.hostname}\n` +
        (d.cpu_percent !== undefined ? `CPU: ${d.cpu_percent}%\n` : '') +
        (d.ram_total_gb !== undefined ? `RAM: ${d.ram_used_gb}/${d.ram_total_gb} GB (${d.ram_percent}%)\n` : '') +
        (d.disk_total_gb !== undefined ? `Disk: ${d.disk_used_gb}/${d.disk_total_gb} GB (${d.disk_percent}%)` : ''),
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  });

  // /bgrun
  bot.command('bgrun', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasSubagents', 'Background tasks');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const task = (ctx.message?.text ?? '').replace('/bgrun', '').trim();
    if (!task) { await ctx.reply(t(uid, 'bg.usage')); return; }

    try {
      const { id } = await runSubagent(uid, task);
      await ctx.reply(`⚙️ ${t(uid, 'bg.started', { id })}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  });

  // /bglist
  bot.command('bglist', async (ctx: Context) => {
    const uid   = ctx.from?.id ?? 0;
    const check = requireFeature(uid, 'hasSubagents', 'Background tasks');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const runs = listSubagents(uid);
    if (!runs.length) { await ctx.reply(t(uid, 'bg.empty')); return; }

    const iconMap = (s: string) => s === 'done' ? '✅' : s === 'error' ? '❌' : '⏳';
    const lines = runs.map(r =>
      `${iconMap(r.status)} ${r.task.slice(0, 55)}${r.task.length > 55 ? '…' : ''}\n_${r.started_at?.split('T')[0]}_`
    ).join('\n\n');

    await ctx.reply(`${t(uid, 'bg.title')}\n\n${lines}`, { parse_mode: 'Markdown' });
  });
}

// ── Approval callbacks (inline keyboard) ─────────────────────────────────────

export function setupExecApprovalCallbacks(bot: Bot): void {
  bot.callbackQuery(/^exec_approve:(.+)$/, async (ctx) => {
    const uid = ctx.from?.id ?? 0;
    const approvalId = ctx.match[1];
    const resolved = resolveApproval(approvalId, true);
    await ctx.answerCallbackQuery(resolved ? `✅ ${t(uid, 'pc.approved')}` : t(uid, 'pc.expired'));
    if (!resolved) await ctx.editMessageText(`⏱ ${t(uid, 'pc.expired')}`).catch(() => {});
    else await ctx.editMessageText(`✅ ${t(uid, 'pc.approved')}`).catch(() => {});
  });

  bot.callbackQuery(/^exec_deny:(.+)$/, async (ctx) => {
    const uid = ctx.from?.id ?? 0;
    const approvalId = ctx.match[1];
    resolveApproval(approvalId, false);
    await ctx.answerCallbackQuery(`❌ ${t(uid, 'pc.denied')}`);
    await ctx.editMessageText(`❌ ${t(uid, 'pc.denied')}`).catch(() => {});
  });
}
