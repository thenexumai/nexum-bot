import { webSearch } from '../tools/search';
import { Perplexer } from './perplexer';
import { Logger } from '../infra/logger';
import { agentConnections, pendingRequests } from '../index';
import { MissionControl } from '../core/tasks/mission_control';
import { PolicyEnforcer } from './policies/enforcer';
import { KnowledgeGraph } from '../core/memory/knowledge_graph';
import { CoderAgent } from '../intelligence/coder';
import { VisionReasoning } from '../intelligence/vision';
import { AILogger } from '../infra/ai_logger';
import { AutoPatcher } from './capabilities/auto_patcher';

// ============================================================
//  TOOL DEFINITIONS (OpenAI function-calling format)
// ============================================================

export const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'deep_search',
            description: 'Search the web for current information (Perplexity-style).',
            parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'coding_task',
            description: 'Write, refactor, or explain code across project files.',
            parameters: {
                type: 'object',
                properties: {
                    instruction: { type: 'string' },
                    files: { type: 'array', items: { type: 'string' } }
                },
                required: ['instruction', 'files'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'analyze_ui',
            description: 'Use vision to analyze browser screen and find elements.',
            parameters: {
                type: 'object',
                properties: { objective: { type: 'string' } },
                required: ['objective'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_click',
            description: 'Click on a web element by its nexum_id.',
            parameters: {
                type: 'object',
                properties: { nexum_id: { type: 'number' } },
                required: ['nexum_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'browser_type',
            description: 'Type text into a web element by its nexum_id.',
            parameters: {
                type: 'object',
                properties: { nexum_id: { type: 'number' }, text: { type: 'string' } },
                required: ['nexum_id', 'text'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'start_mission',
            description: 'Start a long-running background autonomous task.',
            parameters: {
                type: 'object',
                properties: { objective: { type: 'string' } },
                required: ['objective'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'pc_command',
            description: "Execute a command on the user's PC via NEXUM agent.",
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['shell', 'screenshot', 'mouse_move', 'click', 'key_press', 'type_text', 'list_files', 'read_file', 'write_file', 'sysinfo'] },
                    args: { type: 'object' },
                },
                required: ['action', 'args'],
            },
        },
    },
];

export const handleToolUse = async (toolName: string, args: any, uid: number): Promise<string> => {
    Logger.info('agent', `Tool Call: ${toolName} | UID: ${uid}`);
    AILogger.logThought(uid, `Executing tool: ${toolName}...`);

    switch (toolName) {
        case 'deep_search':
            AILogger.logThought(uid, `Searching the web for: ${args.query}`);
            const search = await Perplexer.deepSearch(args.query);
            return `${search.answer}\n\nSources: ${search.sources.slice(0,3).map(s => s.link).join(', ')}`;

        case 'coding_task':
            AILogger.logThought(uid, `Writing code based on instruction: ${args.instruction}`);
            const coderResult = await CoderAgent.solve(args.instruction, args.files);
            if (coderResult.status === 'success') {
                AutoPatcher.applyChanges(coderResult.raw!);
                return `Code applied successfully to files: ${args.files.join(', ')}`;
            }
            return `Coder Error: ${coderResult.message}`;

        case 'analyze_ui':
            AILogger.logThought(uid, `Analyzing your screen to find: ${args.objective}`);
            const screenshot = await dispatchToAgent(uid, 'screenshot', {});
            const vision = await VisionReasoning.planNextAction(screenshot, args.objective, uid);
            AILogger.logThought(uid, `Vision Plan: ${vision.thought}`);
            return `UI Analysis Result: ${JSON.stringify(vision)}`;

        case 'browser_click':
            return await dispatchToAgent(uid, 'browser_click', { nexum_id: args.nexum_id });

        case 'browser_type':
            return await dispatchToAgent(uid, 'browser_type', { nexum_id: args.nexum_id, text: args.text });

        case 'start_mission':
            const missionId = await MissionControl.createMission(uid, args.objective);
            return `Mission #${missionId} initiated. Check Mission Dashboard.`;

        case 'pc_command':
            AILogger.logThought(uid, `Executing PC command: ${args.action}`);
            if (args.action === 'shell' && PolicyEnforcer.isCommandBlocked(args.args?.command)) return '❌ BLOCKED BY POLICY';
            return await dispatchToAgent(uid, args.action, args.args);

        default:
            return `Unknown tool: ${toolName}`;
    }
};

// ============================================================
//  PC AGENT BRIDGE (WebSocket)
// ============================================================

async function dispatchToAgent(uid: number, action: string, args: any): Promise<string> {
    const ws = agentConnections.get(uid);
    if (!ws) {
        return '❌ PC Agent не подключён. Запусти nexum_agent.py на своём компьютере, затем используй /link_pc.';
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(requestId);
            resolve('❌ PC Agent timeout (30s). Агент не ответил.');
        }, 30000);

        pendingRequests.set(requestId, (response: any) => {
            clearTimeout(timeout);
            if (response.status === 'success') {
                if (action === 'screenshot') {
                    resolve(response.result); // Возвращаем base64
                } else {
                    resolve(`✅ ${JSON.stringify(response.result)}`);
                }
            } else {
                resolve(`❌ Agent error: ${response.error}`);
            }
        });

        ws.send(JSON.stringify({ type: 'command', requestId, action, args }));
    });
}
