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
 * Core AI executor with REAL token-by-token streaming.
 *
 * When streamCallback is provided:
 *   - Uses chatStream (SSE) → calls streamCallback for every token chunk
 *   - Falls back to chatUnified for tool-use iterations after first stream
 *
 * When streamCallback is NOT provided (REST / agent.html):
 *   - Uses chatUnified (non-streaming)
 */
export const executeAI = async (
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
    streamCallback?: (text: string) => void,
): Promise<AIResult> => {
    Logger.info('agent', `NEXUM Engine: Processing for UID ${uid ?? 'anonymous'}`);

    // ── deep_search shortcut ──────────────────────────────────────────────────
    if (prompt.startsWith('[deep_search] ')) {
        const query = prompt.slice('[deep_search] '.length).trim();
        Logger.info('agent', `Deep search mode: ${query}`);
        try {
            const result = await Perplexer.deepSearch(query, uid);
            streamCallback?.(result.answer);
            return { content: result.answer, sources: result.sources, tool_used: 'deep_search' };
        } catch (e) {
            Logger.error('agent', 'Perplexer failed', e);
            // fall through to normal chat
        }
    }

    const user = uid
        ? db.prepare('SELECT subscription_plan, lang FROM users WHERE uid = ?').get(uid) as any
        : null;

    const userCtx = uid ? getContext(uid) : null;

    // Long-term memory
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

    // Build message array
    const historyMessages: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: prompt },
    ];

    // ── STREAMING PATH (Telegram handler) ────────────────────────────────────
    if (streamCallback) {
        let fullResponse = '';
        try {
            // Real token-by-token streaming
            for await (const chunk of chatStream(messages, uid ?? 0)) {
                fullResponse += chunk;
                streamCallback(chunk);
            }
        } catch (err) {
            Logger.error('agent', 'Streaming failed, falling back to chatUnified', err);
            // Fallback: single-shot call
            const fallback = await chatUnified(messages, uid ?? 0, TOOLS);
            fullResponse = fallback.content || '';
            if (fullResponse) streamCallback(fullResponse);
        }

        // Persist to memory
        if (uid && fullResponse) {
            updateContext(uid, { lastActivity: Date.now() });
            KnowledgeGraph.addFact(uid, prompt + '\n' + fullResponse).catch(() => {});
        }

        return { content: fullResponse, tool_used: null };
    }

    // ── NON-STREAMING PATH (REST / agent.html) with tool-use loop ────────────
    let iterMessages = [...messages];
    let iterations = 0;
    const maxIterations = 5;
    let lastToolUsed: string | null = null;

    while (iterations < maxIterations) {
        iterations++;
        try {
            const assistantMessage = await chatUnified(iterMessages, uid ?? 0, TOOLS);
            iterMessages.push(assistantMessage);

            // No tool calls → done
            if (!assistantMessage.tool_calls?.length) {
                if (uid) {
                    updateContext(uid, { lastActivity: Date.now() });
                    KnowledgeGraph.addFact(uid, prompt + '\n' + (assistantMessage.content || '')).catch(() => {});
                }
                return {
                    content: assistantMessage.content || '',
                    tool_used: lastToolUsed,
                };
            }

            // Execute tool calls
            for (const toolCall of assistantMessage.tool_calls) {
                const name = toolCall.function?.name;
                lastToolUsed = name;
                let args: any = {};
                try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch (_e) { }

                Logger.info('agent', `Tool call: ${name}`);
                const result = await handleToolUse(name, args, uid ?? 0);

                iterMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name,
                    content: String(result),
                });
            }

        } catch (err) {
            Logger.error('agent', `Iteration ${iterations} failed`, err);
            if (iterations >= maxIterations) {
                return { content: '❌ Не удалось получить ответ. Попробуй позже.' };
            }
        }
    }

    return { content: '✅ Задача выполнена.' };
};
