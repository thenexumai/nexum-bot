"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const bot = new grammy_1.Bot(process.env.BOT_TOKEN || "");
bot.command("start", async (ctx) => {
    await ctx.reply("NEXUM ready");
});
bot.start();
