export type SafetyLevel = 'safe' | 'sensitive' | 'dangerous';

export interface Capability {
  id: string;
  name: string;
  description: string;
  safety: SafetyLevel;
  planRequired: 'free' | 'middle' | 'pro';
}

export const CAPABILITIES: Record<string, Capability> = {
  screenshot:   { id: 'screenshot',   name: 'Screenshot',    description: 'Capture screen',          safety: 'safe',      planRequired: 'pro' },
  sysinfo:      { id: 'sysinfo',      name: 'System Info',   description: 'Get system info',         safety: 'safe',      planRequired: 'pro' },
  file_read:    { id: 'file_read',    name: 'Read File',     description: 'Read file contents',      safety: 'safe',      planRequired: 'pro' },
  browser_open: { id: 'browser_open', name: 'Open Browser',  description: 'Open URL in browser',     safety: 'sensitive', planRequired: 'pro' },
  file_write:   { id: 'file_write',   name: 'Write File',    description: 'Write to a file',         safety: 'sensitive', planRequired: 'pro' },
  mouse_move:   { id: 'mouse_move',   name: 'Mouse Move',    description: 'Move mouse cursor',       safety: 'sensitive', planRequired: 'pro' },
  keyboard_type:{ id: 'keyboard_type',name: 'Type Text',     description: 'Type keyboard input',     safety: 'sensitive', planRequired: 'pro' },
  shell_exec:   { id: 'shell_exec',   name: 'Shell Execute', description: 'Run shell command',       safety: 'dangerous', planRequired: 'pro' },
  file_delete:  { id: 'file_delete',  name: 'Delete File',   description: 'Delete a file',           safety: 'dangerous', planRequired: 'pro' },
};

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES[id];
}

export function listCapabilities(safety?: SafetyLevel): Capability[] {
  const caps = Object.values(CAPABILITIES);
  return safety ? caps.filter(c => c.safety === safety) : caps;
}
