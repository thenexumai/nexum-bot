import db from '../core/db';
import { Logger } from '../infra/logger';

export const detectIntent = async (text: string, uid: number) => {
    const lowerText = text.toLowerCase();

    // 💰 Finance - Income
    const incomeMatch = text.match(/получил\s+(\d+)/i);
    if (incomeMatch) {
        const amount = parseInt(incomeMatch[1]);
        db.prepare('INSERT INTO finance (uid, type, amount, category) VALUES (?, ?, ?, ?)').run(uid, 'income', amount, 'salary');
        Logger.info('agent', `User ${uid} added income: ${amount}`);
        return { type: 'finance', action: 'added_income', amount };
    }

    // 💰 Finance - Expense
    const expenseMatch = text.match(/потратил\s+(\d+)\s+на\s+(.+)/i);
    if (expenseMatch) {
        const amount = parseInt(expenseMatch[1]);
        const category = expenseMatch[2];
        db.prepare('INSERT INTO finance (uid, type, amount, category) VALUES (?, ?, ?, ?)').run(uid, 'expense', amount, category);
        Logger.info('agent', `User ${uid} added expense: ${amount} for ${category}`);
        return { type: 'finance', action: 'added_expense', amount, category };
    }

    // 📝 Tasks
    const taskMatch = text.match(/купить\s+(.+)|встреча\s+(.+)|задача\s+(.+)/i);
    if (taskMatch) {
        const title = taskMatch[1] || taskMatch[2] || taskMatch[3];
        db.prepare('INSERT INTO tasks (uid, title) VALUES (?, ?)').run(uid, title);
        Logger.info('agent', `User ${uid} added task: ${title}`);
        return { type: 'tasks', action: 'added_task', title };
    }

    // 📒 Notes
    const noteMatch = text.match(/запомни\s+(.+)/i);
    if (noteMatch) {
        const content = noteMatch[1];
        db.prepare('INSERT INTO notes (uid, title, content) VALUES (?, ?, ?)').run(uid, 'Auto Note', content);
        Logger.info('agent', `User ${uid} added note: ${content}`);
        return { type: 'notes', action: 'added_note', content };
    }

    return null;
};
