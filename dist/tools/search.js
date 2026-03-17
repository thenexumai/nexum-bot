"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearch = webSearch;
const config_1 = require("../core/config");
async function webSearch(query) {
    const key = (0, config_1.getSerperKey)();
    if (!key)
        return '🔍 Поиск недоступен (нет SERPER_KEY)';
    const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 6, hl: 'ru' }),
    });
    if (!r.ok)
        throw new Error(`Serper ${r.status}`);
    const d = await r.json();
    const results = [];
    if (d.answerBox?.answer)
        results.push(`💡 ${d.answerBox.answer}`);
    if (d.answerBox?.snippet)
        results.push(`💡 ${d.answerBox.snippet}`);
    if (d.knowledgeGraph?.description)
        results.push(`📖 ${d.knowledgeGraph.description}`);
    if (d.organic) {
        for (const item of d.organic.slice(0, 4)) {
            results.push(`• *${item.title}*\n  ${item.snippet || ''}\n  ${item.link}`);
        }
    }
    return results.join('\n\n') || 'Ничего не найдено';
}
