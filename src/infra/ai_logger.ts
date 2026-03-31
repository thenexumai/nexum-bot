import { portalConnections } from '../index';
import { WebSocket } from 'ws';

export class AILogger {
    static logThought(uid: number, thought: string) {
        const portals = portalConnections.get(uid);
        if (portals) {
            const payload = JSON.stringify({
                type: 'ai_thought',
                content: thought,
                ts: Date.now()
            });
            portals.forEach(p => {
                if (p.readyState === WebSocket.OPEN) p.send(payload);
            });
        }
    }
}
