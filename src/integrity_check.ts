import fs from 'fs';
import path from 'path';
import { Logger } from './infra/logger';

const REQUIRED_PATHS = [
    'src/index.ts',
    'src/core/db.ts',
    'src/agent/executor.ts',
    'pc_agent/nexum_agent.py',
    'intelligence/pro_search.ts',
    'apps/browser/index.html'
];

export function checkIntegrity() {
    Logger.info('system', 'Running Integrity Audit...');
    let healthy = true;

    for (const f of REQUIRED_PATHS) {
        if (!fs.existsSync(path.join(process.cwd(), f))) {
            Logger.error('system', `MISSING CRITICAL FILE: ${f}`);
            healthy = false;
        }
    }

    if (healthy) {
        Logger.success('system', 'NEXUM Core Integrity: 100%');
    } else {
        Logger.warn('system', 'Integrity check found issues. Review logs.');
    }
}
