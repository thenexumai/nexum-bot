/**
 * NEXUM Safety Layer
 *
 * OpenClaw has a sophisticated exec-approvals system with two-phase confirmation.
 * NEXUM adapts this for Telegram-first UX: inline keyboard confirm/deny.
 *
 * Safety checks happen BEFORE any action executes.
 */

import { db } from '../../core/db';
import {
  getCapability,
  getActionClass,
  isKnownAction,
  isBlockedCommand,
  getBlockReason,
} from './registry';
import { createLogger } from '../../infra/logger';
import type { TariffPlan } from '../../core/billing';

const log = createLogger('safety');

export type SafetyVerdict =
  | { allow: true }
  | { allow: false; reason: string; blocked?: boolean };

export interface ActionRequest {
  uid: number;
  action: string;
  params: Record<string, unknown>;
  plan: TariffPlan;
}

// Pending approval requests: approvalId → { uid, action, params, chatId, resolveMs }
const pendingApprovals = new Map<string, {
  uid: number;
  action: string;
  params: Record<string, unknown>;
  chatId: number;
  expiresAt: number;
  resolve: (approved: boolean) => void;
}>();

// ── Pre-execution safety check ────────────────────────────────────────────────

export function checkSafety(req: ActionRequest): SafetyVerdict {
  // 1. Must be known action
  if (!isKnownAction(req.action)) {
    return { allow: false, reason: `Unknown action: ${req.action}` };
  }

  // 2. Must require Pro plan (all PC actions do)
  if (req.plan !== 'pro') {
    return { allow: false, reason: 'PC Agent requires Pro plan. See /tariffs' };
  }

  // 3. Blocked command patterns (inspired by OpenClaw safety denylist)
  if (req.action === 'run_cmd') {
    const cmd = String(req.params.command ?? '');
    const reason = getBlockReason(cmd);
    if (reason) {
      log.warn(`BLOCKED cmd uid=${req.uid}: ${cmd.slice(0, 60)}`);
      return { allow: false, reason, blocked: true };
    }
  }

  // 4. File path safety — prevent traversal outside home
  if (req.action === 'file_read' || req.action === 'file_write' || req.action === 'file_delete') {
    const path = String(req.params.path ?? '');
    const safetyResult = validateFilePath(path);
    if (!safetyResult.ok) {
      return { allow: false, reason: safetyResult.reason };
    }
  }

  return { allow: true };
}

// ── Path safety (OpenClaw path-policy.ts equivalent) ─────────────────────────

const BLOCKED_PATH_PATTERNS = [
  /^\/etc\/shadow/, /^\/etc\/passwd/, /^\/etc\/sudoers/,
  /\/\.ssh\//, /\/\.aws\//, /\/\.env$/,
  /C:\\Windows\\System32/i, /C:\\Windows\\SysWOW64/i,
];

function validateFilePath(path: string): { ok: boolean; reason: string } {
  // Block traversal
  if (path.includes('..')) {
    return { ok: false, reason: 'Path traversal (../) is not allowed' };
  }

  // Block sensitive system paths
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return { ok: false, reason: `Access to sensitive path blocked: ${path}` };
    }
  }

  return { ok: true, reason: '' };
}

// ── Approval flow ─────────────────────────────────────────────────────────────

export function generateApprovalId(): string {
  return `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function registerApproval(params: {
  approvalId: string;
  uid: number;
  action: string;
  actionParams: Record<string, unknown>;
  chatId: number;
  resolve: (approved: boolean) => void;
}): void {
  pendingApprovals.set(params.approvalId, {
    uid: params.uid,
    action: params.action,
    params: params.actionParams,
    chatId: params.chatId,
    expiresAt: Date.now() + 120_000, // 2 min
    resolve: params.resolve,
  });

  // Auto-deny after expiry
  setTimeout(() => {
    const p = pendingApprovals.get(params.approvalId);
    if (p) {
      pendingApprovals.delete(params.approvalId);
      p.resolve(false);
    }
  }, 120_000);
}

export function resolveApproval(approvalId: string, approved: boolean): boolean {
  const p = pendingApprovals.get(approvalId);
  if (!p) return false;
  if (Date.now() > p.expiresAt) {
    pendingApprovals.delete(approvalId);
    return false;
  }
  pendingApprovals.delete(approvalId);
  p.resolve(approved);
  return true;
}

export function getPendingApproval(approvalId: string) {
  return pendingApprovals.get(approvalId) ?? null;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export function auditLog(params: {
  uid: number;
  action: string;
  params: Record<string, unknown>;
  verdict: 'allowed' | 'blocked' | 'approved' | 'denied';
  reason?: string;
}): void {
  const safe_params = { ...params.params };
  // Redact sensitive values
  if ('api_key' in safe_params) safe_params['api_key'] = '[REDACTED]';
  if ('password' in safe_params) safe_params['password'] = '[REDACTED]';

  log.info(
    `AUDIT uid=${params.uid} action=${params.action} verdict=${params.verdict}` +
    (params.reason ? ` reason=${params.reason}` : '')
  );

  // Persist to DB for audit trail
  try {
    db.prepare(
      `INSERT INTO tool_results (uid, tool_name, input, success, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(
      params.uid,
      params.action,
      JSON.stringify(safe_params).slice(0, 500),
      params.verdict === 'allowed' || params.verdict === 'approved' ? 1 : 0
    );
  } catch { /* non-critical */ }
}
