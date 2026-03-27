// NEXUM PC Agent Protocol — command types and dispatch

export type PcAction =
  | 'run_cmd'
  | 'mouse_move'
  | 'mouse_click'
  | 'key_press'
  | 'type_text'
  | 'file_list'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'open_url'
  | 'screenshot'
  | 'sysinfo';

export interface PcCommand {
  action: PcAction;
  params: Record<string, any>;
  user_id: number;
  device_id?: string;
  command_id: string;
}

export interface PcResponse {
  command_id: string;
  success: boolean;
  data?: any;
  error?: string;
}

// Active connections: uid → WebSocket
const activeConnections = new Map<number, any>();
// Pending responses: command_id → { resolve, reject, timeout }
const pendingCommands = new Map<string, {
  resolve: (r: PcResponse) => void;
  reject: (e: Error) => void;
  timeout: NodeJS.Timeout;
}>();

export function registerConnection(uid: number, ws: any) {
  activeConnections.set(uid, ws);
  console.log(`[pcagent] connected uid=${uid}`);

  ws.on('close', () => {
    activeConnections.delete(uid);
    console.log(`[pcagent] disconnected uid=${uid}`);
  });

  ws.on('message', (data: Buffer) => {
    try {
      const response: PcResponse = JSON.parse(data.toString());
      const pending = pendingCommands.get(response.command_id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingCommands.delete(response.command_id);
        pending.resolve(response);
      }
    } catch (e) {
      console.error('[pcagent] parse error:', e);
    }
  });
}

export function isConnected(uid: number): boolean {
  const ws = activeConnections.get(uid);
  return ws?.readyState === 1; // OPEN
}

export async function sendCommand(
  uid: number,
  action: PcAction,
  params: Record<string, any> = {},
  timeoutMs = 30_000
): Promise<PcResponse> {
  const ws = activeConnections.get(uid);
  if (!ws || ws.readyState !== 1) {
    throw new Error('PC Agent is not connected. Use /link to pair your computer.');
  }

  const command_id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const command: PcCommand = { action, params, user_id: uid, command_id };

  return new Promise<PcResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(command_id);
      reject(new Error(`PC Agent command timed out (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    pendingCommands.set(command_id, { resolve, reject, timeout });

    try {
      ws.send(JSON.stringify(command));
    } catch (e: any) {
      clearTimeout(timeout);
      pendingCommands.delete(command_id);
      reject(new Error(`Failed to send command: ${e.message}`));
    }
  });
}

export function getConnectionCount(): number {
  return activeConnections.size;
}
