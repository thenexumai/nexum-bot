import db from './db';

export type Plan = 'free' | 'middle' | 'pro';

export const PLANS = {
    free: {
        msgLimit: 70,
        features: ['basic_ai', 'system_keys'],
        price: 0
    },
    middle: {
        msgLimit: 300,
        features: ['basic_ai', 'system_keys', 'memory', 'mini_apps'],
        price: 9
    },
    pro: {
        msgLimit: Infinity,
        features: ['basic_ai', 'system_keys', 'memory', 'mini_apps', 'pc_agent', 'byok'],
        price: 15
    }
};

export const getUserPlan = (uid: number): Plan => {
    const user = db.prepare('SELECT subscription_plan FROM users WHERE uid = ?').get(uid) as any;
    return (user?.subscription_plan as Plan) || 'free';
};

export const canUseFeature = (uid: number, feature: string): boolean => {
    const plan = getUserPlan(uid);
    return PLANS[plan].features.includes(feature);
};

export const getRateLimit = (uid: number): number => {
    const plan = getUserPlan(uid);
    return PLANS[plan].msgLimit;
};

export const setPlan = (uid: number, plan: Plan, days: number) => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    db.prepare(`
        UPDATE users 
        SET subscription_plan = ?, subscription_expires_at = ? 
        WHERE uid = ?
    `).run(plan, expiresAt.toISOString(), uid);
};

/** Alias for setPlan — used in admin commands */
export const grantPlan = setPlan;

/** Revoke — reset to free */
export const revokePlan = (uid: number) => {
    db.prepare(`
        UPDATE users SET subscription_plan = 'free', subscription_expires_at = NULL WHERE uid = ?
    `).run(uid);
};
