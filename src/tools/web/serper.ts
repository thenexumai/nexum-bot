import fetch from 'node-fetch';
import { getSerperKey } from '../../core/config';
import { Logger } from '../../infra/logger';
import { WebSearchProvider, WebSearchResult } from './provider';

export class SerperProvider implements WebSearchProvider {
    id = 'serper';

    async search(query: string): Promise<WebSearchResult[]> {
        Logger.info('serper', `Searching for: ${query}`);
        try {
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': getSerperKey(),  // FIX: was CONFIG.SERPER_KEY (doesn't exist), use getter
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ q: query })
            });
            const data = await response.json() as any;
            
            return data.organic?.slice(0, 10).map((res: any) => ({
                title: res.title,
                link: res.link,
                snippet: res.snippet,
                source: 'google'
            })) || [];
        } catch (error) {
            Logger.error('serper', 'Search failed', error);
            return [];
        }
    }
}
