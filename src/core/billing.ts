// NEXUM Billing & Tariff System
// Тарифы: Free / Middle / Pro

export type TariffPlan = 'free' | 'middle' | 'pro';

export interface TariffConfig {
  plan: TariffPlan;
  priceUsd: number;
  dailyMessageLimit: number | null; // null = безлимит
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
    dailyMessageLimit: null, // безлимит (за счёт BYOK)
    hasMemory: true,
    hasMiniApps: true,
    hasBYOK: true,
    hasPcAgent: true,
    hasSubagents: true,
  },
};

// ── Database helpers ─────────────────────────────────────────────────────────

import { db } from './db';

export function getUserTariff(uid: number): TariffPlan {
  const row = db.prepare('SELECT tariff FROM users WHERE uid=?').get(uid) as any;
  return (row?.tariff as TariffPlan) || 'free';
}

export function setUserTariff(uid: number, plan: TariffPlan) {
  db.prepare('INSERT INTO users (uid, tariff) VALUES (?,?) ON CONFLICT(uid) DO UPDATE SET tariff=excluded.tariff').run(uid, plan);
}

export function getTariffConfig(uid: number): TariffConfig {
  const plan = getUserTariff(uid);
  return TARIFFS[plan];
}

// ── Message counter ──────────────────────────────────────────────────────────

export function getMessageCountToday(uid: number): number {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM conversations 
    WHERE uid=? AND date(created_at)=? AND role='user'
  `).get(uid, today) as any;
  return row?.c || 0;
}

export function canSendMessage(uid: number): { ok: boolean; reason?: string; remaining?: number } {
  const tariff = getTariffConfig(uid);
  if (tariff.dailyMessageLimit === null) {
    return { ok: true }; // безлимит
  }
  const count = getMessageCountToday(uid);
  const remaining = tariff.dailyMessageLimit - count;
  if (remaining <= 0) {
    return {
      ok: false,
      reason: `Лимит сообщений исчерпан (${count}/${tariff.dailyMessageLimit}/день). Upgrade: /tariffs`,
    };
  }
  return { ok: true, remaining };
}

// ── Feature checks ───────────────────────────────────────────────────────────

export function hasFeature(uid: number, feature: 'memory' | 'miniapps' | 'byok' | 'pcagent' | 'subagents'): boolean {
  const tariff = getTariffConfig(uid);
  switch (feature) {
    case 'memory': return tariff.hasMemory;
    case 'miniapps': return tariff.hasMiniApps;
    case 'byok': return tariff.hasBYOK;
    case 'pcagent': return tariff.hasPcAgent;
    case 'subagents': return tariff.hasSubagents;
    default: return false;
  }
}

export function getPcAgentAccess(uid: number): { ok: boolean; reason?: string } {
  const tariff = getTariffConfig(uid);
  if (!tariff.hasPcAgent) {
    return {
      ok: false,
      reason: `PC Agent доступен только в тарифе Pro ($15/мес). Upgrade: /tariffs`,
    };
  }
  return { ok: true };
}

export function getUpgradeMessage(currentPlan: TariffPlan): string {
  const plans = {
    free: `🆙 *Upgrade до Middle — $9/мес*\n\n` +
      `• 300 сообщений/день\n` +
      `• Память и контекст\n` +
      `• Мини-апы (7 шт)\n\n` +
      `*Upgrade до Pro — $15/мес*\n` +
      `• Безлимит сообщений (BYOK)\n` +
      `• PC Agent (управление ПК)\n` +
      `• Все мини-апы\n` +
      `• Subagents\n\n` +
      `Команда: /tariffs`,
    middle: `🆙 *Upgrade до Pro — $15/мес*\n\n` +
      `• Безлимит сообщений (BYOK)\n` +
      `• PC Agent (управление ПК)\n` +
      `• Все мини-апы\n` +
      `• Subagents\n\n` +
      `Команда: /tariffs`,
    pro: `✅ У вас уже тариф Pro!\n\n` +
      `• Все функции доступны\n` +
      `• Используйте /setkey для BYOK\n` +
      `• PC Agent: /pcagent`,
  };
  return plans[currentPlan];
}
