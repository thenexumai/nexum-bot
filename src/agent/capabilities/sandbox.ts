import vm from 'vm';  // FIX: replace vm2 (not in npm types, deprecated) with Node.js built-in vm
import { Logger } from '../../infra/logger';

export class CodeSandbox {
    static execute(code: string, context: any = {}) {
        Logger.info('sandbox', 'Executing code in isolated environment');

        const sandbox = {
            console: {
                log: (...args: any[]) => Logger.debug('sandbox-out', args.join(' ')),
                error: (...args: any[]) => Logger.error('sandbox-err', args.join(' '))
            },
            ...context,
            result: undefined as any,
        };

        try {
            const script = new vm.Script(code, { timeout: 5000 } as any);
            vm.createContext(sandbox);
            script.runInContext(sandbox, { timeout: 5000 });
            return sandbox.result;
        } catch (e: any) {
            Logger.error('sandbox', `Execution error: ${e.message}`);
            return { error: e.message };
        }
    }
}
