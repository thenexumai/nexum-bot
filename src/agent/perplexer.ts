import { webSearch } from '../tools/search';
import { chatUnified } from './router';
import { Logger } from '../infra/logger';
import { WebSearchResult } from '../tools/web/provider';

export class Perplexer {
    private static MAX_STEPS = 3;

    static async deepSearch(query: string, uid?: number): Promise<{ answer: string, sources: WebSearchResult[], related: string[] }> {
        Logger.info('perplexer', `Starting deep search for: ${query}`);
        
        let allSources: WebSearchResult[] = [];
        let currentContext = '';
        let step = 0;
        let finalAnswer = '';
        let relatedQuestions: string[] = [];

        while (step < this.MAX_STEPS) {
            step++;
            Logger.debug('perplexer', `Step ${step}: Searching...`);
            
            const results = await webSearch(query);
            allSources = [...allSources, ...results];
            
            currentContext += results.map((r, i) => `[Source ${i+1}]: ${r.title}\nContent: ${r.snippet}\nUrl: ${r.link}`).join('\n\n');

            const decision = await this.analyzeContext(query, currentContext, uid);
            
            if (decision.isEnough || step >= this.MAX_STEPS) {
                finalAnswer = decision.answer;
                relatedQuestions = decision.related || [];
                break;
            } else {
                Logger.info('perplexer', `Need more info. Next query: ${decision.nextQuery}`);
                query = decision.nextQuery || query;
            }
        }

        return {
            answer: finalAnswer,
            sources: this.uniqueSources(allSources),
            related: relatedQuestions
        };
    }

    private static async analyzeContext(originalQuery: string, context: string, uid?: number): Promise<{ isEnough: boolean, answer: string, nextQuery?: string, related?: string[] }> {
        const prompt = `
            You are a Pro Research Assistant (Perplexity-style).
            Original Query: ${originalQuery}
            
            Current Knowledge Base:
            ${context}

            MISSION:
            1. If you have enough info, set "isEnough" to true.
            2. Provide "answer" in Markdown with citations like [1], [2] (referring to source index).
            3. Generate 3 "related" questions the user might ask next.
            4. If info is missing, set "isEnough" to false and provide "nextQuery" to find missing information.

            Return ONLY JSON: { "isEnough": boolean, "answer": string, "nextQuery": string, "related": string[] }
        `;

        try {
            // FIX: chatUnified requires number, not number|undefined — use uid ?? 0
            const assistantMessage = await chatUnified([{ role: 'user', content: prompt }], uid ?? 0);
            const content = assistantMessage.content || '';
            const jsonStr = content.replace(/```json|```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            Logger.error('perplexer', 'Analysis failed', error);
            return { isEnough: true, answer: "Search analysis complete with fallback.", related: [] };
        }
    }

    private static uniqueSources(sources: WebSearchResult[]): WebSearchResult[] {
        const seen = new Set();
        return sources.filter(s => {
            if (seen.has(s.link)) return false;
            seen.add(s.link);
            return true;
        }).slice(0, 6);
    }
}
