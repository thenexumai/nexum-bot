import { Logger } from '../infra/logger';
import { getSoulContextSync } from '../soul/index';
import { getContext, updateContext } from '../state/user-context';
import { TOOLS, handleToolUse } from './tools';
import { chatUnified, chatStream, Message } from './router';
import { KnowledgeGraph } from '../core/memory/knowledge_graph';
import { Perplexer } from './perplexer';
import db from '../core/db';
import type { WebSearchResult } from '../tools/web/provider';

export interface AIResult {
    content: string;
    sources?: WebSearchResult[];
    tool_used?: string | null;
}

function buildSystemPrompt(user: any, userCtx: any, longTermMemory: string): string {
    const lang = user?.lang || 'ru';
    const plan = user?.subscription_plan || 'free';

    return `You are NEXUM — a highly capable personal AI assistant, similar in style to Claude by Anthropic.

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

## User context
- Language: ${lang} — always respond in this language
- Plan: ${plan}
- PC Agent: ${userCtx?.pcAgentConnected ? 'connected' : 'not connected'}

${longTermMemory ? `## What you know about this user\n${longTermMemory}` : ''}

${getSoulContextSync()}`.trim();
}

export async function* executeAI(
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): AsyncGenerator<string, void, unknown> {

    Logger.info('agent', `NEXUM Engine: UID ${uid ?? 'anon'}`);

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
    const longTermMemory = uid
        ? await KnowledgeGraph.getContext(uid, prompt).catch(() => '')
        : '';

    const systemPrompt = buildSystemPrompt(user, userCtx, longTermMemory);

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
            const fallback = await chatUnified(messages, uid ?? 0, TOOLS);
            fullResponse = fallback.content || '';
            if (fullResponse) yield fullResponse;
        } catch (err2) {
            Logger.error('agent', 'Fallback also failed', err2);
            yield '❌ Не удалось получить ответ. Попробуй позже.';
            return;
        }
    }

    if (uid && fullResponse) {
        updateContext(uid, { lastActivity: Date.now() });
        KnowledgeGraph.addFact(uid, prompt + '\n' + fullResponse).catch(() => {});
    }
}

export const executeAIOnce = async (
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): Promise<AIResult> => {
    Logger.info('agent', `NEXUM REST: UID ${uid ?? 'anon'}`);

    if (prompt.startsWith('[deep_search] ')) {
        const query = prompt.slice('[deep_search] '.length).trim();
        try {
            const result = await Perplexer.deepSearch(query, uid);
            return { content: result.answer, sources: result.sources, tool_used: 'deep_search' };
        } catch (e) {
            Logger.error('agent', 'Perplexer failed', e);
        }
    }

    const user = uid
        ? db.prepare('SELECT subscription_plan, lang FROM users WHERE uid = ?').get(uid) as any
        : null;

    const userCtx = uid ? getContext(uid) : null;
    const longTermMemory = uid
        ? await KnowledgeGraph.getContext(uid, prompt).catch(() => '')
        : '';

    const systemPrompt = buildSystemPrompt(user, userCtx, longTermMemory);

    const historyMessages: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let iterMessages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: prompt },
    ];

    let lastToolUsed: string | null = null;

    for (let i = 0; i < 5; i++) {
        const assistantMessage = await chatUnified(iterMessages, uid ?? 0, TOOLS);
        iterMessages.push(assistantMessage);

        if (!assistantMessage.tool_calls?.length) {
            if (uid) {
                updateContext(uid, { lastActivity: Date.now() });
                KnowledgeGraph.addFact(uid, prompt + '\n' + (assistantMessage.content || '')).catch(() => {});
            }
            return { content: assistantMessage.content || '', tool_used: lastToolUsed };
        }

        for (const toolCall of assistantMessage.tool_calls) {
            const name = toolCall.function?.name;
            lastToolUsed = name;
            let args: any = {};
            try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch (_e) { }
            Logger.info('agent', `Tool call: ${name}`);
            const result = await handleToolUse(name, args, uid ?? 0);
            iterMessages.push({ role: 'tool', tool_call_id: toolCall.id, name, content: String(result) });
        }
    }

    return { content: '✅ Задача выполнена.', tool_used: lastToolUsed };
};
