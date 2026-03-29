import db from './db';

export type Plan = 'free' | 'middle' | 'pro';

const DAILY_LIMITS: Record<Plan, number> = {
  free:   70,
  middle: 300,
  pro:    Infinity,
};

const PLAN_FEATURES: Record<Plan, string[]> = {
  free:   ['ai_chat', 'search', 'tasks', 'finance'],
  middle: ['ai_chat', 'search', 'tasks', 'finance', 'notes', 'habits', 'calendar',
           'contacts', 'memory', 'mini_apps', 'reminders', 'voice', 'tts'],
  pro:    ['ai_chat', 'search', 'tasks', 'finance', 'notes', 'habits', 'calendar',
           'contacts', 'memory', 'mini_apps', 'reminders', 'voice', 'tts',
           'pc_agent', 'byok', 'unlimited'],
};

export function getUserPlan(uid: number): Plan {
  const row = db.prepare(
    "SELECT subscription_plan, subscription_expires_at FROM users WHERE uid = ?"
  ).get(uid) as { subscription_plan: Plan; subscription_expires_at: string | null } | undefined;

  if (!row) return 'free';
  if (row.subscription_plan === 'free') return 'free';
  if (!row.subscription_expires_at) return row.subscription_plan;

  const expires = new Date(row.subscription_expires_at);
  if (expires < new Date()) {
    db.prepare("UPDATE users SET subscription_plan = 'free' WHERE uid = ?").run(uid);
    return 'free';
  }
  return row.subscription_plan;
}

export function canUseFeature(uid: number, feature: string): boolean {
  const plan = getUserPlan(uid);
  return PLAN_FEATURES[plan].includes(feature);
}

export function getRateLimit(uid: number): number {
  return DAILY_LIMITS[getUserPlan(uid)];
}

export function checkRateLimit(uid: number, currentCount: number): boolean {
  const limit = getRateLimit(uid);
  return currentCount <= limit;
}

export function grantPlan(uid: number, plan: Plan, days: number) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  db.prepare(
    "UPDATE users SET subscription_plan = ?, subscription_expires_at = ? WHERE uid = ?"
  ).run(plan, expires.toISOString(), uid);
}

export function revokePlan(uid: number) {
  db.prepare(
    "UPDATE users SET subscription_plan = 'free', subscription_expires_at = NULL WHERE uid = ?"
  ).run(uid);
}

export function getPlanInfo(plan: Plan) {
  const prices: Record<Plan, string> = { free: 'Бесплатно', middle: '$9/мес', pro: '$15/мес' };
  return {
    name: plan.toUpperCase(),
    price: prices[plan],
    dailyLimit: DAILY_LIMITS[plan] === Infinity ? '∞' : DAILY_LIMITS[plan],
    features: PLAN_FEATURES[plan],
  };
}
