// NEXUM Heartbeat System - Periodic checks and actions

import { Bot, Context } from "grammy";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface HeartbeatCheck {
  name: string;
  interval: number; // ms
  check: () => Promise<boolean>;
  action?: () => Promise<void>;
}

export class HeartbeatSystem {
  private checks: Map<string, HeartbeatCheck> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  addCheck(check: HeartbeatCheck) {
    this.checks.set(check.name, check);
  }
  
  async start(bot: Bot, adminId: number) {
    for (const [name, check] of this.checks) {
      this.scheduleCheck(bot, adminId, name, check);
    }
    console.log("❤️ Heartbeat system started");
  }
  
  private scheduleCheck(bot: Bot, adminId: number, name: string, check: HeartbeatCheck) {
    const run = async () => {
      try {
        const healthy = await check.check();
        
        if (!healthy && check.action) {
          await check.action();
          await bot.api.sendMessage(adminId, `⚠️ ${name}: Action taken`);
        }
      } catch (error) {
        console.error(`Heartbeat check ${name} failed:`, error);
      }
      
      // Reschedule
      const timer = setTimeout(() => run(), check.interval);
      this.timers.set(name, timer);
    };
    
    run();
  }
  
  stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

// Default checks
export const createDefaultChecks = (): HeartbeatCheck[] => [
  {
    name: "GitHub Sync",
    interval: 10 * 60 * 1000, // 10 min
    check: async () => {
      try {
        const { stdout } = await execAsync("git status");
        return !stdout.includes("Changes not staged");
      } catch {
        return false;
      }
    },
    action: async () => {
      await execAsync("git add -A && git commit -m 'Auto: heartbeat sync' && git push");
    },
  },
  
  {
    name: "Railway Status",
    interval: 15 * 60 * 1000, // 15 min
    check: async () => {
      try {
        const response = await fetch("https://nexum-bot-production-ae70.up.railway.app/health");
        return response.ok;
      } catch {
        return false;
      }
    },
  },
  
  {
    name: "Memory Cleanup",
    interval: 60 * 60 * 1000, // 1 hour
    check: async () => {
      // Check memory usage
      const used = process.memoryUsage();
      return used.heapUsed < 500 * 1024 * 1024; // Less than 500MB
    },
    action: async () => {
      if (global.gc) global.gc();
    },
  },
];
