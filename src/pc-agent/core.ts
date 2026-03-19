// NEXUM PC Agent Core - OpenClaw analog with secure token handling

import WebSocket from "ws";

interface AgentConfig {
  botUrl: string;
  pairingCode: string;
  deviceId: string;
}

interface Message {
  type: string;
  [key: string]: any;
}

export class NEXUMAgentCore {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private authenticated = false;
  private messageHandlers = new Map<string, Function>();
  
  constructor(pairingCode: string) {
    this.config = {
      botUrl: process.env.NEXUM_BOT_URL || "wss://nexum-bot.railway.app/ws",
      pairingCode,
      deviceId: this.generateDeviceId(),
    };
  }
  
  private generateDeviceId(): string {
    const os = require("os");
    const crypto = require("crypto");
    const hostname = os.hostname();
    const mac = crypto.randomBytes(6).toString("hex");
    return `${hostname}_${mac}`;
  }
  
  async connect(): Promise<boolean> {
    try {
      this.ws = new WebSocket(this.config.botUrl);
      
      this.ws.on("open", () => this.handleOpen());
      this.ws.on("message", (data) => this.handleMessage(data));
      this.ws.on("close", () => this.handleClose());
      this.ws.on("error", (error) => this.handleError(error));
      
      return true;
    } catch (error) {
      console.error("Connection failed:", error);
      return false;
    }
  }
  
  private handleOpen() {
    console.log("✅ Connected to NEXUM bot");
    this.sendMessage({
      type: "pair",
      code: this.config.pairingCode,
      deviceId: this.config.deviceId,
    });
  }
  
  private handleMessage(data: string) {
    try {
      const msg: Message = JSON.parse(data);
      
      if (msg.type === "paired") {
        this.authenticated = msg.success;
        console.log(this.authenticated ? "✅ Paired!" : "❌ Pairing failed");
      } else if (msg.type === "command") {
        this.executeCommand(msg);
      } else {
        const handler = this.messageHandlers.get(msg.type);
        if (handler) handler(msg);
      }
    } catch (error) {
      console.error("Message parsing error:", error);
    }
  }
  
  private handleClose() {
    console.log("🔴 Disconnected from NEXUM");
    this.authenticated = false;
    setTimeout(() => this.connect(), 5000);
  }
  
  private handleError(error: Error) {
    console.error("Connection error:", error.message);
  }
  
  async executeCommand(msg: Message) {
    const { command, params } = msg;
    
    switch (command) {
      case "bash":
        await this.runBash(params.cmd);
        break;
      case "screenshot":
        await this.takeScreenshot();
        break;
      case "file":
        await this.handleFile(params);
        break;
      case "status":
        this.sendStatus();
        break;
      default:
        console.log(`Unknown command: ${command}`);
    }
  }
  
  private async runBash(cmd: string) {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    
    try {
      const { stdout, stderr } = await execAsync(cmd);
      this.sendMessage({
        type: "command_result",
        result: stdout || stderr,
        success: true,
      });
    } catch (error: any) {
      this.sendMessage({
        type: "command_result",
        result: error.message,
        success: false,
      });
    }
  }
  
  private async takeScreenshot() {
    // Implement screenshot
    console.log("📸 Screenshot requested");
  }
  
  private async handleFile(params: any) {
    // Handle file operations
    console.log("📁 File operation:", params);
  }
  
  private sendStatus() {
    const os = require("os");
    this.sendMessage({
      type: "status",
      deviceId: this.config.deviceId,
      cpu: os.cpus().length,
      memory: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      uptime: os.uptime(),
    });
  }
  
  sendMessage(msg: Message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
  
  onMessage(type: string, handler: Function) {
    this.messageHandlers.set(type, handler);
  }
  
  isAuthenticated(): boolean {
    return this.authenticated;
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
