import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { Logger } from '../../infra/logger';

export class PolicyEnforcer {
    private static policies: any = null;

    static load() {
        try {
            const polPath = path.join(__dirname, '../../../system/policies.yaml');
            const file = fs.readFileSync(polPath, 'utf8');
            this.policies = yaml.load(file);
            Logger.success('policies', 'Security Policies LOADED');
        } catch (e) {
            Logger.error('policies', 'Failed to load policies', e);
        }
    }

    static isPathBlocked(filePath: string): boolean {
        if (!this.policies) this.load();
        const normalized = path.normalize(filePath).toLowerCase();
        
        // Windows checks
        for (const blocked of this.policies.path_policy.blocked.windows) {
            if (normalized.includes(blocked.toLowerCase())) return true;
        }
        
        // Generic checks
        for (const blocked of this.policies.path_policy.blocked.all_platforms) {
            if (normalized.includes(blocked.toLowerCase())) return true;
        }

        return false;
    }

    static isCommandBlocked(cmd: string): boolean {
        if (!this.policies) this.load();
        const lowerCmd = cmd.toLowerCase().trim();

        // Exact matches
        if (this.policies.blocked_commands.exact.includes(lowerCmd)) return true;

        // Patterns
        for (const pattern of this.policies.blocked_commands.patterns) {
            if (new RegExp(pattern, 'i').test(lowerCmd)) return true;
        }

        return false;
    }
}
