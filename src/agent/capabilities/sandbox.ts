import { VM } from 'vm2';
import { Logger } from '../../infra/logger';

export class CodeSandbox {
    static execute(code: string, context: any = {}) {
        Logger.info('sandbox', 'Executing code in isolated environment');
        
        const vm = new VM({
            timeout: 5000,
            allowAsync: false,
            sandbox: {
                console: {
                    log: (...args: any[]) => Logger.debug('sandbox-out', args.join(' ')),
                    error: (...args: any[]) => Logger.error('sandbox-err', args.join(' '))
                },
                ...context
            }
        });

        try {
            return vm.run(code);
        } catch (e) {
            Logger.error('sandbox', `Execution error: ${e.message}`);
            return { error: e.message };
        }
    }
}
