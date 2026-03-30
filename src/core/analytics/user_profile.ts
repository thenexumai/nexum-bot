import db from '../db';
import { chatUnified } from '../../agent/router';
import { Logger } from '../../infra/logger';

export class UserProfileAnalyzer {
    static async updateProfile(uid: number, lastInteraction: string) {
        Logger.info('analytics', `Analyzing user behavior for UID: ${uid}`);

        const prompt = `
            Analyze this interaction and extract user traits, interests, and preferences.
            Interaction: "${lastInteraction}"
            
            Return JSON: { "traits": ["focused", "technical"], "interests": ["AI", "Crypto"], "pref": {"tone": "concise"} }
        `;

        try {
            const response = await chatUnified([{ role: 'user', content: prompt }]);
            const data = JSON.parse(response.content.replace(/```json|```/g, '').trim());

            // Сохраняем черты в память (key: trait_X)
            for (const trait of data.traits) {
                db.prepare(`
                    INSERT INTO memory (uid, key, value, updated_at)
                    VALUES (?, ?, 'true', datetime('now'))
                    ON CONFLICT(uid, key) DO UPDATE SET updated_at = excluded.updated_at
                `).run(uid, `trait_${trait}`);
            }

            Logger.success('analytics', `User profile updated for ${uid}`);
        } catch (e) {
            Logger.error('analytics', 'Failed to analyze profile', e);
        }
    }
}
