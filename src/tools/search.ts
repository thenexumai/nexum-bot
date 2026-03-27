// NEXUM Web Search — Serper API

import { getSerperKey } from '../core/config';

export async function webSearch(query: string, numResults = 5): Promise<string | null> {
  const key = getSerperKey();
  if (!key) return null;

  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: numResults }),
    });

    if (!r.ok) return null;
    const data = await r.json() as any;

    const parts: string[] = [];

    if (data.answerBox?.answer) {
      parts.push(`Answer: ${data.answerBox.answer}`);
    }
    if (data.answerBox?.snippet) {
      parts.push(`Featured: ${data.answerBox.snippet}`);
    }

    const organic = (data.organic || []).slice(0, numResults);
    for (const item of organic) {
      parts.push(`[${item.title}]\n${item.snippet}\nURL: ${item.link}`);
    }

    return parts.join('\n\n') || null;
  } catch (e: any) {
    console.error('[search]', e.message);
    return null;
  }
}
