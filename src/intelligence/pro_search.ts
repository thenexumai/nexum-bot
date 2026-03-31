import { chatUnified } from '../agent/router';
import { webSearch } from '../tools/search';
import { Logger } from '../infra/logger';

export class ProSearchEngine {
    private static MAX_DEPTH = 5;

    static async execute(query: string, uid: number, focus: 'web' | 'academic' | 'reddit' | 'youtube' = 'web') {
        Logger.info('pro-search', `Deep Analysis started: ${query} (Focus: ${focus})`);
        
        let context = "";
        let steps = [];
        let sources = [];
        
        for (let i = 0; i < this.MAX_DEPTH; i++) {
            Logger.debug('pro-search', `Step ${i+1}: Generating search sub-queries...`);
            
            const decisionPrompt = `
                OBJECTIVE: ${query}
                CURRENT CONTEXT: ${context}
                FOCUS: ${focus}
                
                Analyze what information is missing. Generate a search query to fill the gap.
                If objective is met, return "FINISH".
                Otherwise return ONLY the query string.
            `;
            
            const nextQuery = await chatUnified([{ role: 'user', content: decisionPrompt }], uid);
            if (nextQuery.content.includes("FINISH")) break;

            const results = await webSearch(nextQuery.content);
            sources.push(...results);
            context += results.map(r => `[${r.title}]: ${r.snippet}`).join("\n");
            steps.push({ query: nextQuery.content, result_count: results.length });
        }

        const finalPrompt = `
            SYNTHESIZE FINAL REPORT:
            Query: ${query}
            Data: ${context}
            
            Provide a comprehensive, structured answer with citations like [1], [2].
            Include a "Related Questions" section at the end.
        `;

        const finalAnswer = await chatUnified([{ role: 'user', content: finalPrompt }], uid);
        
        return {
            answer: finalAnswer.content,
            sources: this.deduplicate(sources),
            steps: steps
        };
    }

    private static deduplicate(sources: any[]) {
        const seen = new Set();
        return sources.filter(s => {
            if (seen.has(s.link)) return false;
            seen.add(s.link);
            return true;
        });
    }
}
