// NEXUM Main Entry Point

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";
import { startServer } from "./server";
import { startWebSocketServer } from "./agent/websocket-server";

const bot = new Bot(process.env.BOT_TOKEN || "");

console.log("🤖 NEXUM v13 starting...");
console.log("📅 Mode: Full Power (Kimi + Kimi)");
console.log("💰 Budget: Optimized for growth");

// Setup Telegram commands
setupCommands(bot);

// Start bot
bot.start(() => {
  console.log("✅ Telegram Bot is running!");
});

// Start web server (for dashboard)
startServer();

// Start WebSocket server (for PC Agent)
const wsPort = parseInt(process.env.WS_PORT || "8080");
startWebSocketServer(wsPort);

console.log("🚀 NEXUM fully operational!");
console.log("🔌 WebSocket server for PC Agent active");
console.log("🌐 Dashboard: http://localhost:3000/dashboard");

export default bot;
