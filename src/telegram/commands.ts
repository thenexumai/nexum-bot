// Telegram Bot Commands

import { Bot, Context } from "grammy";
import { createUser, getUser, generatePairingCode, updatePlan } from "../db/user-db";
import { selectProvider } from "../core/ai-router";

export const setupCommands = (bot: Bot) => {
  bot.command("start", async (ctx: Context) => {
    const user = createUser(ctx.from?.id || 0, ctx.from?.username || "anonymous");
    await ctx.reply("🚀 NEXUM ready! /help для команд.");
  });

  bot.command("help", async (ctx: Context) => {
    await ctx.reply(`
📚 NEXUM Commands:

/start — начало
/help — помощь
/plan — твой план (free/pro)
/upgrade — upgrade to Pro ($5/мес)
/link [код] — привязать PC Agent
/setkey [провайдер] [ключ] — добавить API ключ
/status — статистика
/search [запрос] — поиск
    `);
  });

  bot.command("plan", async (ctx: Context) => {
    const user = getUser(ctx.from?.id || 0) as any;
    await ctx.reply(`💳 Твой план: ${user?.plan || "free"}`);
  });

  bot.command("upgrade", async (ctx: Context) => {
    updatePlan(ctx.from?.id || 0, "pro");
    await ctx.reply("✅ Upgraded to Pro! Спасибо за поддержку 🎉");
  });

  bot.command("link", async (ctx: Context) => {
    const code = generatePairingCode(ctx.from?.id || 0);
    await ctx.reply(`🔗 Код привязки: ${code}\n\nВыполни на PC Agent: python nexum_agent.py ${code}`);
  });

  bot.command("setkey", async (ctx: Context) => {
    await ctx.reply("🔑 Формат: /setkey [groq|gemini|claude] [ваш_ключ]");
  });

  bot.command("status", async (ctx: Context) => {
    const provider = selectProvider();
    await ctx.reply(`📊 Status:\nAI Provider: ${provider.name}\nSpeed: ${provider.speed}/10\nCost: $${provider.cost}/1k tokens`);
  });

  bot.on("message:text", async (ctx: Context) => {
    const msg = ctx.message.text;
    // TODO: Route to AI after budget increase
    await ctx.reply("💭 Coming soon (after budget increase on 24th)");
  });
};
