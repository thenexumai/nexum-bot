import { EvolutionEngine } from './engine';
import { Logger } from '../infra/logger';

export class GlobalMonitor {
    static init() {
        process.on('uncaughtException', async (error) => {
            Logger.error('system', 'CRITICAL ERROR DETECTED', error);
            
            // Пытаемся определить файл из стека
            const stack = error.stack || '';
            const fileMatch = stack.match(/\((.*):(\d+):(\d+)\)/);
            
            if (fileMatch) {
                const filePath = fileMatch[1];
                await EvolutionEngine.analyzeAndFix(filePath, error.message);
            }
        });
        
        Logger.info('monitor', 'Global NEXUM Monitor is active across all modules');
    }
}
