/**
 * NEXUM Exec Approvals — two-phase confirmation for dangerous operations
 * Dangerous actions require explicit Telegram approval before execution.
 */

import { createLogger } from '../../infra/logger';

const log = createLogger('approvals');

export interface PendingApproval {
  id: string;
  uid: number;
  capability: string;
  args: Record<string, unknown>;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  resolve: (approved: boolean) => void;
}

// ── In-memory approval store ──────────────────────────────────────────────────

const pending = new Map<string, PendingApproval>();
const TIMEOUT_MS = 60_000; // 60 seconds

function generateId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type ApprovalNotifier = (
  uid: number,
  approvalId: string,
  description: string,
  capability: string,
  args: Record<string, unknown>,
) => Promise<void>;

let notifier: ApprovalNotifier | null = null;

export function setApprovalNotifier(fn: ApprovalNotifier): void {
  notifier = fn;
}

/**
 * Request approval for a dangerous operation.
 * Returns true if approved, false if denied or timed out.
 */
export async function requestApproval(
  uid: number,
  capability: string,
  args: Record<string, unknown>,
  description: string,
): Promise<boolean> {
  const id = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TIMEOUT_MS);

  const approved = await new Promise<boolean>((resolve) => {
    const approval: PendingApproval = {
      id, uid, capability, args, description,
      createdAt: now,
      expiresAt,
      resolve,
    };

    pending.set(id, approval);

    // Auto-deny on timeout
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        log.warn(`Approval ${id} timed out for uid=${uid} cap=${capability}`);
        pending.delete(id);
        resolve(false);
      }
    }, TIMEOUT_MS);

    // Send Telegram notification
    if (notifier) {
      notifier(uid, id, description, capability, args).catch(err => {
        log.error(`Failed to notify uid=${uid}: ${err}`);
        clearTimeout(timer);
        pending.delete(id);
        resolve(false);
      });
    } else {
      log.warn('No approval notifier set — auto-denying');
      clearTimeout(timer);
      pending.delete(id);
      resolve(false);
    }
  });

  return approved;
}

/**
 * Called when user clicks ✅ Allow or ❌ Deny in Telegram.
 */
export function resolveApproval(id: string, approved: boolean): boolean {
  const approval = pending.get(id);
  if (!approval) {
    log.warn(`Approval ${id} not found (expired or already resolved)`);
    return false;
  }

  pending.delete(id);
  approval.resolve(approved);
  log.info(`Approval ${id} ${approved ? 'APPROVED' : 'DENIED'} by uid=${approval.uid}`);
  return true;
}

export function getPendingApprovals(uid?: number): PendingApproval[] {
  const all = Array.from(pending.values());
  return uid !== undefined ? all.filter(a => a.uid === uid) : all;
}

export function formatApprovalMessage(
  approvalId: string,
  capability: string,
  args: Record<string, unknown>,
  description: string,
): string {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `  ${k}: \`${String(v).slice(0, 100)}\``)
    .join('\n');

  return [
    `⚠️ *NEXUM хочет выполнить опасное действие*`,
    ``,
    `🔧 **Действие:** \`${capability}\``,
    `📝 **Описание:** ${description}`,
    argsStr ? `⚙️ **Параметры:**\n${argsStr}` : '',
    ``,
    `🕐 *Запрос истечёт через 60 секунд*`,
    ``,
    `ID: \`${approvalId}\``,
  ].filter(Boolean).join('\n');
}
