import { Logger } from '../infra/logger';
import { getSoulContext } from '../soul/index';
import { getContext, updateContext } from '../state/user-context';
import { TOOLS, handleToolUse } from './tools';
import { chatUnified, Message } from './router';
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
 * Core AI executor.
 *
 * @param prompt       - User message
 * @param uid          - Telegram user ID (optional for REST calls from agent.html)
 * @param history      - Prior conversation messages for context (optional)
 * @param streamCallback - Called with each streamed chunk (optional, for Telegram handler)
 */
export const executeAI = async (
    prompt: string,
    uid?: number,
    history: { role: string; content: string }[] = [],
    streamCallback?: (text: string) => void,
): Promise<AIResult> => {
    Logger.info('agent', `NEXUM Engine: Processing for UID ${uid ?? 'anonymous'}`);

    // ── deep_search shortcut (triggered by mode=search in agent.html) ──
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

    // Long-term memory (only when uid is known)
    const longTermMemory = uid
        ? await KnowledgeGraph.getContext(uid, prompt).catch(() => '')
        : '';

    const systemPrompt = `
${getSoulContext()}

USER STATE:
- Language: ${user?.lang || 'ru'}
- Plan: ${user?.subscription_plan || 'free'}
- PC Agent: ${userCtx?.pcAgentConnected ? 'ONLINE' : 'OFFLINE'}

LONG-TERM MEMORY ABOUT USER:
${longTermMemory || 'No facts recalled yet.'}

MISSION: Be the ultimate personal AI. Use tools when needed.
Always respond in the user's language (${user?.lang || 'ru'}).
    `.trim();

    // Build message array: system + history + current prompt
    const historyMessages: Message[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: prompt },
    ];

    let iterations = 0;
    const maxIterations = 5;
    let lastToolUsed: string | null = null;

    while (iterations < maxIterations) {
        iterations++;
        try {
            const assistantMessage = await chatUnified(messages, uid, TOOLS);
            messages.push(assistantMessage);

            if (assistantMessage.content) {
                streamCallback?.(assistantMessage.content);
            }

            // No tool calls → done
            if (!assistantMessage.tool_calls?.length) {
                if (uid) {
                    updateContext(uid, { lastActivity: Date.now() });
                    KnowledgeGraph.addFact(uid, prompt + '\n' + assistantMessage.content).catch(() => {});
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
                try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch { }

                Logger.info('agent', `Tool call: ${name}`);
                const result = await handleToolUse(name, args, uid);

                messages.push({
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
