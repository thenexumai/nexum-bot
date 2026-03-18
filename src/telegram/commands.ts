// Telegram Bot Commands

import { Bot, Context } from "grammy";
import { createUser, getUser, updatePlan } from "../db/user-db";
import { generatePairingCode, verifyPairingCode, getPairedAgents } from "../agent/pairing";
import { selectProvider } from "../core/ai-router";

export const setupCommands = (bot: Bot) => {
  // Start command
  bot.command("start", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const username = ctx.from?.username || "anonymous";
    
    createUser(userId, username);
    
    await ctx.reply(
      `🚀 *Welcome to NEXUM!*\n\n` +
      `Your personal AI assistant with:\n` +
      `• Multiple AI providers (Groq, DeepSeek, Claude, Gemini)\n` +
      `• PC Agent integration\n` +
      `• Mini Apps (Finance, Tasks, Notes)\n\n` +
      `*Your plan:* Free (5 requests/day)\n` +
      `*Dashboard:* https://nexum-bot-production-ae70.up.railway.app/dashboard\n\n` +
      `Use /help to see all commands.`,
      { parse_mode: "Markdown" }
    );
  });

  // Help command
  bot.command("help", async (ctx: Context) => {
    await ctx.reply(
      `📚 *NEXUM Commands*\n\n` +
      `*Basic:*\n` +
      `/start — Welcome message\n` +
      `/help — This menu\n` +
      `/dashboard — Open web dashboard\n\n` +
      `*Account:*\n` +
      `/plan — View your plan\n` +
      `/upgrade — Upgrade to Pro ($5/month)\n` +
      `/status — AI provider status\n\n` +
      `*PC Agent:*\n` +
      `/link — Generate pairing code\n` +
      `/devices — List paired devices\n\n` +
      `*Settings:*\n` +
      `/setkey — Add your API key\n` +
      `/mykeys — View your keys\n\n` +
      `*Mini Apps:*\n` +
      `/finance — Finance tracker\n` +
      `/tasks — Task manager\n` +
      `/notes — Notes app`,
      { parse_mode: "Markdown" }
    );
  });

  // Dashboard link
  bot.command("dashboard", async (ctx: Context) => {
    await ctx.reply(
      `🌐 *Your Dashboard*\n\n` +
      `View your stats, paired devices, and manage settings:\n` +
      `https://nexum-bot-production-ae70.up.railway.app/dashboard`,
      { parse_mode: "Markdown" }
    );
  });

  // Plan command
  bot.command("plan", async (ctx: Context) => {
    const user = getUser(ctx.from?.id || 0) as any;
    const plan = user?.plan || "free";
    const requests = 3; // TODO: Get from DB
    const limit = plan === "pro" ? "∞" : "5";
    
    await ctx.reply(
      `💳 *Your Plan: ${plan.toUpperCase()}*\n\n` +
      `Requests today: ${requests} / ${limit}\n` +
      `AI Provider: Groq (Free tier)\n\n` +
      `${plan === "free" ? "Upgrade to Pro for unlimited requests!" : "✅ Pro active"}`,
      { parse_mode: "Markdown" }
    );
  });

  // Upgrade command
  bot.command("upgrade", async (ctx: Context) => {
    await ctx.reply(
      `💎 *Upgrade to NEXUM Pro*\n\n` +
      `*Benefits:*\n` +
      `• Unlimited AI requests\n` +
      `• Access to all AI providers\n` +
      `• Priority support\n` +
      `• All Mini Apps unlocked\n\n` +
      `*Price:* $5/month\n\n` +
      `Payment integration coming on 24th!`,
      { parse_mode: "Markdown" }
    );
  });

  // Link/Pairing command
  bot.command("link", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const code = generatePairingCode(userId);
    
    await ctx.reply(
      `🔗 *PC Agent Pairing*\n\n` +
      `Your pairing code: *${code}*\n\n` +
      `1. Download PC Agent from GitHub\n` +
      `2. Run: \`python nexum_agent.py\`\n` +
      `3. Enter code when prompted\n\n` +
      `Code expires in 10 minutes.`,
      { parse_mode: "Markdown" }
    );
  });

  // Devices command
  bot.command("devices", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const devices = getPairedAgents(userId);
    
    if (devices.length === 0) {
      await ctx.reply(
        `💻 *No devices paired*\n\n` +
        `Use /link to pair your PC.`,
        { parse_mode: "Markdown" }
      );
    } else {
      const deviceList = devices.map((d, i) => `${i + 1}. 🖥️ ${d}`).join("\n");
      await ctx.reply(
        `💻 *Paired Devices:*\n\n${deviceList}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Setkey command
  bot.command("setkey", async (ctx: Context) => {
    const args = ctx.message?.text.split(" ");
    if (args && args.length >= 3) {
      const provider = args[1];
      const key = args[2];
      // TODO: Save to DB
      await ctx.reply(`✅ API key for ${provider} saved!`);
    } else {
      await ctx.reply(
        `🔑 *Add Your API Key*\n\n` +
        `Usage: \`/setkey [provider] [key]\`\n\n` +
        `Providers: groq, deepseek, claude, gemini\n\n` +
        `Example: \`/setkey groq gsk_...\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Status command
  bot.command("status", async (ctx: Context) => {
    const provider = selectProvider();
    await ctx.reply(
      `📊 *System Status*\n\n` +
      `*AI Provider:* ${provider.name}\n` +
      `*Model:* ${provider.model}\n` +
      `*Speed:* ${provider.speed}/10\n` +
      `*Cost:* $${provider.cost}/1k tokens\n\n` +
      `*Status:* ✅ Operational`,
      { parse_mode: "Markdown" }
    );
  });

  // Finance app
  bot.command("finance", async (ctx: Context) => {
    await ctx.reply(
      `💰 *Finance Tracker*\n\n` +
      `Track your income and expenses:\n` +
      `https://nexum-bot-production-ae70.up.railway.app/dashboard\n\n` +
      `Commands:\n` +
      `/finance_add income 1000 Salary\n` +
      `/finance_add expense 50 Groceries\n` +
      `/finance_report`,
      { parse_mode: "Markdown" }
    );
  });

  // Tasks app
  bot.command("tasks", async (ctx: Context) => {
    await ctx.reply(
      `✅ *Task Manager*\n\n` +
      `Coming soon!\n\n` +
      `Use your dashboard for now.`,
      { parse_mode: "Markdown" }
    );
  });

  // Notes app
  bot.command("notes", async (ctx: Context) => {
    await ctx.reply(
      `📝 *Notes*\n\n` +
      `Coming soon!\n\n` +
      `Use your dashboard for now.`,
      { parse_mode: "Markdown" }
    );
  });

  // Handle text messages
  bot.on("message:text", async (ctx: Context) => {
    const msg = ctx.message.text;
    
    // Check if it's a command
    if (msg.startsWith("/")) return;
    
    // TODO: Route to AI after budget increase
    await ctx.reply(
      `💭 *AI Response Coming Soon*\n\n` +
      `Full AI integration launches on March 24th!\n\n` +
      `Your message: "${msg.substring(0, 50)}${msg.length > 50 ? "..." : ""}"\n\n` +
      `Use /dashboard to see your stats.`,
      { parse_mode: "Markdown" }
    );
  });
};
