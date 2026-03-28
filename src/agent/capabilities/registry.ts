/**
 * NEXUM Capability Registry
 *
 * Inspired by OpenClaw's tool-policy system.
 * Every action the PC agent can perform is registered here with:
 *   - classification: safe / sensitive / dangerous
 *   - requiresConfirmation: whether user must approve before execution
 *   - requiresProPlan: whether Pro subscription is required
 *   - description: human-readable purpose
 *
 * This is the single source of truth for what NEXUM can do.
 */

export type ActionClass = 'safe' | 'sensitive' | 'dangerous';

export interface CapabilityDef {
  name: string;
  description: string;
  class: ActionClass;
  requiresConfirmation: boolean; // must user approve before exec?
  requiresProPlan: boolean;
  allowedInGroups: boolean;      // can non-owners use in group chats?
}

// ── Capability registry ───────────────────────────────────────────────────────

const CAPABILITIES: Record<string, CapabilityDef> = {

  // Safe: read-only, no side effects
  screenshot: {
    name: 'screenshot',
    description: 'Take a screenshot of the PC screen',
    class: 'safe',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  sysinfo: {
    name: 'sysinfo',
    description: 'Get system information (CPU, RAM, disk)',
    class: 'safe',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  file_list: {
    name: 'file_list',
    description: 'List files in a directory',
    class: 'safe',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  file_read: {
    name: 'file_read',
    description: 'Read contents of a file',
    class: 'safe',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  open_url: {
    name: 'open_url',
    description: 'Open a URL in the default browser',
    class: 'safe',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },

  // Sensitive: has side effects, but reversible or low-risk
  mouse_move: {
    name: 'mouse_move',
    description: 'Move the mouse cursor to coordinates',
    class: 'sensitive',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  mouse_click: {
    name: 'mouse_click',
    description: 'Click the mouse at coordinates',
    class: 'sensitive',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  key_press: {
    name: 'key_press',
    description: 'Press keyboard keys or shortcuts',
    class: 'sensitive',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  type_text: {
    name: 'type_text',
    description: 'Type text as keyboard input',
    class: 'sensitive',
    requiresConfirmation: false,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  file_write: {
    name: 'file_write',
    description: 'Write content to a file',
    class: 'sensitive',
    requiresConfirmation: true,
    requiresProPlan: true,
    allowedInGroups: false,
  },

  // Dangerous: irreversible, destructive, or high-privilege
  run_cmd: {
    name: 'run_cmd',
    description: 'Execute a shell command',
    class: 'dangerous',
    requiresConfirmation: true,
    requiresProPlan: true,
    allowedInGroups: false,
  },
  file_delete: {
    name: 'file_delete',
    description: 'Delete a file from the filesystem',
    class: 'dangerous',
    requiresConfirmation: true,
    requiresProPlan: true,
    allowedInGroups: false,
  },
};

// ── Registry API ──────────────────────────────────────────────────────────────

export function getCapability(name: string): CapabilityDef | null {
  return CAPABILITIES[name] ?? null;
}

export function getAllCapabilities(): CapabilityDef[] {
  return Object.values(CAPABILITIES);
}

export function getCapabilitiesByClass(cls: ActionClass): CapabilityDef[] {
  return Object.values(CAPABILITIES).filter(c => c.class === cls);
}

export function requiresConfirmation(action: string): boolean {
  return CAPABILITIES[action]?.requiresConfirmation ?? true; // default: confirm unknown
}

export function isKnownAction(action: string): boolean {
  return action in CAPABILITIES;
}

export function getActionClass(action: string): ActionClass {
  return CAPABILITIES[action]?.class ?? 'dangerous';
}

// ── Blocked commands (OpenClaw-inspired safety denylist) ─────────────────────

const BLOCKED_COMMAND_PATTERNS = [
  /rm\s+-rf\s+\//, /mkfs/, /dd\s+if=/, /:\(\)\s*{\s*:\|:/, // fork bombs, disk wipe
  /chmod\s+777\s+\//, />\s*\/dev\/sda/, /format\s+c:/i,   // destructive system ops
  /shutdown\s*-[hpr]/i, /reboot/i, /halt\b/,              // system shutdown
  /passwd\s+root/i, /visudo/i, /sudo\s+su/i,             // privilege escalation
];

export function isBlockedCommand(cmd: string): boolean {
  return BLOCKED_COMMAND_PATTERNS.some(re => re.test(cmd));
}

export function getBlockReason(cmd: string): string | null {
  if (/rm\s+-rf\s+\//.test(cmd))    return 'Recursive root deletion blocked';
  if (/mkfs/.test(cmd))              return 'Filesystem format commands blocked';
  if (/:\(\)\s*{\s*:\|:/.test(cmd)) return 'Fork bomb pattern blocked';
  if (/shutdown|reboot|halt\b/.test(cmd)) return 'System shutdown commands blocked';
  if (/sudo\s+su|visudo/.test(cmd)) return 'Privilege escalation blocked';
  return isBlockedCommand(cmd) ? 'Command blocked by safety policy' : null;
}
