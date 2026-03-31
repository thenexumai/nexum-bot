import { Perplexer } from '../agent/perplexer';
import { Logger } from '../infra/logger';

export class ResearchAgent {
    static async solve(objective: string) {
        Logger.info('intelligence', `Researching objective: ${objective}`);
        
        // Рекурсивный поиск с 5 уровнями глубины для сложных задач
        const result = await Perplexer.deepSearch(objective);
        
        // Синтез финального отчета
        return {
            summary: result.answer,
            sources: result.sources,
            related: result.related,
            confidence: 0.95
        };
    }
}
