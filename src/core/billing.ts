/**
 * NEXUM Billing & Tariff System
 * Feature gating inspired by OpenClaw's tool-policy ownership model.
 */

import { db } from './db';

export type TariffPlan = 'free' | 'middle' | 'pro';

export interface TariffConfig {
  plan: TariffPlan;
  priceUsd: number;
  dailyMessageLimit: number | null;
  hasMemory: boolean;
  hasMiniApps: boolean;
  hasBYOK: boolean;
  hasPcAgent: boolean;
  hasSubagents: boolean;
}

export const TARIFFS: Record<TariffPlan, TariffConfig> = {
  free: {
    plan: 'free', priceUsd: 0, dailyMessageLimit: 70,
    hasMemory: false, hasMiniApps: false, hasBYOK: false,
    hasPcAgent: false, hasSubagents: false,
  },
  middle: {
    plan: 'middle', priceUsd: 9, dailyMessageLimit: 300,
    hasMemory: true, hasMiniApps: true, hasBYOK: false,
    hasPcAgent: false, hasSubagents: false,
  },
  pro: {
    plan: 'pro', priceUsd: 15, dailyMessageLimit: null,
    hasMemory: true, hasMiniApps: true, hasBYOK: true,
    hasPcAgent: true, hasSubagents: true,
  },
};

export type Feature = keyof Pick<
  TariffConfig,
  'hasMemory' | 'hasMiniApps' | 'hasBYOK' | 'hasPcAgent' | 'hasSubagents'
>;

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getUserTariff(uid: number): TariffPlan {
  const row = db.prepare('SELECT tariff FROM users WHERE uid=?').get(uid) as
    { tariff: string } | undefined;
  return (row?.tariff as TariffPlan) ?? 'free';
}

export function setUserTariff(uid: number, plan: TariffPlan): void {
  db.prepare(`
    INSERT INTO users (uid, tariff) VALUES (?, ?)
    ON CONFLICT(uid) DO UPDATE SET tariff=excluded.tariff, updated_at=datetime('now')
  `).run(uid, plan);
}

export function getTariffConfig(uid: number): TariffConfig {
  return TARIFFS[getUserTariff(uid)];
}

// ── Feature checks ────────────────────────────────────────────────────────────

export function hasFeature(uid: number, feature: Feature): boolean {
  return getTariffConfig(uid)[feature];
}

export function requireFeature(
  uid: number,
  feature: Feature,
  featureName: string
): { ok: boolean; reason?: string } {
  if (hasFeature(uid, feature)) return { ok: true };
  const plan = feature === 'hasPcAgent' || feature === 'hasBYOK' || feature === 'hasSubagents'
    ? 'Pro' : 'Middle or Pro';
  return { ok: false, reason: `${featureName} requires ${plan} plan — /tariffs` };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

export function getMessageCountToday(uid: number): number {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM conversations WHERE uid=? AND date(created_at)=? AND role='user'`
  ).get(uid, today) as { c: number };
  return row?.c ?? 0;
}

export function canSendMessage(uid: number): { ok: boolean; reason?: string; remaining?: number } {
  const tariff = getTariffConfig(uid);
  if (!tariff.dailyMessageLimit) return { ok: true };

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

// ── Messaging ─────────────────────────────────────────────────────────────────

export function getUpgradeMessage(plan: TariffPlan): string {
  if (plan === 'pro') return '✅ You\'re on Pro — all features unlocked.';
  if (plan === 'middle') {
    return `Upgrade to Pro ($15/mo) for:\n• Unlimited messages (BYOK)\n• PC Agent\n• Background tasks\n\n/tariffs`;
  }
  return `Upgrade to Middle ($9/mo) for memory + mini-apps.\nOr Pro ($15/mo) for everything including PC Agent.\n\n/tariffs`;
}
