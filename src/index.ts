// NEXUM Main Entry Point - Full OpenClaw-style AI Agent

import { Bot } from "grammy";
import { setupCommands } from "./telegram/commands";
import { startServer } from "./server";
import { startWebSocketServer } from "./agent/websocket-server";
import { HeartbeatSystem, createDefaultChecks } from "./heartbeat-system";

const bot = new Bot(process.env.BOT_TOKEN || "");
const adminId = parseInt(process.env.ADMIN_ID || "387182659");

console.log("🤖 NEXUM v13 - Full OpenClaw Clone");
console.log("⚡ Mode: Self-modifying AI Agent");
console.log("💾 Budget Mode: Maximum economy");

// Setup Telegram commands
setupCommands(bot);

// Start heartbeat system
const heartbeat = new HeartbeatSystem();
for (const check of createDefaultChecks()) {
  heartbeat.addCheck(check);
}

// Start bot
bot.start(async () => {
  console.log("✅ Telegram Bot running");
  console.log("❤️ Starting heartbeat system...");
  await heartbeat.start(bot, adminId);
});

// Start web server
startServer();

// Start WebSocket server
const wsPort = parseInt(process.env.WS_PORT || "8080");
startWebSocketServer(wsPort);

console.log("🚀 NEXUM fully operational!");
console.log("🔌 PC Agent WebSocket active");
console.log("🌐 Dashboard: http://localhost:3000/dashboard");
console.log("🧠 Self-modifying system: ACTIVE");
console.log("❤️ Heartbeat: RUNNING");

process.on("SIGINT", () => {
  heartbeat.stop();
  process.exit(0);
});

export default bot;
