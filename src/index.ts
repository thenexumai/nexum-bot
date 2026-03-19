// NEXUM AI - Main Entry Point

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";
import { startServer } from "./server";
import { startWebSocketServer } from "./agent/websocket-server";
import { HeartbeatSystem, createDefaultChecks } from "./heartbeat-system";

const bot = new Bot(process.env.BOT_TOKEN || "");
const adminId = parseInt(process.env.ADMIN_IDS?.split(',')[0] || "387182659");

console.log("🤖 NEXUM AI v13 - Intelligent Assistant Platform");

setupCommands(bot);

const heartbeat = new HeartbeatSystem();
for (const check of createDefaultChecks()) {
  heartbeat.addCheck(check);
}

bot.start();

console.log("✅ Telegram Bot is running");
console.log("❤️ Heartbeat system started");
heartbeat.start(bot, adminId);

startServer();

const wsPort = parseInt(process.env.WS_PORT || "8080");
startWebSocketServer(wsPort);

console.log("🚀 NEXUM fully operational!");
console.log("🔌 PC Agent WebSocket server active on port", wsPort);

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  heartbeat.stop();
  process.exit(0);
});

export default bot;
