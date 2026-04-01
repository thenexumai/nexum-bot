import { Logger } from '../infra/logger';
import { getSoulContextSync } from '../soul/index';
import { getContext, updateContext } from '../state/user-context';
import { TOOLS, handleToolUse } from './tools';
import { chatUnified, chatStream, Message } from './router';
import { KnowledgeGraph } from '../core/memory/knowledge_graph';
import { Perplexer } from './perplexer';
import { SkillManager } from '../core/skills/skill_manager';
import { UserModel } from '../core/user_model/user_model';
import { LongTermMemory } from '../core/evolution_memory/long_term_memory';
import db from '../core/db';
import type { WebSearchResult } from '../tools/web/provider';

export interface AIResult {
    content: string;
    sources?: WebSearchResult[];
    tool_used?: string | null;
}

function buildSystemPrompt(user: any, userCtx: any, longTermMemory: string, userProfile: string, skillContext: string): string {
    const lang = user?.lang || 'ru';
    const plan = user?.subscription_plan || 'free';

    return `You are NEXUM — a highly capable personal AI assistant with evolving intelligence.

## Your communication style
- Write naturally, like a thoughtful person — not a robot or a corporate assistant
- Use clear, well-structured prose. When listing things, use proper numbered lists (1. 2. 3.) or hyphens (–), never asterisks (*) as bullets
- Use emoji sparingly and meaningfully — maybe 1–2 per response max, never at the start of every line
- Match the user's tone: casual if they're casual, precise if they're asking for something technical
- Be direct and concise. Don't pad responses with filler phrases like "Great question!" or "Certainly!"
- For code: always use code blocks. For math: use plain text formulas
- Never start your response with an emoji or a greeting if the conversation is already in progress

## Formatting rules (CRITICAL)
- Lists: use "1." "2." for ordered, "–" for unordered. Never use "*" as a bullet point
- Headers: use bold (**Header**) sparingly, only for long structured responses
- Keep responses appropriately sized — don't over-explain simple things
- When unsure about something, say so honestly instead of making things up

## Internet access
- You have access to real-time web search. Use it automatically when:
  - User asks about current events, news, prices, weather
  - User asks "что сейчас", "последние новости", "актуально ли"
  - Any question where fresh data matters
- To search, include in your response: [SEARCH: your query here]
- Search results will be injected automatically

## Reminders
- When user asks to remind about something, extract time and set reminder automatically
- Patterns: "напомни через X минут", "remind me in X minutes", "напомни завтра"

## Self-improvement
- After solving complex tasks, you automatically learn new skills
- You remember everything about this user across all sessions

## User context
- Language: ${lang} — always respond in this language
- Plan: ${plan}
- PC Agent: ${userCtx?.pcAgentConnected ? 'connected' : 'not connected'}

${longTermMemory}
${userProfile}
${skillContext}
${getSoulContextSync()}`.trim();
}

// Авто-поиск в интернете если нужен
async function autoWebSearch(content: string, uid: number): Promise<string> {
    const match = content.match(/\[SEARCH:\s*(.+?)\]/i);
    if (!match) return content;

    const query = match[1].trim();
    try {
        const { webSearch } = await import('../tools/search');
        const results = await webSearch(query);
        const formatted = results.slice(0, 3).map((r: any) =>
            `**${r.title}**\n${r.snippet}\n${r.link}`
        ).join('\n\n');

        return content.replace(match[0], '') + `\n\n🔍 *Из интернета:*\n${formatted}`;
    } catch {
        return content.replace(match[0], '');
    }
}

// Авто-напоминание из естественной речи
function trySetReminder(uid: number, text: string): boolean {
    const patterns = [
        /напомни(?:\s+мне)?\s+через\s+(\d+)\s*(минут|мин|час|часов|ч)/i,
        /remind\s+me\s+in\s+(\d+)\s*(minute|min|hour|h)/i,
        /напомни\s+(.+?)\s+через\s+(\d+)\s*(минут|мин|час|часов)/i,
    ];

    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) {
            const amount = parseInt(m[1] || m[2]);
            const unit = (m[2] || m[3] || '').toLowerCase();
            const isHour = unit.startsWith('ч') || unit.startsWith('h');
            const ms = isHour ? amount * 3600000 : amount * 60000;
            const fireAt = new Date(Date.now() + ms).toISOString();
            const reminderText = text.replace(pattern, '').trim().slice(0, 200) || text.slice(0, 200);

            db.prepare(`
                INSERT INTO reminders (chat_id, uid, text, fire_at)
                VALUES (?, ?, ?, ?)
            `).run(uid, uid, reminderText, fireAt);

            Logger.info('executor', `Auto-reminder set for uid=${uid} in ${amount} ${unit}`);
            return true;
        }
    }
    return false;
}

export async function* executeAI(
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): AsyncGenerator<string, void, unknown> {

    Logger.info('agent', `NEXUM Engine: UID ${uid ?? 'anon'}`);

    // Авто-напоминание
    if (uid) trySetReminder(uid, prompt);

    // Записываем в долгосрочную память
    if (uid) {
        LongTermMemory.processMessage(uid, 'user', prompt).catch(() => {});
    }

    if (prompt.startsWith('[deep_search] ')) {
        const query = prompt.slice('[deep_search] '.length).trim();
        try {
            const result = await Perplexer.deepSearch(query, uid);
            yield result.answer;
            if (uid) {
                updateContext(uid, { lastActivity: Date.now() });
                KnowledgeGraph.addFact(uid, prompt + '\n' + result.answer).catch(() => {});
            }
            return;
        } catch (e) {
            Logger.error('agent', 'Perplexer failed', e);
        }
    }

    const user = uid
        ? db.prepare('SELECT subscription_plan, lang FROM users WHERE uid = ?').get(uid) as any
        : null;

    const userCtx = uid ? getContext(uid) : null;

    // Долгосрочная память — всё что помним о пользователе
    const longTermMemory = uid ? LongTermMemory.getFullMemoryContext(uid, prompt) : '';
    // KnowledgeGraph — краткосрочные факты
    const kgMemory = uid ? await KnowledgeGraph.getContext(uid, prompt).catch(() => '') : '';
    const combinedMemory = [longTermMemory, kgMemory ? `\n## Recent facts\n${kgMemory}` : ''].filter(Boolean).join('\n');

    // Профиль пользователя
    const userProfile = uid ? UserModel.getProfileContext(uid) : '';

    // Навыки (skill system)
    const skillContext = uid ? SkillManager.getSkillContext(uid, prompt) : '';

    const systemPrompt = buildSystemPrompt(user, userCtx, combinedMemory, userProfile, skillContext);

    const historyMessages: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: prompt },
    ];

    let fullResponse = '';
    try {
        for await (const chunk of chatStream(messages, uid ?? 0)) {
            fullResponse += chunk;
            yield chunk;
        }
    } catch (err) {
        Logger.error('agent', 'Streaming failed, falling back to chatUnified', err);
        try {
            const result = await chatUnified(messages, uid ?? 0);
            fullResponse = result.content || '';
            yield fullResponse;
        } catch (fallbackErr) {
            Logger.error('agent', 'chatUnified fallback also failed', fallbackErr);
            yield '⚠️ Все AI провайдеры временно недоступны. Попробуй позже или добавь свой ключ через /byok';
            return;
        }
    }

    // Post-processing: авто-поиск если агент решил искать
    if (fullResponse.includes('[SEARCH:')) {
        const withSearch = await autoWebSearch(fullResponse, uid ?? 0);
        if (withSearch !== fullResponse) {
            // Отправляем доп контент как отдельный стрим
            const extra = withSearch.replace(fullResponse.replace(/\[SEARCH:[^\]]+\]/g, ''), '');
            if (extra.trim()) yield extra;
        }
    }

    // Post-processing: обучение и память
    if (uid && fullResponse.length > 100) {
        // Knowledge graph
        KnowledgeGraph.addFact(uid, prompt + '\n' + fullResponse).catch(() => {});
        // Long-term memory
        LongTermMemory.processMessage(uid, 'assistant', fullResponse).catch(() => {});
        // Skill learning (для сложных задач)
        if (prompt.length > 80 && fullResponse.length > 200) {
            SkillManager.learnFromConversation(uid, prompt, fullResponse).catch(() => {});
        }
        // User model update
        UserModel.updateFromInteraction(uid, prompt, fullResponse).catch(() => {});
        // Update context
        updateContext(uid, { lastActivity: Date.now() });
    }
}

// ── executeAIOnce — REST-совместимая обёртка ──────────────────────────────
export const executeAIOnce = async (
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): Promise<{ content: string; sources?: any[]; tool_used?: string | null }> => {
    let fullResponse = '';
    try {
        for await (const chunk of executeAI(prompt, uid, history)) {
            fullResponse += chunk;
        }
    } catch (err) {
        Logger.error('agent', 'executeAIOnce error', err);
        return { content: '❌ Ошибка. Попробуй позже.', tool_used: null };
    }
    return { content: fullResponse, sources: [], tool_used: null };
};
