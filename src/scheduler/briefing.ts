import schedule from "node-schedule";
import { Bot } from "grammy";

const briefing = (bot: Bot, adminId: number) => {
  // 12:00 — утро
  schedule.scheduleJob("0 12 * * *", async () => {
    await bot.api.sendMessage(adminId, `📋 **План дня**\n\n💡 Идеи заработка:\n— автоматизация\n— Saint Lonely — продвижение\n— NEXUM — MVP\n\n✅ Задачи:`);
  });

  // 21:00 — вечер
  schedule.scheduleJob("0 21 * * *", async () => {
    await bot.api.sendMessage(adminId, `📊 **Итог дня**\n\nЧто завтра:\n— продолжить NEXUM\n— музыка\n— доход\n\n💭 Идея: автоматизировать Saint Lonely через TikTok/YT`);
  });
};

export default briefing;
