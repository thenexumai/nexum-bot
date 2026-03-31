import { chatUnified } from '../../agent/router';
import { Logger } from '../../infra/logger';
import { TelemetryEngine } from '../analytics/telemetry';

export class DiagnosticLoop {
    static async start() {
        Logger.info('evolution', 'Diagnostic Loop STARTED');
        
        setInterval(async () => {
            await this.probeProviders();
        }, 1800000); // 30 min
    }

    private static async probeProviders() {
        Logger.debug('evolution', 'Probing AI Providers...');
        
        try {
            const start = Date.now();
            // Pass 0 as UID for system diagnostic
            await chatUnified([{ role: 'user', content: 'health_check' }], 0);
            const duration = Date.now() - start;
            
            TelemetryEngine.record({
                component: 'router',
                action: 'probe',
                status: 'success',
                duration
            });
        } catch (e: any) {
            Logger.error('evolution', 'AI Provider probe FAILED', e);
            TelemetryEngine.record({
                component: 'router',
                action: 'probe',
                status: 'failure',
                metadata: { error: e.message }
            });
        }
    }
}
