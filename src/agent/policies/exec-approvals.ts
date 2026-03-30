import { ActionRisk } from './safety';
import { Logger } from '../../infra/logger';
import { bot } from '../../index';
import { sendApprovalButtons } from '../../telegram/handler';

interface PendingAction {
    uid: number;
    action: string;
    args: any;
    resolve: (value: boolean) => void;
}

const pendingActions = new Map<string, PendingAction>();

export const requestApproval = async (uid: number, action: string, args: any, risk: ActionRisk): Promise<boolean> => {
    if (risk === ActionRisk.SAFE) return true;

    const actionId = Math.random().toString(36).substring(7);
    Logger.info('safety', `Requesting approval for ${action} (ID: ${actionId}) from user ${uid}`);

    try {
        await sendApprovalButtons(bot, uid, actionId, action, args);
    } catch (err) {
        Logger.error('safety', 'Failed to send approval buttons', err);
        return false;
    }

    return new Promise((resolve) => {
        pendingActions.set(actionId, { uid, action, args, resolve });
        
        setTimeout(() => {
            if (pendingActions.has(actionId)) {
                Logger.warn('safety', `Action ${actionId} timed out`);
                pendingActions.delete(actionId);
                resolve(false);
            }
        }, 120000);
    });
};

export const handleApprovalResult = (actionId: string, approved: boolean) => {
    const pending = pendingActions.get(actionId);
    if (pending) {
        pending.resolve(approved);
        pendingActions.delete(actionId);
        Logger.info('safety', `Action ${actionId} ${approved ? 'approved' : 'denied'}`);
    }
};
