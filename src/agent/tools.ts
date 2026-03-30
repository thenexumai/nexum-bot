import { webSearch } from '../tools/search';
import { Perplexer } from './perplexer';
import { Logger } from '../infra/logger';
import { agentConnections, pendingRequests } from '../index';
import { MissionControl } from '../core/tasks/mission_control';
import { PolicyEnforcer } from './policies/enforcer';
import { KnowledgeGraph } from '../core/memory/knowledge_graph';

// ============================================================
//  TOOL DEFINITIONS (OpenAI function-calling format)
// ============================================================

export const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'deep_search',
            description: 'Search the web for current information. Use when user asks about news, facts, prices, or anything needing fresh data.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'What to search for.' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_memory',
            description: 'Save an important fact about the user to long-term memory. Use when user shares personal info, preferences, or goals.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Short identifier for the fact (e.g. "user_name", "favorite_color").' },
                    value: { type: 'string', description: 'The fact to remember.' },
                },
                required: ['key', 'value'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'recall_memory',
            description: 'Look up what is known about the user from long-term memory.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'What to look up.' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'start_mission',
            description: 'Start a background autonomous mission (research, monitoring, scheduled tasks).',
            parameters: {
                type: 'object',
                properties: {
                    objective: { type: 'string', description: 'The goal of the mission.' },
                },
                required: ['objective'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'pc_command',
            description: "Execute a command on the user's connected PC via the NEXUM agent.",
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['shell', 'screenshot', 'mouse_move', 'click', 'key_press', 'type_text', 'list_files', 'read_file', 'write_file', 'delete_file', 'sysinfo'],
                        description: 'The type of PC action to perform.',
                    },
                    args: {
                        type: 'object',
                        description: 'Arguments for the action (e.g. {"command": "ls -la"} for shell).',
                    },
                },
                required: ['action', 'args'],
            },
        },
    },
];

// ============================================================
//  TOOL HANDLER
// ============================================================

export const handleToolUse = async (toolName: string, args: any, uid: number): Promise<string> => {
    Logger.info('agent', `Tool: ${toolName} | UID: ${uid} | Args: ${JSON.stringify(args).slice(0, 100)}`);

    switch (toolName) {

        case 'deep_search': {
            try {
                const result = await Perplexer.deepSearch(args.query);
                const sources = result.sources
                    ?.slice(0, 3)
                    .map((s: any, i: number) => `[${i + 1}] ${s.title}: ${s.link}`)
                    .join('\n') || '';
                return `${result.answer}\n\n${sources ? `Sources:\n${sources}` : ''}`.trim();
            } catch (e: any) {
                return `Search failed: ${e.message}`;
            }
        }

        case 'add_memory': {
            if (!args.key || !args.value) return 'Error: key and value required.';
            KnowledgeGraph.saveManual(uid, args.key, args.value);
            return `✅ Запомнил: ${args.key} = ${args.value}`;
        }

        case 'recall_memory': {
            const context = await KnowledgeGraph.getContext(uid, args.query || '');
            if (!context) return 'No relevant memories found.';
            return `Known facts:\n${context}`;
        }

        case 'start_mission': {
            try {
                const missionId = await MissionControl.createMission(uid, args.objective);
                return `Mission #${missionId} started. You'll get a Telegram notification when done.`;
            } catch (e: any) {
                return `Mission failed to start: ${e.message}`;
            }
        }

        case 'pc_command': {
            // Safety checks
            if (args.action === 'shell' && PolicyEnforcer.isCommandBlocked(args.args?.command)) {
                return '❌ ERROR: Command blocked by safety policy.';
            }
            if (args.args?.path && PolicyEnforcer.isPathBlocked(args.args.path)) {
                return '❌ ERROR: Path access restricted by safety policy.';
            }
            return await dispatchToAgent(uid, args.action, args.args);
        }

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
                    resolve('📸 Screenshot captured. Sending to Telegram...');
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
