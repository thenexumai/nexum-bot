import { config, getNextKey } from '../core/config';
import logger from '../infra/logger';

interface SerperResult {
  organic?: Array<{ title: string; link: string; snippet: string }>;
  answerBox?: { answer?: string; snippet?: string };
  knowledgeGraph?: { description?: string };
}

export async function webSearch(query: string, maxResults = 5): Promise<string> {
  if (!config.serperKey) return await fallbackSearch(query);
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': config.serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: maxResults, gl: 'uz', hl: 'ru' }),
    });
    const data = await res.json() as SerperResult;
    const lines: string[] = [`🔍 **${query}**\n`];
    if (data.answerBox?.answer) lines.push(`💡 ${data.answerBox.answer}\n`);
    if (data.organic?.length) {
      lines.push('**Результаты:**');
      data.organic.slice(0, 5).forEach((r, i) => {
        lines.push(`\n${i+1}. **[${r.title}](${r.link})**\n${r.snippet}`);
      });
    }
    return lines.join('\n');
  } catch (e) {
    logger.error('search', 'Serper failed', e);
    return await fallbackSearch(query);
  }
}

async function fallbackSearch(query: string): Promise<string> {
  const key = getNextKey('gemini');
  if (!key) return `❌ No search key for: ${query}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Answer this search query: ${query}` }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );
    const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    return `🔍 **${query}**\n\n${data.candidates[0].content.parts[0].text}`;
  } catch { return `❌ Search failed: ${query}`; }
}

export async function newsSearch(topic: string): Promise<string> {
  if (!config.serperKey) return '❌ Serper key required';
  try {
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': config.serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: topic, num: 5, hl: 'ru' }),
    });
    const data = await res.json() as { news?: Array<{ title: string; link: string; snippet: string; date?: string }> };
    if (!data.news?.length) return '❌ No news found';
    const lines = [`📰 **Новости: ${topic}**\n`];
    data.news.slice(0, 5).forEach((n, i) => {
      lines.push(`${i+1}. **[${n.title}](${n.link})**\n${n.snippet}${n.date ? ` _(${n.date})_` : ''}`);
    });
    return lines.join('\n\n');
  } catch { return '❌ News search failed'; }
}
