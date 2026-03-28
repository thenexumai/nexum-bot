/**
 * NEXUM — Entry Point
 * Boot order: HTTP server first → then Telegram bot.
 * Railway health check pings /health immediately on deploy.
 */

import { config, validateConfig } from './core/config';
import { db } from './core/db';
import { startServer } from './apps/server';
import { createLogger } from './infra/logger';

const log = createLogger('nexum');

// ── Startup ───────────────────────────────────────────────────────────────────

const { ok, warnings } = validateConfig();
for (const w of warnings) log.warn(w);

// 1. HTTP server — always starts (Railway health check)
startServer();
log.info(`HTTP server ready on port ${config.port}`);

// 2. Telegram bot — starts if BOT_TOKEN is set
if (!config.botToken) {
  log.warn('BOT_TOKEN not set — HTTP-only mode');
} else {
  startBot().catch(err => {
    log.error(`Bot startup failed: ${err.message}`);
    // Keep HTTP alive even if bot fails
  });
}

// ── Bot startup ───────────────────────────────────────────────────────────────

async function startBot(): Promise<void> {
  const { Bot }   = await import('grammy');
  const { setupCommands, setupExecApprovalCallbacks } = await import('./telegram/commands');
  const {
    handleTextMessage,
    handleVoiceMessage,
    handlePhotoMessage,
    handleDocumentMessage,
  } = await import('./telegram/handler');
  const cron = (await import('node-cron')).default;

  const bot = new Bot(config.botToken);

  log.info('Initializing Telegram bot…');

  setupCommands(bot);
  setupExecApprovalCallbacks(bot);

  bot.on('message:text',     ctx => handleTextMessage(ctx, bot));
  bot.on('message:voice',    ctx => handleVoiceMessage(ctx, bot));
  bot.on('message:photo',    ctx => handlePhotoMessage(ctx, bot));
  bot.on('message:document', ctx => handleDocumentMessage(ctx, bot));

  bot.catch(err => log.error(`Bot error: ${err.message}`));

  // ── Reminder cron ─────────────────────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const due = db.prepare(
        `SELECT * FROM reminders WHERE done=0 AND fire_at <= datetime('now')`
      ).all() as { id: number; chat_id: number; text: string }[];

      for (const r of due) {
        try { await bot.api.sendMessage(r.chat_id, `⏰ ${r.text}`); } catch {}
        db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
      }
    } catch { /* non-critical */ }
  });

  // ── Expose globally for server.ts notifications ───────────────────────────
  (global as { __nexumBot?: typeof bot }).__nexumBot = bot;

  await bot.start({
    onStart: async info => {
      const providers = (Object.entries(config.ai) as [string, readonly string[]][])
        .filter(([, k]) => k.length).map(([p]) => p).join(', ');

      log.info(`@${info.username} is online`);
      log.info(`AI providers: ${providers || 'none'}`);

      const adminId = config.adminIds[0];
      if (adminId) {
        await bot.api.sendMessage(
          adminId,
          `✅ NEXUM started\n@${info.username}\nProviders: ${providers || 'none configured'}`
        ).catch(() => {});
      }
    },
  });

  process.on('SIGINT',  () => { bot.stop(); process.exit(0); });
  process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
}
