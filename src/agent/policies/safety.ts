/**
 * NEXUM Safety Policy — OpenClaw-style capability classification
 * Three tiers: SAFE → execute immediately, SENSITIVE → log, DANGEROUS → require Telegram approval
 */

import { createLogger } from '../../infra/logger';

const log = createLogger('safety');

export type SafetyLevel = 'safe' | 'sensitive' | 'dangerous';

export interface PolicyDecision {
  level: SafetyLevel;
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
}

// ── Capability classification ──────────────────────────────────────────────────

const SAFE_CAPABILITIES = new Set([
  'screenshot', 'sysinfo', 'file_read', 'list_dir', 'get_clipboard',
  'get_processes', 'get_network', 'get_battery', 'get_screen_size',
]);

const SENSITIVE_CAPABILITIES = new Set([
  'mouse_move', 'mouse_click', 'key_press', 'type_text', 'scroll',
  'file_write', 'create_dir', 'copy_file', 'move_file',
  'browser_navigate', 'browser_click', 'browser_fill',
]);

const DANGEROUS_CAPABILITIES = new Set([
  'shell_exec', 'file_delete', 'rmdir', 'kill_process',
  'browser_download', 'registry_write', 'sudo_exec',
]);

// ── Shell command blacklist ────────────────────────────────────────────────────

const BLOCKED_COMMANDS = [
  /^rm\s+-rf?\s+\//, /^rmdir\s+\//, /^mkfs/, /^dd\s+if=/,
  /^format\s+[a-z]:/i, /^del\s+\/[sf]/i, /^shutdown/, /^reboot/,
  /^halt/, /^init\s+0/, />\s*\/dev\/s/, /^:\(\)\{.*\}/,  // fork bomb
  /^curl.*\|\s*sh/, /^wget.*\|\s*sh/, /^python.*-c.*exec/,
];

// ── Path blacklist ─────────────────────────────────────────────────────────────

const BLOCKED_PATHS = [
  /^\/System/, /^\/Library\/System/, /^\/etc\/shadow/, /^\/etc\/passwd/,
  /^C:\\Windows\\System32/i, /^C:\\Windows\\SysWOW64/i,
  /\.ssh[\/\\]/, /\.aws[\/\\]/, /\.gnupg[\/\\]/,
  /id_rsa/, /id_ecdsa/, /id_ed25519/,
];

// ── Public API ─────────────────────────────────────────────────────────────────

export function classifyCapability(capability: string): SafetyLevel {
  if (SAFE_CAPABILITIES.has(capability)) return 'safe';
  if (SENSITIVE_CAPABILITIES.has(capability)) return 'sensitive';
  if (DANGEROUS_CAPABILITIES.has(capability)) return 'dangerous';
  // Unknown capabilities default to dangerous
  log.warn(`Unknown capability "${capability}" — classified as dangerous`);
  return 'dangerous';
}

export function evaluatePolicy(
  capability: string,
  args: Record<string, unknown> = {},
): PolicyDecision {
  const level = classifyCapability(capability);

  // Extra checks for shell commands
  if (capability === 'shell_exec' && typeof args['command'] === 'string') {
    const cmd = args['command'] as string;
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(cmd)) {
        return {
          level: 'dangerous',
          allowed: false,
          requiresConfirmation: false,
          reason: `Command matches blocked pattern: ${pattern.toString()}`,
        };
      }
    }
  }

  // Extra checks for file paths
  const pathArg = (args['path'] ?? args['src'] ?? args['dst'] ?? '') as string;
  if (pathArg) {
    for (const pattern of BLOCKED_PATHS) {
      if (pattern.test(pathArg)) {
        return {
          level: 'dangerous',
          allowed: false,
          requiresConfirmation: false,
          reason: `Path is protected: ${pathArg}`,
        };
      }
    }
  }

  return {
    level,
    allowed: true,
    requiresConfirmation: level === 'dangerous',
    reason: level === 'safe'
      ? 'Safe capability, executing immediately'
      : level === 'sensitive'
        ? 'Sensitive capability, logged and executing'
        : 'Dangerous capability, requires user confirmation',
  };
}

export function isCommandBlocked(command: string): { blocked: boolean; reason?: string } {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return { blocked: true, reason: `Blocked pattern: ${pattern.toString()}` };
    }
  }
  return { blocked: false };
}

export function isPathBlocked(filePath: string): { blocked: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(filePath)) {
      return { blocked: true, reason: `Protected path: ${filePath}` };
    }
  }
  return { blocked: false };
}
