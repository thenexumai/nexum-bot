// NEXUM Billing & Tariff System
// Plans: Free / Middle / Pro

import { db } from './db';

export type TariffPlan = 'free' | 'middle' | 'pro';

export interface TariffConfig {
  plan: TariffPlan;
  priceUsd: number;
  dailyMessageLimit: number | null; // null = unlimited
  hasMemory: boolean;
  hasMiniApps: boolean;
  hasBYOK: boolean;
  hasPcAgent: boolean;
  hasSubagents: boolean;
}

export interface Features {
  hasMemory: boolean;
  hasMiniApps: boolean;
  hasBYOK: boolean;
  hasPcAgent: boolean;
  hasSubagents: boolean;
}

export const TARIFFS: Record<TariffPlan, TariffConfig> = {
  free: {
    plan: 'free',
    priceUsd: 0,
    dailyMessageLimit: 70,
    hasMemory: false,
    hasMiniApps: false,
    hasBYOK: false,
    hasPcAgent: false,
    hasSubagents: false,
  },
  middle: {
    plan: 'middle',
    priceUsd: 9,
    dailyMessageLimit: 300,
    hasMemory: true,
    hasMiniApps: true,
    hasBYOK: false,
    hasPcAgent: false,
    hasSubagents: false,
  },
  pro: {
    plan: 'pro',
    priceUsd: 15,
    dailyMessageLimit: null, // unlimited (user provides own keys)
    hasMemory: true,
    hasMiniApps: true,
    hasBYOK: true,
    hasPcAgent: true,
    hasSubagents: true,
  },
};

// ── Plan access ───────────────────────────────────────────────────────────────

export function getUserTariff(uid: number): TariffPlan {
  const row = (db as any).prepare('SELECT tariff FROM users WHERE uid=?').get(uid) as any;
  return (row?.tariff as TariffPlan) || 'free';
}

export function setUserTariff(uid: number, plan: TariffPlan) {
  (db as any).prepare(
    `INSERT INTO users (uid, tariff) VALUES (?,?)
     ON CONFLICT(uid) DO UPDATE SET tariff=excluded.tariff, updated_at=datetime('now')`
  ).run(uid, plan);
}

export function getTariffConfig(uid: number): TariffConfig {
  return TARIFFS[getUserTariff(uid)];
}

export function getFeatures(uid: number): Features {
  const t = getTariffConfig(uid);
  return {
    hasMemory: t.hasMemory,
    hasMiniApps: t.hasMiniApps,
    hasBYOK: t.hasBYOK,
    hasPcAgent: t.hasPcAgent,
    hasSubagents: t.hasSubagents,
  };
}

// ── Message counter ───────────────────────────────────────────────────────────

export function getMessageCountToday(uid: number): number {
  const today = new Date().toISOString().split('T')[0];
  const row = (db as any).prepare(
    `SELECT COUNT(*) as c FROM conversations WHERE uid=? AND date(created_at)=? AND role='user'`
  ).get(uid, today) as any;
  return row?.c || 0;
}

export function canSendMessage(uid: number): { ok: boolean; reason?: string; remaining?: number } {
  const tariff = getTariffConfig(uid);
  if (tariff.dailyMessageLimit === null) {
    return { ok: true };
  }
  const count = getMessageCountToday(uid);
  const remaining = tariff.dailyMessageLimit - count;
  if (remaining <= 0) {
    return {
      ok: false,
      reason: `Daily limit reached (${count}/${tariff.dailyMessageLimit}). Upgrade: /tariffs`,
    };
  }
  return { ok: true, remaining };
}

// ── Feature checks ────────────────────────────────────────────────────────────

export function hasFeature(uid: number, feature: keyof Features): boolean {
  const features = getFeatures(uid);
  return features[feature];
}

export function requireFeature(
  uid: number,
  feature: keyof Features,
  featureName: string
): { ok: boolean; reason?: string } {
  if (!hasFeature(uid, feature)) {
    const needsPlan = feature === 'hasPcAgent' ? 'Pro' :
                      feature === 'hasBYOK' ? 'Pro' :
                      feature === 'hasMiniApps' ? 'Middle or Pro' :
                      feature === 'hasMemory' ? 'Middle or Pro' : 'Pro';
    return {
      ok: false,
      reason: `${featureName} requires ${needsPlan} plan. See /tariffs`,
    };
  }
  return { ok: true };
}

// ── Upgrade messages ──────────────────────────────────────────────────────────

export function getUpgradeMessage(currentPlan: TariffPlan): string {
  const plans: Record<TariffPlan, string> = {
    free: `🆙 *Upgrade to Middle — $9/mo*\n\n` +
      `• 300 messages/day\n` +
      `• Long-term memory\n` +
      `• 7 mini-apps\n\n` +
      `*Upgrade to Pro — $15/mo*\n` +
      `• Unlimited messages (BYOK)\n` +
      `• PC Agent (control your computer)\n` +
      `• All mini-apps\n` +
      `• Background AI tasks\n\n` +
      `/tariffs for details`,
    middle: `🆙 *Upgrade to Pro — $15/mo*\n\n` +
      `• Unlimited messages (bring your own API keys)\n` +
      `• PC Agent (control your computer remotely)\n` +
      `• Background AI subagents\n` +
      `• Priority access\n\n` +
      `/tariffs for details`,
    pro: `✅ *You're on Pro!*\n\nAll features are available.\n\n• Add API keys: /setkey\n• PC Agent: /link`,
  };
  return plans[currentPlan];
}
