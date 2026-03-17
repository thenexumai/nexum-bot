// NEXUM Main Entry Point

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";

const bot = new Bot(process.env.BOT_TOKEN || "");

console.log("🤖 NEXUM v13 starting...");

// Setup commands
setupCommands(bot);

// Start bot
bot.start(() => {
  console.log("✅ Bot is running!");
  console.log("API Budget: $6.50 until 24th (offline mode)");
});

export default bot;
