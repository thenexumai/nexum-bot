/**
 * NEXUM Self-Evolution System
 * Entry point: monitors errors, generates fixes, notifies admin.
 */

import { installGlobalErrorHandler, getTopErrors } from './error-detector';
import { generateFix, formatFixForAdmin, getPendingFixes } from './fix-generator';
import { createLogger } from '../infra/logger';

export { captureError, getTopErrors, getUnresolvedErrors } from './error-detector';
export { generateFix, formatFixForAdmin, getPendingFixes, approveFix, rejectFix, getFix } from './fix-generator';

const log = createLogger('evolution');

let adminNotifier: ((msg: string) => Promise<void>) | null = null;

export function setAdminNotifier(fn: (msg: string) => Promise<void>): void {
  adminNotifier = fn;
}

export async function runEvolutionCycle(): Promise<void> {
  const topErrors = getTopErrors(3);
  if (!topErrors.length) return;

  for (const error of topErrors) {
    if (error.occurrences < 3) continue; // Only fix recurring errors

    log.info(`Generating fix for recurring error: ${error.message.slice(0, 80)}`);
    const fix = await generateFix(error);
    if (!fix) continue;

    if (adminNotifier) {
      try {
        await adminNotifier(formatFixForAdmin(fix));
      } catch (e) {
        log.error(`Failed to notify admin: ${(e as Error).message}`);
      }
    }
  }
}

export function initEvolution(adminNotifyFn?: (msg: string) => Promise<void>): void {
  installGlobalErrorHandler();

  if (adminNotifyFn) setAdminNotifier(adminNotifyFn);

  // Run evolution cycle every 30 minutes
  setInterval(() => {
    runEvolutionCycle().catch(e => log.error(`Evolution cycle error: ${e.message}`));
  }, 30 * 60_000);

  log.info('Self-evolution system initialized');
}

export function getEvolutionStatus(): object {
  return {
    pendingFixes: getPendingFixes().length,
    topErrors: getTopErrors(5).map(e => ({
      source: e.source,
      message: e.message.slice(0, 60),
      occurrences: e.occurrences,
    })),
  };
}
