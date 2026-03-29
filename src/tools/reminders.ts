import cron from 'node-cron';
import { Bot } from 'grammy';
import db from '../core/db';
import logger from '../infra/logger';

export function startReminderCron(bot: Bot) {
  cron.schedule('* * * * *', async () => {
    const now = new Date().toISOString();
    const due = db.prepare(
      "SELECT * FROM reminders WHERE done = 0 AND fire_at <= ? LIMIT 20"
    ).all(now) as { id: number; chat_id: number; text: string }[];

    for (const r of due) {
      try {
        await bot.api.sendMessage(r.chat_id, `⏰ *Напоминание:* ${r.text}`, { parse_mode: 'Markdown' });
        db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(r.id);
        logger.info('reminders', `Fired reminder ${r.id}`);
      } catch (e) {
        logger.error('reminders', `Failed reminder ${r.id}`, e);
      }
    }
  });
  logger.info('reminders', 'Reminder cron started');
}
