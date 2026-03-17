"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_schedule_1 = __importDefault(require("node-schedule"));
const briefing = (bot, adminId) => {
    // 12:00 — утро
    node_schedule_1.default.scheduleJob("0 12 * * *", async () => {
        await bot.api.sendMessage(adminId, `📋 **План дня**\n\n💡 Идеи заработка:\n— автоматизация\n— Saint Lonely — продвижение\n— NEXUM — MVP\n\n✅ Задачи:`);
    });
    // 21:00 — вечер
    node_schedule_1.default.scheduleJob("0 21 * * *", async () => {
        await bot.api.sendMessage(adminId, `📊 **Итог дня**\n\nЧто завтра:\n— продолжить NEXUM\n— музыка\n— доход\n\n💭 Идея: автоматизировать Saint Lonely через TikTok/YT`);
    });
};
exports.default = briefing;
