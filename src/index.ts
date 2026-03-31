import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { Bot } from 'grammy';
import { CONFIG } from './core/config';
import { Logger } from './infra/logger';
import db, { initDB } from './core/db';
import { initByokDb } from './core/config';
import { setupBot } from './telegram/handler';
import { migrateEvolutionTables } from './core/migrations';
import { startMonitor } from './infra/monitor';
import { startReminderCron } from './tools/reminders';
import { DiagnosticLoop } from './core/evolution/diagnostic';

// --- GLOBAL INSTANCE ---
export const bot = new Bot(CONFIG.TELEGRAM_TOKEN);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// --- AGENT STATE ---
export const agentConnections = new Map<number, WebSocket>();
export const portalConnections = new Map<number, WebSocket[]>();
export const pendingRequests = new Map<string, (result: any) => void>();
const linkTokens = new Map<string, number>();

export const createLinkToken = (uid: number): string => {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    linkTokens.set(token, uid);
    setTimeout(() => linkTokens.delete(token), 600000); // 10 min
    return token;
};

async function bootstrap() {
    Logger.info('system', '🚀 NEXUM Supreme: Starting Global Bootstrap...');

    // 1. Database & Infrastructure
    initDB();
    migrateEvolutionTables(db);
    initByokDb(db);
    
    // 2. Middleware
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../src/public')));

    // 3. API Routes (Minimal clean implementation)
    app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), agents: agentConnections.size }));
    
    // API для Mini Apps (Proxy to DB)
    app.get('/api/:table', (req, res) => {
        const { table } = req.params;
        const uid = req.query.uid;
        if(!uid) return res.status(400).json({error: 'UID required'});
        try {
            const rows = db.prepare(`SELECT * FROM ${table} WHERE uid = ? ORDER BY created_at DESC`).all(uid);
            res.json(rows);
        } catch(e: any) { res.status(500).json({error: e.message}); }
    });

    // Создание автономной миссии
    app.post('/api/missions/create', async (req, res) => {
        const { uid, objective } = req.body;
        if (!uid || !objective) return res.status(400).json({ error: 'UID and objective required' });
        
        try {
            const { MissionControl } = await import('./core/tasks/mission_control');
            const missionId = await MissionControl.createMission(Number(uid), objective);
            res.json({ ok: true, missionId });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // 4. WebSocket: PC Agent Bridge
    wss.on('connection', (ws, req) => {
        let connectedUid: number | null = null;
        let isAlive = true;
        const isPortal = req.url?.includes('type=portal');

        ws.on('pong', () => { isAlive = true; });

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                
                if (msg.type === 'auth') {
                    const uid = isPortal ? Number(msg.uid) : linkTokens.get(msg.token);
                    if (!uid && !isPortal) {
                        ws.send(JSON.stringify({ type: 'auth_error', message: 'Token invalid' }));
                        return ws.terminate();
                    }
                    if(!isPortal) linkTokens.delete(msg.token);
                    
                    connectedUid = uid;
                    if (isPortal) {
                        const portals = portalConnections.get(uid!) || [];
                        portalConnections.set(uid!, [...portals, ws]);
                        Logger.success('wss', `Portal Link: UID ${uid}`);
                    } else {
                        agentConnections.set(uid!, ws);
                        Logger.success('wss', `Agent Link: UID ${uid}`);
                    }
                    ws.send(JSON.stringify({ type: 'auth_ok', uid }));
                    return;
                }

                if (msg.type === 'screen_frame') {
                    const portals = portalConnections.get(msg.uid);
                    if (portals) {
                        portals.forEach(p => {
                            if (p.readyState === WebSocket.OPEN) p.send(raw.toString());
                        });
                    }
                    return;
                }

                if (msg.type === 'voice_command') {
                    const { VoiceCommandBridge } = await import('./agent/voice/command_bridge');
                    const bridge = new VoiceCommandBridge(connectedUid!);
                    const buffer = Buffer.from(msg.data, 'base64');
                    bridge.onAudioChunk(buffer);
                    const reply = await bridge.onVoiceEnd();
                    if(reply) ws.send(JSON.stringify({ type: 'voice_reply', content: reply }));
                    return;
                }

                if (msg.type === 'result') {
                    const cb = pendingRequests.get(msg.requestId);
                    if (cb) { cb(msg); pendingRequests.delete(msg.requestId); }
                }
            } catch (e) { Logger.error('wss', 'WS Error', e); }
        });

        ws.on('close', () => { if(connectedUid) agentConnections.delete(connectedUid); });
    });

    // 5. Telegram Bot Engine
    setupBot(bot);
    bot.start({ drop_pending_updates: true }); // Запуск без блокировки потока
    Logger.success('system', 'Telegram Engine: ONLINE');

    // 6. Background Processes
    startMonitor();
    startReminderCron(bot);
    DiagnosticLoop.start();

    // 7. Listen
    const PORT = CONFIG.PORT || 3000;
    httpServer.listen(PORT, () => {
        Logger.success('system', `NEXUM v1.0 LIVE on port ${PORT} 🌍💥`);
    });
}

bootstrap().catch(e => Logger.error('system', 'FATAL BOOTSTRAP', e));
