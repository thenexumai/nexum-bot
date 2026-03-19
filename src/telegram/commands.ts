// NEXUM Telegram Commands
// All bot commands for user interaction

import { Bot, Context } from "grammy";
import { createUser, getUser, updatePlan } from "../db/user-db";
import { generatePairingCode, verifyPairingCode, getPairedAgents } from "../agent/pairing";
import { selectProvider } from "../core/ai-router";
import { getUserSoul, addToContext, clearContext, buildSystemPrompt, isAdmin } from "../soul";
import handleMessage from "./handler";

export const setupCommands = (bot: Bot) => {
  // Start command
  bot.command("start", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const username = ctx.from?.username || "anonymous";
    
    createUser(userId, username);
    
    await ctx.reply(
      `🚀 *Welcome to NEXUM!*\n\n` +
      `Your personal AI assistant with:\n` +
      `• Advanced AI providers (Groq, DeepSeek, Claude, Gemini)\n` +
      `• PC Agent integration\n` +
      `• Mini Apps (Finance, Tasks, Notes)\n` +
      `• Self-learning capabilities\n\n` +
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
    const requests = 3;
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

  // Link/Pairing command - Send agent file directly
  bot.command("link", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const code = generatePairingCode(userId);
    
    try {
      const fs = await import("fs");
      const agentPath = "./pc-agent-template.py";
      
      if (fs.existsSync(agentPath)) {
        await ctx.replyWithDocument(
          { url: `file://${agentPath}` } as any,
          { 
            caption: `🔗 *NEXUM PC Agent*\n\nПаринг код: *${code}*`,
            parse_mode: "Markdown"
          }
        );
      } else {
        await ctx.reply(
          `🔗 *PC Agent Pairing*\n\nCode: *${code}*`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error) {
      console.error("File send error:", error);
      await ctx.reply(`🔗 Code: *${code}*`, { parse_mode: "Markdown" });
    }
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
    const { formatTasksList } = await import("../apps/tasks-app");
    const userId = ctx.from?.id || 0;
    const list = formatTasksList(userId);
    await ctx.reply(list, { parse_mode: "Markdown" });
  });

  bot.command("task_add", async (ctx: Context) => {
    const { createTask } = await import("../apps/tasks-app");
    const args = ctx.message?.text.split(" ");
    args?.shift();
    
    if (!args || args.length === 0) {
      await ctx.reply("📝 *Добавить задачу*\n\n`/task_add Название задачи [приоритет: high/medium/low]`", { parse_mode: "Markdown" });
      return;
    }
    
    const title = args.join(" ");
    const priority = args.includes("high") ? "high" : args.includes("low") ? "low" : "medium";
    const cleanTitle = title.replace(/ (high|medium|low)/, "").trim();
    
    const userId = ctx.from?.id || 0;
    const task = createTask(userId, cleanTitle, "", priority);
    await ctx.reply(`✅ *Задача добавлена:*\n\n*${task.title}*\nПриоритет: ${priority}`, { parse_mode: "Markdown" });
  });

  // Notes app commands
  bot.command("notes", async (ctx: Context) => {
    const { formatNotesList } = await import("../apps/notes-app");
    const userId = ctx.from?.id || 0;
    const list = formatNotesList(userId);
    await ctx.reply(list, { parse_mode: "Markdown" });
  });

  bot.command("note_add", async (ctx: Context) => {
    const { createNote } = await import("../apps/notes-app");
    const args = ctx.message?.text.split(" ");
    args?.shift();
    
    if (!args || args.length === 0) {
      await ctx.reply("📝 *Добавить заметку*\n\n`/note_add Заголовок | Текст`", { parse_mode: "Markdown" });
      return;
    }
    
    const text = args.join(" ");
    const [title, content] = text.split("|").map(s => s.trim());
    
    if (!title || !content) {
      await ctx.reply("📝 *Формат:* `/note_add Заголовок | Текст`", { parse_mode: "Markdown" });
      return;
    }
    
    const userId = ctx.from?.id || 0;
    const note = createNote(userId, title, content);
    await ctx.reply(`✅ *Заметка создана:*\n\n*${note.title}*\n${note.content.substring(0, 100)}`, { parse_mode: "Markdown" });
  });

  // Handle text messages
  bot.on("message:text", async (ctx: Context) => {
    await handleMessage(ctx, bot);
  });
  
  // Clear chat history command
  bot.command("clear", async (ctx: Context) => {
    clearContext(ctx.from?.id || 0);
    await ctx.reply("История очищена.");
  });

  // ADMIN: Get all users stats
  bot.command("admin_stats", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    if (!isAdmin(userId)) {
      await ctx.reply("❌ Доступ только для админа");
      return;
    }
    
    const { getAllUsersStats } = await import("../soul");
    const users = getAllUsersStats();
    
    if (users.length === 0) {
      await ctx.reply("📊 Нет пользователей");
      return;
    }
    
    const list = users.slice(0, 10).map((u, i) => 
      `${i + 1}. ID: ${u.userId}\n   Сообщений: ${u.messages}\n   Активность: ${new Date(u.lastActive).toLocaleString()}`
    ).join("\n\n");
    
    await ctx.reply(`📊 *Статистика пользователей (топ 10):*\n\n${list}`, { parse_mode: "Markdown" });
  });

  // ADMIN: Broadcast message
  bot.command("broadcast", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    if (!isAdmin(userId)) {
      await ctx.reply("❌ Доступ только для админа");
      return;
    }
    
    const msg = ctx.message?.text.replace("/broadcast ", "");
    if (!msg) {
      await ctx.reply("Использование: /broadcast ТЕКСТ");
      return;
    }
    
    await ctx.reply(`📢 Сообщение будет отправлено всем пользователям:\n\n${msg}`);
  });

  // USER: My stats
  bot.command("mystats", async (ctx: Context) => {
    const userId = ctx.from?.id || 0;
    const { getUserStats } = await import("../soul");
    const stats = getUserStats(userId);
    
    await ctx.reply(
      `📊 *Твоя статистика:*\n\n` +
      `Сообщений в контексте: ${stats.totalMessages}\n` +
      `Интересов: ${stats.interests}\n` +
      `Проектов: ${stats.projects}\n` +
      `Заметок: ${stats.notes}\n` +
      `С: ${new Date(stats.activeSince).toLocaleDateString()}\n\n` +
      `${stats.isAdmin ? "⚠️ Ты админ" : "👤 Обычный пользователь"}`,
      { parse_mode: "Markdown" }
    );
  });
};
