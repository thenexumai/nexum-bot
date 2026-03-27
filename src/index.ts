import { config } from './core/config';

// ── Start HTTP server FIRST (unconditionally) ─────────────────────────────────
// Railway healthcheck hits /health — this must respond regardless of bot status
import('./apps/server').then(({ startServer }) => {
  const app = startServer();
  (global as any).__nexumApp = app;
  console.log(`[nexum] HTTP server up on port ${config.port}`);
}).catch((err) => {
  console.error('[nexum] FATAL: HTTP server failed to start:', err.message);
  process.exit(1);
});

// ── Bot setup ─────────────────────────────────────────────────────────────────
if (!config.botToken) {
  console.warn('[nexum] BOT_TOKEN not set — HTTP-only mode. Set it in Railway Variables.');
} else {
  startBot().catch((err) => {
    console.error('[nexum] Bot startup error:', err.message);
    // Don't exit — keep HTTP server alive for healthcheck
  });
}

async function startBot() {
  const { Bot } = await import('grammy');
  const { db } = await import('./core/db');
  const { setupCommands, setupExecApprovalCallbacks } = await import('./telegram/commands');
  const {
    handleTextMessage,
    handleVoiceMessage,
    handlePhotoMessage,
    handleDocumentMessage,
  } = await import('./telegram/handler');
  const cron = (await import('node-cron')).default;

  const bot = new Bot(config.botToken);
  console.log('[nexum] Bot initializing...');

  setupCommands(bot);
  setupExecApprovalCallbacks(bot);

  bot.on('message:text',     (ctx: any) => handleTextMessage(ctx, bot));
  bot.on('message:voice',    (ctx: any) => handleVoiceMessage(ctx, bot));
  bot.on('message:photo',    (ctx: any) => handlePhotoMessage(ctx, bot));
  bot.on('message:document', (ctx: any) => handleDocumentMessage(ctx, bot));

  bot.catch((err: any) => console.error('[bot]', err.message));

  // Reminders cron
  cron.schedule('* * * * *', async () => {
    try {
      const due = (db as any).prepare(
        `SELECT * FROM reminders WHERE done=0 AND fire_at<=datetime('now')`
      ).all() as any[];
      if (!due?.length) return;
      for (const r of due) {
        try { await bot.api.sendMessage(r.chat_id, `⏰ Reminder: ${r.text}`); } catch {}
        (db as any).prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
      }
    } catch {}
  });

  (global as any).__nexumBot = bot;

  const adminId = config.adminIds[0];

  await bot.start({
    onStart: async (info: any) => {
      const providers = Object.entries(config.ai)
        .filter(([, k]) => (k as string[]).length)
        .map(([p]) => p)
        .join(', ');

      console.log(`[nexum] @${info.username} online`);
      console.log(`[nexum] Providers: ${providers || 'none'}`);

      if (adminId) {
        await bot.api.sendMessage(
          adminId,
          `✅ NEXUM started\n@${info.username}\nProviders: ${providers || 'none'}`
        ).catch(() => {});
      }
    },
  });

  process.on('SIGINT',  () => { bot.stop(); process.exit(0); });
  process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
}
