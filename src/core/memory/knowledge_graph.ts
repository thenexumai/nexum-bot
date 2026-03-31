import db from '../db';
import { chatUnified } from '../../agent/router';
import { Logger } from '../../infra/logger';

export class KnowledgeGraph {
    /**
     * Extract entities from conversation and store in memory table.
     * FIX: now passes uid to chatUnified for BYOK support.
     */
    static async addFact(uid: number, text: string): Promise<void> {
        const prompt = `Extract knowledge from this text as JSON.
Text: "${text.slice(0, 500)}"
Return ONLY valid JSON, no markdown:
{"facts": [{"key": "short_fact_key", "value": "fact_value"}]}
Max 5 facts. Skip generic phrases.`;

        try {
            // FIX: uid is now passed
            const response = await chatUnified(
                [{ role: 'user', content: prompt }],
                uid
            );

            const raw = (response.content || '').replace(/```json|```/g, '').trim();
            const data = JSON.parse(raw);

            if (!Array.isArray(data?.facts)) return;

            const stmt = db.prepare(`
                INSERT INTO memory (uid, key, value, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(uid, key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = datetime('now')
            `);

            for (const fact of data.facts) {
                if (fact?.key && fact?.value) {
                    stmt.run(uid, String(fact.key).slice(0, 100), String(fact.value).slice(0, 500));
                }
            }

            Logger.success('memory', `Knowledge graph updated for UID ${uid}: ${data.facts.length} facts`);
        } catch (e) {
            // Silent fail — knowledge graph is non-critical
            Logger.warn('memory', `Knowledge graph update skipped for UID ${uid}`);
        }
    }

    /**
     * Retrieve relevant memory facts for a given query.
     */
    static async getContext(uid: number, query: string): Promise<string> {
        try {
            const words = query
                .toLowerCase()
                .split(/\s+/)
                .filter(w => w.length > 3)
                .slice(0, 5);

            if (!words.length) return '';

            const results: string[] = [];

            for (const word of words) {
                const rows = db.prepare(
                    "SELECT key, value FROM memory WHERE uid = ? AND (key LIKE ? OR value LIKE ?) LIMIT 3"
                ).all(uid, `%${word}%`, `%${word}%`) as any[];

                for (const row of rows) {
                    const line = `- ${row.key}: ${row.value}`;
                    if (!results.includes(line)) results.push(line);
                }
            }

            return results.slice(0, 10).join('\n');
        } catch {
            return '';
        }
    }

    /**
     * Manually save a fact (used by add_memory tool).
     */
    static saveManual(uid: number, key: string, value: string): void {
        db.prepare(`
            INSERT INTO memory (uid, key, value, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(uid, key) DO UPDATE SET
                value = excluded.value,
                updated_at = datetime('now')
        `).run(uid, key.slice(0, 100), value.slice(0, 500));
    }

    /**
     * List all facts for a user.
     */
    static listFacts(uid: number): { key: string; value: string }[] {
        return db.prepare(
            "SELECT key, value FROM memory WHERE uid = ? ORDER BY updated_at DESC LIMIT 20"
        ).all(uid) as any[];
    }

    /**
     * Delete a fact by key.
     */
    static deleteFact(uid: number, key: string): void {
        db.prepare("DELETE FROM memory WHERE uid = ? AND key = ?").run(uid, key);
    }
}
