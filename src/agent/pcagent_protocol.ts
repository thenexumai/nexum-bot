/**
 * NEXUM PC Agent WebSocket Protocol
 * Manages live WS connections and dispatches commands with approval flow.
 * Inspired by OpenClaw's exec-approval two-phase pattern.
 */

import { createLogger } from '../infra/logger';
import { checkSafety, auditLog, generateApprovalId, registerApproval } from './capabilities/safety';
import { requiresConfirmation, getActionClass, type ActionClass } from './capabilities/registry';
import { getUserTariff } from '../core/billing';

const log = createLogger('pcagent');

export type PcAction =
  | 'run_cmd' | 'mouse_move' | 'mouse_click' | 'key_press' | 'type_text'
  | 'file_list' | 'file_read' | 'file_write' | 'file_delete'
  | 'open_url' | 'screenshot' | 'sysinfo';

export interface PcCommand {
  command_id: string;
  action: PcAction;
  params: Record<string, unknown>;
  user_id: number;
}

export interface PcResponse {
  command_id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface WsLike {
  readyState: number;
  send(data: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface PendingCmd {
  resolve: (r: PcResponse) => void;
  reject: (e: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const connections = new Map<number, WsLike>();
const pending     = new Map<string, PendingCmd>();

// ── Connection management ─────────────────────────────────────────────────────

export function registerConnection(uid: number, ws: WsLike): void {
  connections.set(uid, ws);
  log.info(`Connected uid=${uid}`);

  ws.on('close', () => {
    connections.delete(uid);
    log.info(`Disconnected uid=${uid}`);
  });

  ws.on('message', (data: unknown) => {
    try {
      const resp = JSON.parse(String(data)) as PcResponse;
      const p = pending.get(resp.command_id);
      if (p) {
        clearTimeout(p.timeout);
        pending.delete(resp.command_id);
        p.resolve(resp);
      }
    } catch {
      log.warn('Failed to parse agent response');
    }
  });
}

export function isConnected(uid: number): boolean {
  return (connections.get(uid)?.readyState ?? -1) === 1;
}

export function getConnectionCount(): number { return connections.size; }

// ── Command dispatch with safety checks ──────────────────────────────────────

export interface SendCommandOptions {
  timeoutMs?: number;
  /** If provided, skip approval prompt (already approved) */
  approvalId?: string;
  chatId?: number;
  /** Bot instance for sending approval requests */
  sendApprovalRequest?: (chatId: number, approvalId: string, action: string, params: Record<string, unknown>) => Promise<void>;
}

export async function sendCommand(
  uid: number,
  action: PcAction,
  params: Record<string, unknown> = {},
  opts: SendCommandOptions = {}
): Promise<PcResponse> {
  const { timeoutMs = 30_000 } = opts;
  const plan = getUserTariff(uid);

  // Safety check
  const verdict = checkSafety({ uid, action, params, plan });
  if (!verdict.allow) {
    auditLog({ uid, action, params, verdict: 'blocked', reason: verdict.reason });
    return { command_id: '', success: false, error: verdict.reason };
  }

  // Confirmation check (OpenClaw-inspired two-phase approval)
  if (requiresConfirmation(action) && !opts.approvalId) {
    if (opts.sendApprovalRequest && opts.chatId) {
      const approvalId = generateApprovalId();
      return new Promise<PcResponse>((resolve) => {
        registerApproval({
          approvalId,
          uid,
          action,
          actionParams: params,
          chatId: opts.chatId!,
          resolve: (approved) => {
            if (approved) {
              auditLog({ uid, action, params, verdict: 'approved' });
              dispatchCommand(uid, action, params, timeoutMs).then(resolve).catch(e =>
                resolve({ command_id: '', success: false, error: (e as Error).message })
              );
            } else {
              auditLog({ uid, action, params, verdict: 'denied' });
              resolve({ command_id: '', success: false, error: 'Action denied by user' });
            }
          },
        });
        opts.sendApprovalRequest!(opts.chatId!, approvalId, action, params).catch(() => {});
      });
    }
    // No approval mechanism — block
    return { command_id: '', success: false, error: `Action "${action}" requires confirmation` };
  }

  auditLog({ uid, action, params, verdict: 'allowed' });
  return dispatchCommand(uid, action, params, timeoutMs);
}

async function dispatchCommand(
  uid: number, action: string, params: Record<string, unknown>, timeoutMs: number
): Promise<PcResponse> {
  const ws = connections.get(uid);
  if (!ws || ws.readyState !== 1) {
    throw new Error('PC Agent is offline. Use /link to connect your computer.');
  }

  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cmd: PcCommand = { command_id: commandId, action: action as PcAction, params, user_id: uid };

  return new Promise<PcResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(commandId);
      reject(new Error(`PC Agent command timed out (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    pending.set(commandId, { resolve, reject, timeout });

    try {
      ws.send(JSON.stringify(cmd));
    } catch (e) {
      clearTimeout(timeout);
      pending.delete(commandId);
      reject(new Error(`Failed to send command: ${(e as Error).message}`));
    }
  });
}
