// NEXUM v14 — Personal AI Agent Platform
// OpenClaw-style architecture with full multi-provider fallback

import { Bot } from 'grammy';
import { config } from './core/config';
import { setupCommands } from './telegram/commands';
import { handleTextMessage, handleVoiceMessage, handlePhotoMessage } from './telegram/handler';
import { startServer } from './apps/server';
import { db } from './core/db';
import cron from 'node-cron';

// ── Validate config ───────────────────────────────────────────────────────────
if (!config.botToken) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(config.botToken);
console.log('NEXUM v14 starting...');

// ── Setup commands ────────────────────────────────────────────────────────────
setupCommands(bot);

// ── Message handlers ──────────────────────────────────────────────────────────

// Text messages — no reactions
bot.on('message:text', async (ctx) => {
  await handleTextMessage(ctx, bot);
});

// Voice messages
bot.on('message:voice', async (ctx) => {
  await handleVoiceMessage(ctx, bot);
});

// Photos
bot.on('message:photo', async (ctx) => {
  await handlePhotoMessage(ctx, bot);
});

// Documents (treat as text description)
bot.on('message:document', async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) return;
  const doc = ctx.message.document;
  const caption = ctx.message.caption || '';
  const { execute } = await import('./agent/executor');
  const { streamReply } = await import('./telegram/handler');
  await ctx.replyWithChatAction('typing');
  const response = await execute(uid, `User sent a document: "${doc.file_name}" (${doc.mime_type}, ${Math.round((doc.file_size||0)/1024)}KB). ${caption ? 'Caption: ' + caption : 'What would you like to do with this file?'}`);
  await streamReply(ctx, response, ctx.message.message_id);
});

// Error handler — no crashes
bot.catch((err) => {
  console.error('[bot] error:', err.message);
});

// ── Reminder cron ─────────────────────────────────────────────────────────────
cron.schedule('* * * * *', async () => {
  try {
    const due = db.prepare(`SELECT * FROM reminders WHERE done=0 AND fire_at<=datetime('now')`).all() as any[];
    for (const r of due) {
      try {
        await bot.api.sendMessage(r.chat_id, `Reminder: ${r.text}`);
        if (r.repeat === 'none') {
          db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
        }
      } catch (e: any) {
        db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
      }
    }
  } catch {}
});

// ── Start ─────────────────────────────────────────────────────────────────────
const app = startServer(bot);

// Notify admin on start
const adminId = config.adminIds[0];
bot.start({
  onStart: async (info) => {
    console.log(`Bot started: @${info.username}`);
    console.log(`Server: http://localhost:${config.port}`);
    console.log(`Webapp: ${config.webappUrl}`);
    const providers = Object.entries(config.ai).filter(([, k]) => k.length > 0).map(([p]) => p).join(', ');
    console.log(`AI providers: ${providers || 'none'}`);
    if (adminId) {
      await bot.api.sendMessage(adminId, `NEXUM v14 started\n@${info.username}\nProviders: ${providers || 'none'}\nWebapp: ${config.webappUrl || 'not set'}`).catch(() => {});
    }
  },
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.stop();
  process.exit(0);
});

export default bot;
