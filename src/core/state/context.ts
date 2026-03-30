import db from '../db';

export interface UserContext {
    uid: number;
    last_action: string;
    current_os: string;
    recent_tasks: string[];
    finance_summary: string;
    environment: {
        workspace: string;
        is_pc_connected: boolean;
    };
}

export const buildUserContext = (uid: number): UserContext => {
    // 1. Get finance stats
    const finance = db.prepare('SELECT type, SUM(amount) as total FROM finance WHERE uid = ? GROUP BY type').all(uid) as any[];
    const balance = finance.reduce((acc, f) => f.type === 'income' ? acc + f.total : acc - f.total, 0);

    // 2. Get recent tasks
    const tasks = db.prepare('SELECT title FROM tasks WHERE uid = ? AND status = "pending" LIMIT 5').all(uid) as any[];

    // 3. Mock environment (in real: from PC Agent)
    return {
        uid,
        last_action: 'User requested assistance.',
        current_os: 'Windows 11 (via PC Agent)',
        recent_tasks: tasks.map(t => t.title),
        finance_summary: `Current Balance: ${balance}.`,
        environment: {
            workspace: 'C:/Users/Timur/NEXUM-v1-beta',
            is_pc_connected: true
        }
    };
};

export const contextToSystemPrompt = (context: UserContext): string => {
    return `
USER CONTEXT:
- OS: ${context.current_os}
- Workspace: ${context.environment.workspace}
- PC Connected: ${context.environment.is_pc_connected ? 'YES' : 'NO'}
- Recent Tasks: ${context.recent_tasks.join(', ') || 'None'}
- Finance: ${context.finance_summary}
`;
};
