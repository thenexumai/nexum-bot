export interface WebSearchResult {
    title: string;
    link: string;
    snippet: string;
    source?: string;
}

export interface WebSearchProvider {
    id: string;
    search(query: string): Promise<WebSearchResult[]>;
}
