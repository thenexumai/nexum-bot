"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const grammy_1 = require("grammy");
const config_1 = require("./core/config");
const handler_1 = require("./telegram/handler");
const server_1 = require("./apps/server");
const scheduler_1 = require("./scheduler/scheduler");
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
async function main() {
    if (!config_1.config.botToken)
        throw new Error('BOT_TOKEN is required');
    if (!config_1.config.webappUrl)
        console.warn('[warn] WEBAPP_URL not set — Mini Apps will not work');
    const bot = new grammy_1.Bot(config_1.config.botToken);
    const app = (0, server_1.startServer)(bot);
    (0, handler_1.setupHandlers)(bot, app);
    (0, scheduler_1.startScheduler)(bot);
    // Non-blocking start — Railway healthcheck works immediately
    bot.start({
        onStart: (info) => {
            console.log(`[bot] ✅ NEXUM v12 started as @${info.username}`);
            console.log(`[bot] Admins: ${config_1.config.adminIds.join(', ') || 'none'}`);
        },
        drop_pending_updates: false,
    }).catch(e => console.error('[bot] fatal:', e));
    console.log('[main] ✅ NEXUM v12 ready');
}
main().catch(e => { console.error('[fatal]', e); process.exit(1); });
