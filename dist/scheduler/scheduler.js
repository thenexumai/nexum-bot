"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../core/db");
function startScheduler(bot) {
    // Check reminders every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        const now = new Date().toISOString();
        const due = db_1.db.prepare(`
      SELECT * FROM reminders WHERE done=0 AND fire_at <= ? LIMIT 20
    `).all(now);
        for (const r of due) {
            try {
                await bot.api.sendMessage(r.chat_id, `⏰ *Напоминание*\n\n${r.text}`, { parse_mode: 'Markdown' });
            }
            catch (e) {
                console.error('[scheduler] send error:', e);
            }
            // Mark done (or schedule next if repeat)
            if (r.repeat && r.repeat !== 'none') {
                const next = calcNext(r.fire_at, r.repeat);
                if (next) {
                    db_1.db.prepare('UPDATE reminders SET fire_at=?, done=0 WHERE id=?').run(next, r.id);
                    continue;
                }
            }
            db_1.db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
        }
    });
    console.log('[scheduler] ✅ started');
}
function calcNext(fireAt, repeat) {
    const d = new Date(fireAt);
    if (repeat === 'daily') {
        d.setDate(d.getDate() + 1);
        return d.toISOString();
    }
    if (repeat === 'weekly') {
        d.setDate(d.getDate() + 7);
        return d.toISOString();
    }
    if (repeat === 'monthly') {
        d.setMonth(d.getMonth() + 1);
        return d.toISOString();
    }
    return null;
}
