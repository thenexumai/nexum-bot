/**
 * NEXUM Tool Policy — plan-based capability access control
 * Controls which PC Agent capabilities each subscription tier can use.
 */

import { getUserPlan } from '../../core/billing';

export type CapabilityGroup =
  | 'read_only'      // screenshot, sysinfo, file_read — all tiers
  | 'mouse_keyboard' // mouse, keyboard — pro only
  | 'file_write'     // write, create, copy, move — pro only
  | 'shell'          // shell exec — pro only
  | 'browser'        // browser automation — pro only
  | 'dangerous'      // delete, kill process — pro + confirmation

const PLAN_CAPABILITIES: Record<string, CapabilityGroup[]> = {
  free:   [],
  middle: [],
  pro:    ['read_only', 'mouse_keyboard', 'file_write', 'shell', 'browser', 'dangerous'],
};

const CAPABILITY_GROUPS: Record<string, CapabilityGroup> = {
  screenshot:       'read_only',
  sysinfo:          'read_only',
  file_read:        'read_only',
  list_dir:         'read_only',
  get_clipboard:    'read_only',
  get_processes:    'read_only',
  get_network:      'read_only',
  get_battery:      'read_only',
  mouse_move:       'mouse_keyboard',
  mouse_click:      'mouse_keyboard',
  key_press:        'mouse_keyboard',
  type_text:        'mouse_keyboard',
  scroll:           'mouse_keyboard',
  file_write:       'file_write',
  create_dir:       'file_write',
  copy_file:        'file_write',
  move_file:        'file_write',
  shell_exec:       'shell',
  browser_navigate: 'browser',
  browser_click:    'browser',
  browser_fill:     'browser',
  browser_screenshot: 'browser',
  file_delete:      'dangerous',
  rmdir:            'dangerous',
  kill_process:     'dangerous',
};

export interface ToolPolicyResult {
  allowed: boolean;
  reason: string;
  requiredPlan?: string;
}

export function checkToolPolicy(uid: number, capability: string): ToolPolicyResult {
  const plan = getUserPlan(uid);
  const group = CAPABILITY_GROUPS[capability];

  if (!group) {
    return { allowed: false, reason: `Unknown capability: ${capability}` };
  }

  const allowed = PLAN_CAPABILITIES[plan]?.includes(group) ?? false;

  if (!allowed) {
    return {
      allowed: false,
      reason: `Your ${plan.toUpperCase()} plan does not include ${group} capabilities`,
      requiredPlan: 'pro',
    };
  }

  return { allowed: true, reason: 'Plan allows this capability' };
}
