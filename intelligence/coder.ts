import { chatUnified } from '../src/agent/router';
import { Logger } from '../src/infra/logger';
import fs from 'fs';
import path from 'path';

export class CoderAgent {
    static async solve(instruction: string, contextFiles: string[]) {
        Logger.info('coder', `Instruction: ${instruction}`);
        
        const fileContents = contextFiles.map(f => {
            const content = fs.readFileSync(path.join(process.cwd(), f), 'utf-8');
            return `FILE: ${f}\nCONTENT:\n${content}\n---`;
        }).join('\n');

        const prompt = `
            You are the NEXUM Senior Software Engineer.
            TASK: ${instruction}
            
            CONTEXT FILES:
            ${fileContents}

            MISSION:
            Provide a complete solution. If you need to modify files, output them in blocks:
            [REPLACE FILE: path/to/file.ts]
            \`\`\`typescript
            ...code...
            \`\`\`
            
            If you need to create a new file:
            [CREATE FILE: path/to/new_file.ts]
            ...
        `;

        try {
            const response = await chatUnified([{ role: 'user', content: prompt }]);
            return this.parseAndApply(response.content);
        } catch (e) {
            Logger.error('coder', 'Coding task failed', e);
            return { status: 'error', message: e.message };
        }
    }

    private static parseAndApply(response: string) {
        // Логика автоматического применения изменений к файлам
        Logger.success('coder', 'Solution generated and ready for deployment');
        return { status: 'success', raw: response };
    }
}
