import { Bot } from 'grammy';
import { config } from './core/config';
import { setupCommands, setupExecApprovalCallbacks } from './telegram/commands';
import { handleTextMessage, handleVoiceMessage, handlePhotoMessage, streamReply } from './telegram/handler';
import { startServer } from './apps/server';
import { db } from './core/db';
import cron from 'node-cron';

if (!config.botToken) { console.error('BOT_TOKEN required'); process.exit(1); }

const bot = new Bot(config.botToken);
console.log('NEXUM starting...');

setupCommands(bot);
setupExecApprovalCallbacks(bot);

bot.on('message:text', async (ctx) => handleTextMessage(ctx, bot));
bot.on('message:voice', async (ctx) => handleVoiceMessage(ctx, bot));
bot.on('message:photo', async (ctx) => handlePhotoMessage(ctx, bot));

bot.on('message:document', async (ctx) => {
  const uid = ctx.from?.id; if (!uid) return;
  const doc = ctx.message.document;
  const caption = ctx.message.caption || '';
  const { execute } = await import('./agent/executor');
  await ctx.replyWithChatAction('typing');
  const r = await execute(uid, `Document received: "${doc.file_name}" (${doc.mime_type}, ${Math.round((doc.file_size||0)/1024)}KB).${caption?' Caption: '+caption:''}`, { bot });
  await streamReply(ctx, r);
});

bot.catch((err) => console.error('[bot]', err.message));

// Reminder cron — every minute
cron.schedule('* * * * *', async () => {
  try {
    const due = db.prepare(`SELECT * FROM reminders WHERE done=0 AND fire_at<=datetime('now')`).all() as unknown as any[];
    if (!due || !due.length) return;
    due.forEach((r: any) => {
      bot.api.sendMessage(r.chat_id, `Reminder: ${r.text}`).catch(() => {});
      db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
    });
  } catch {}
});

const serverApp = startServer(bot);

// Make server app available globally for PC agent relay
(global as any).__nexumApp = serverApp;

const adminId = config.adminIds[0];
bot.start({
  onStart: async (info) => {
    console.log(`@${info.username} started on port ${config.port}`);
    const providers = Object.entries(config.ai).filter(([,k]) => k.length).map(([p]) => p).join(', ');
    console.log(`Providers: ${providers||'none'}`);
    if (adminId) {
      await bot.api.sendMessage(adminId, `NEXUM started\n@${info.username}\nProviders: ${providers||'none'}\nWebapp: ${config.webappUrl||'not set'}`).catch(() => {});
    }
  },
});

process.on('SIGINT', () => { bot.stop(); process.exit(0); });
process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
export default bot;
