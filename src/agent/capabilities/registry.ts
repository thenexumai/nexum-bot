import { pcConnections } from '../../index';
import { Logger } from '../../infra/logger';

export const sendToPC = async (uid: number, action: string, params: any = {}) => {
    const ws = pcConnections.get(uid);
    if (!ws) throw new Error('PC Agent not connected');

    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substring(7);
        const payload = JSON.stringify({
            id: requestId,
            type: 'capability',
            action,
            params
        });

        const handleMessage = (message: any) => {
            const data = JSON.parse(message.toString());
            if (data.id === requestId) {
                ws.off('message', handleMessage);
                if (data.error) reject(new Error(data.error));
                else resolve(data.result);
            }
        };

        ws.on('message', handleMessage);
        ws.send(payload);
        
        // Timeout 30 sec
        setTimeout(() => {
            ws.off('message', handleMessage);
            reject(new Error('PC Action timed out'));
        }, 30000);
    });
};

export const capabilities = {
    shell: (uid: number, cmd: string) => sendToPC(uid, 'shell', { cmd }),
    screenshot: (uid: number) => sendToPC(uid, 'screenshot'),
    read_file: (uid: number, path: string) => sendToPC(uid, 'read_file', { path }),
    write_file: (uid: number, path: string, content: string) => sendToPC(uid, 'write_file', { path, content }),
    mouse_move: (uid: number, x: number, y: number) => sendToPC(uid, 'mouse_move', { x, y }),
    mouse_click: (uid: number) => sendToPC(uid, 'mouse_click'),
    keyboard_type: (uid: number, text: string) => sendToPC(uid, 'keyboard_type', { text }),
    browser_open: (uid: number, url: string) => sendToPC(uid, 'browser_open', { url }),
};
