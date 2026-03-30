import { SerperProvider } from './web/serper';
import { WebSearchResult } from './web/provider';

const providers = [
    new SerperProvider()
];

// ✅ Raw results — used internally by Perplexer which needs WebSearchResult[]
export const webSearch = async (query: string): Promise<WebSearchResult[]> => {
    const provider = providers[0];
    return await provider.search(query);
};

// ✅ FIXED: formatted string version — used by /search command in general.ts
export const webSearchFormatted = async (query: string): Promise<string> => {
    const results = await webSearch(query);
    if (!results.length) return '🔍 Ничего не найдено.';
    return results
        .slice(0, 5)
        .map((r, i) => `*${i + 1}. ${r.title}*\n${r.snippet}\n${r.link}`)
        .join('\n\n');
};
