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

/**
 * executeAI — AsyncGenerator для стриминга токенов.
 *
 * handler.ts делает: for await (const chunk of executeAI(...))
 * Каждый chunk — строка-токен из AI провайдера.
 * После итерации handler читает .result для финального контента.
 */
export async function* executeAI(
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): AsyncGenerator<string, void, unknown> {

    Logger.info('agent', `NEXUM Engine: Processing for UID ${uid ?? 'anonymous'}`);

    // ── deep_search shortcut ──────────────────────────────────────────────────
    if (prompt.startsWith('[deep_search] ')) {
        const query = prompt.slice('[deep_search] '.length).trim();
        Logger.info('agent', `Deep search mode: ${query}`);
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
            // fall through to normal chat
        }
    }

    const user = uid
        ? db.prepare('SELECT subscription_plan, lang FROM users WHERE uid = ?').get(uid) as any
        : null;

    const userCtx = uid ? getContext(uid) : null;

    const longTermMemory = uid
        ? await KnowledgeGraph.getContext(uid, prompt).catch(() => '')
        : '';

    const baseSoul = getSoulContextSync();

    const systemPrompt = `
${baseSoul}

USER STATE:
- Language: ${user?.lang || 'ru'}
- Plan: ${user?.subscription_plan || 'free'}
- PC Agent: ${userCtx?.pcAgentConnected ? 'ONLINE' : 'OFFLINE'}

LONG-TERM MEMORY ABOUT USER:
${longTermMemory || 'No facts recalled yet.'}

MISSION: Be the ultimate personal AI. Use tools when needed.
Always respond in the user's language (${user?.lang || 'ru'}).
    `.trim();

    const historyMessages: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: prompt },
    ];

    // ── STREAMING PATH ────────────────────────────────────────────────────────
    let fullResponse = '';
    try {
        for await (const chunk of chatStream(messages, uid ?? 0)) {
            fullResponse += chunk;
            yield chunk;
        }
    } catch (err) {
        Logger.error('agent', 'Streaming failed, falling back to chatUnified', err);
        // Fallback — single-shot, yield whole response at once
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

    // Persist to memory after streaming completes
    if (uid && fullResponse) {
        updateContext(uid, { lastActivity: Date.now() });
        KnowledgeGraph.addFact(uid, prompt + '\n' + fullResponse).catch(() => {});
    }
}

/**
 * executeAIOnce — non-streaming version for REST API / agent.html
 * Uses tool-use loop via chatUnified.
 */
export const executeAIOnce = async (
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
): Promise<AIResult> => {
    Logger.info('agent', `NEXUM REST: Processing for UID ${uid ?? 'anonymous'}`);

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

    const systemPrompt = `
${getSoulContextSync()}

USER STATE:
- Language: ${user?.lang || 'ru'}
- Plan: ${user?.subscription_plan || 'free'}
- PC Agent: ${userCtx?.pcAgentConnected ? 'ONLINE' : 'OFFLINE'}

LONG-TERM MEMORY: ${longTermMemory || 'No facts recalled yet.'}
    `.trim();

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
