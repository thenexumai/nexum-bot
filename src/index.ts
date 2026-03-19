// NEXUM AI - Main Entry Point
// Your Personal AI Assistant Platform

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";
import { startServer } from "./server";
import { startWebSocketServer } from "./agent/websocket-server";
import { HeartbeatSystem, createDefaultChecks } from "./heartbeat-system";

const bot = new Bot(process.env.BOT_TOKEN || "");
const adminId = parseInt(process.env.ADMIN_ID || "387182659");

console.log("🤖 NEXUM AI v13 - Intelligent Assistant Platform");
console.log("⚡ Mode: Self-learning AI with PC integration");
console.log("💾 Budget Mode: Maximum efficiency");
console.log("🌐 All-in-one bot for every user");

// Setup Telegram commands
setupCommands(bot);

// Start heartbeat system for periodic checks
const heartbeat = new HeartbeatSystem();
for (const check of createDefaultChecks()) {
  heartbeat.addCheck(check);
}

// Start bot
bot.start(async () => {
  console.log("✅ Telegram Bot is running");
  console.log("❤️ Heartbeat system started");
  await heartbeat.start(bot, adminId);
});

// Start web server for dashboard and mini-apps
startServer();

// Start WebSocket server for PC Agent connections
const wsPort = parseInt(process.env.WS_PORT || "8080");
startWebSocketServer(wsPort);

console.log("🚀 NEXUM fully operational!");
console.log("🔌 PC Agent WebSocket server active on port", wsPort);
console.log("🌐 Dashboard: http://localhost:3000/dashboard");
console.log("🧠 Self-learning system: ENABLED");
console.log("❤️ Periodic checks: RUNNING");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  heartbeat.stop();
  process.exit(0);
});

export default bot;
