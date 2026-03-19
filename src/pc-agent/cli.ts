// NEXUM PC Agent CLI - Command-line interface

import { NEXUMAgentCore } from "./core";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("NEXUM PC Agent v1.0");
    console.log("Usage: nexum-agent <pairing_code>");
    console.log("\nExample: nexum-agent ABC123DEF456");
    process.exit(1);
  }
  
  const pairingCode = args[0];
  const agent = new NEXUMAgentCore(pairingCode);
  
  console.log("🚀 NEXUM PC Agent starting...");
  console.log(`📱 Pairing code: ${pairingCode}`);
  
  const connected = await agent.connect();
  if (!connected) {
    console.error("❌ Failed to connect to NEXUM bot");
    process.exit(1);
  }
  
  // Command handlers
  agent.onMessage("bash", (msg: any) => {
    console.log(`⚙️ Executing: ${msg.cmd}`);
  });
  
  agent.onMessage("screenshot", () => {
    console.log("📸 Taking screenshot...");
  });
  
  agent.onMessage("disconnect", () => {
    console.log("🔌 Disconnecting...");
    agent.disconnect();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {
    if (agent.isAuthenticated()) {
      agent.sendMessage({ type: "ping" });
    }
  }, 30000);
  
  console.log("✅ Connected to NEXUM bot");
  console.log("Waiting for commands...");
  console.log("Press Ctrl+C to exit\n");
}

main().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  process.exit(0);
});
