// NEXUM Main Entry Point

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";
import { startServer } from "./server";

const bot = new Bot(process.env.BOT_TOKEN || "");

console.log("🤖 NEXUM v13 starting...");
console.log("📅 Mode: Development (until March 24th)");

// Setup Telegram commands
setupCommands(bot);

// Start bot
bot.start(() => {
  console.log("✅ Telegram Bot is running!");
});

// Start web server (for dashboard)
startServer();

console.log("🚀 NEXUM fully operational!");

export default bot;
