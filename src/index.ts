import 'dotenv/config';
import { Bot } from 'grammy';
import { config } from './core/config';
import { initDb } from './core/db';
import { setupHandler } from './telegram/handler';
import { registerCommands } from './telegram/commands';
import { startServer } from './apps/server';
import { startReminderCron } from './tools/reminders';
import logger from './infra/logger';
import fs from 'fs';

// ── Init ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });

logger.info('nexum', '🚀 Starting NEXUM v1.0...');

initDb();

if (!config.botToken) {
  logger.error('nexum', 'BOT_TOKEN is not set!');
  process.exit(1);
}

const bot = new Bot(config.botToken);

// ── Setup ─────────────────────────────────────────────────────────────────────
setupHandler(bot);
registerCommands(bot);
startReminderCron(bot);
startServer();

// ── Error handling ────────────────────────────────────────────────────────────
bot.catch((err) => {
  logger.error('bot', 'Unhandled bot error', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('process', 'Unhandled rejection', reason);
});

// ── Session pruning (every hour) ──────────────────────────────────────────────
setInterval(() => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { default: db } = require('./core/db');
  db.prepare("DELETE FROM sessions WHERE updated_at < ?").run(cutoff);
  logger.debug('nexum', 'Old sessions pruned');
}, 60 * 60 * 1000);

// ── Start ─────────────────────────────────────────────────────────────────────
bot.start({
  onStart: (info) => {
    logger.success('nexum', `Bot started: @${info.username}`);
    logger.info('nexum', `Admin UID: ${config.adminUid}`);
  },
});
