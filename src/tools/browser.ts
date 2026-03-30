import { Logger } from '../infra/logger';
import { pcConnections } from '../index';

export const browseSite = async (uid: number, url: string, action: string = 'screenshot'): Promise<string> => {
    Logger.info('browser', `Browsing ${url} for user ${uid} (Action: ${action})`);
    
    const ws = pcConnections.get(uid);
    if (!ws) {
        return 'Error: PC Agent not connected. Browser automation requires the local nexum_agent.py.';
    }

    const requestId = Math.random().toString(36).substring(7);
    const payload = {
        type: 'browser',
        requestId,
        url,
        action // 'screenshot', 'extract_text', 'scroll_down', etc.
    };

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', messageHandler);
            resolve('Error: Browser automation timeout.');
        }, 60000);

        const messageHandler = (message: any) => {
            const data = JSON.parse(message.toString());
            if (data.requestId === requestId) {
                clearTimeout(timeout);
                ws.removeListener('message', messageHandler);
                resolve(data.status === 'success' ? `Browser Result: ${data.result}` : `Browser Error: ${data.error}`);
            }
        };

        ws.on('message', messageHandler);
        ws.send(JSON.stringify(payload));
    });
};
