import { Bot } from 'grammy';
import { config } from './core/config';
import { db } from './core/db';
import { setupCommands, setupExecApprovalCallbacks } from './telegram/commands';
import { handleTextMessage, handleVoiceMessage, handlePhotoMessage, handleDocumentMessage } from './telegram/handler';
import { startServer } from './apps/server';
import cron from 'node-cron';

if (!config.botToken) {
  console.error('[nexum] BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(config.botToken);
console.log('[nexum] Starting...');

// Register all commands
setupCommands(bot);
setupExecApprovalCallbacks(bot);

// Message handlers
bot.on('message:text',     (ctx) => handleTextMessage(ctx, bot));
bot.on('message:voice',    (ctx) => handleVoiceMessage(ctx, bot));
bot.on('message:photo',    (ctx) => handlePhotoMessage(ctx, bot));
bot.on('message:document', (ctx) => handleDocumentMessage(ctx, bot));

bot.catch((err) => console.error('[bot]', err.message));

// ── Reminder cron (every minute) ─────────────────────────────────────────────
cron.schedule('* * * * *', async () => {
  try {
    const due = (db as any).prepare(
      `SELECT * FROM reminders WHERE done=0 AND fire_at<=datetime('now')`
    ).all() as any[];

    if (!due?.length) return;

    for (const r of due) {
      try {
        await bot.api.sendMessage(r.chat_id, `⏰ Reminder: ${r.text}`);
      } catch {}
      (db as any).prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
    }
  } catch {}
});

// ── Start HTTP server ─────────────────────────────────────────────────────────
const serverApp = startServer(bot);
(global as any).__nexumApp = serverApp;

// ── Start bot ─────────────────────────────────────────────────────────────────
const adminId = config.adminIds[0];

bot.start({
  onStart: async (info) => {
    const providers = Object.entries(config.ai)
      .filter(([, k]) => k.length)
      .map(([p]) => p)
      .join(', ');

    console.log(`[nexum] @${info.username} running on port ${config.port}`);
    console.log(`[nexum] Providers: ${providers || 'none'}`);
    console.log(`[nexum] Webapp: ${config.webappUrl || 'not set'}`);
    console.log(`[nexum] Public: ${config.publicBot}`);

    if (adminId) {
      await bot.api.sendMessage(
        adminId,
        `✅ NEXUM started\n@${info.username}\nProviders: ${providers || 'none'}\nWebapp: ${config.webappUrl || 'not set'}`
      ).catch(() => {});
    }
  },
});

process.on('SIGINT',  () => { bot.stop(); process.exit(0); });
process.on('SIGTERM', () => { bot.stop(); process.exit(0); });

export default bot;
