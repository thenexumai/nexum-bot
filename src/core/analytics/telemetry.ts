import db from '../db';
import { Logger } from '../../infra/logger';

export interface TelemetryEvent {
    component: string;
    action: string;
    duration?: number;
    status: 'success' | 'failure';
    metadata?: any;
}

export class TelemetryEngine {
    static record(event: TelemetryEvent) {
        try {
            db.prepare(`
                INSERT INTO audit_log (uid, action, details, timestamp)
                VALUES (0, ?, ?, datetime('now'))
            `).run(
                `${event.component}:${event.action}`,
                JSON.stringify({
                    status: event.status,
                    duration: event.duration,
                    ...event.metadata
                })
            );
            
            if (event.status === 'failure') {
                Logger.warn('telemetry', `Failure in ${event.component}: ${event.action}`);
            }
        } catch (e) {
            console.error("Telemetry failed", e);
        }
    }

    static getStats(component: string) {
        return db.prepare(`
            SELECT details FROM audit_log 
            WHERE action LIKE ? 
            ORDER BY timestamp DESC LIMIT 100
        `).all(`${component}:%`);
    }
}
