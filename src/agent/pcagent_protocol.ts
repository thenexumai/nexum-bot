// PC Agent Protocol — JSON формат для коммуникации backend ↔ nexum_agent.py

export interface PcAgentRequest {
  action: string;
  params: Record<string, any>;
  user_id: number;
  device_id?: string;
  request_id: string;
}

export interface PcAgentResponse {
  status: 'success' | 'error' | 'pending';
  result?: any;
  error?: string;
  request_id: string;
}

// ── PC Agent Actions ─────────────────────────────────────────────────────────

export type PcAgentAction =
  | 'mouse_move'
  | 'mouse_click'
  | 'mouse_scroll'
  | 'keyboard_type'
  | 'keyboard_hotkey'
  | 'browser_open'
  | 'browser_navigate'
  | 'browser_search'
  | 'file_list'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'app_run'
  | 'app_close'
  | 'screenshot'
  | 'sysinfo';

// ── Request builders ─────────────────────────────────────────────────────────

export function pcAgentRequest(
  action: PcAgentAction,
  params: Record<string, any>,
  userId: number,
  deviceId?: string
): PcAgentRequest {
  return {
    action,
    params,
    user_id: userId,
    device_id: deviceId,
    request_id: Math.random().toString(36).slice(2, 15),
  };
}

// ── Action schemas ───────────────────────────────────────────────────────────

export const PcAgentActions: Record<PcAgentAction, { desc: string; params: string[] }> = {
  mouse_move: { desc: 'Move mouse to coordinates', params: ['x', 'y'] },
  mouse_click: { desc: 'Click mouse button', params: ['button', 'x', 'y'] },
  mouse_scroll: { desc: 'Scroll mouse wheel', params: ['amount', 'x', 'y'] },
  keyboard_type: { desc: 'Type text', params: ['text'] },
  keyboard_hotkey: { desc: 'Press hotkey combination', params: ['keys'] },
  browser_open: { desc: 'Open browser', params: ['browser'] },
  browser_navigate: { desc: 'Navigate to URL', params: ['url'] },
  browser_search: { desc: 'Search in browser', params: ['query'] },
  file_list: { desc: 'List files in directory', params: ['path'] },
  file_read: { desc: 'Read file content', params: ['path'] },
  file_write: { desc: 'Write to file', params: ['path', 'content'] },
  file_delete: { desc: 'Delete file', params: ['path'] },
  app_run: { desc: 'Run application', params: ['app', 'args'] },
  app_close: { desc: 'Close application', params: ['app'] },
  screenshot: { desc: 'Take screenshot', params: [] },
  sysinfo: { desc: 'Get system information', params: [] },
};

// ── WebSocket / HTTP transport helpers ───────────────────────────────────────

export function encodePcAgentRequest(req: PcAgentRequest): string {
  return JSON.stringify(req);
}

export function decodePcAgentRequest(data: string): PcAgentRequest | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function encodePcAgentResponse(res: PcAgentResponse): string {
  return JSON.stringify(res);
}

export function decodePcAgentResponse(data: string): PcAgentResponse | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
