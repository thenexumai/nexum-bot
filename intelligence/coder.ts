import { chatUnified } from '../src/agent/router';
import { Logger } from '../src/infra/logger';
import fs from 'fs';
import path from 'path';

export class CoderAgent {
    static async solve(instruction: string, contextFiles: string[]) {
        Logger.info('coder', `Instruction: ${instruction}`);
        
        const fileContents = contextFiles.map(f => {
            const absolutePath = path.join(process.cwd(), f);
            if (!fs.existsSync(absolutePath)) return `FILE: ${f}\n(File does not exist yet)\n---`;
            const content = fs.readFileSync(absolutePath, 'utf-8');
            return `FILE: ${f}\nCONTENT:\n${content}\n---`;
        }).join('\n');

        const prompt = `
            You are the NEXUM Senior Software Engineer (Claude-Sonnet level).
            TASK: ${instruction}
            
            CONTEXT FILES:
            ${fileContents}

            MISSION:
            1. Analyze the requested change.
            2. Provide the complete code for the modified or new files.
            3. Use EXACTLY this format for EVERY file you change:
            
            [REPLACE FILE: path/to/file.ts]
            \`\`\`typescript
            ...full code here...
            \`\`\`

            If creating a new file:
            [CREATE FILE: path/to/new_file.ts]
            \`\`\`typescript
            ...code...
            \`\`\`

            Return ONLY the file blocks. No conversational filler.
        `;

        try {
            const response = await chatUnified([{ role: 'user', content: prompt }], 0);
            return { status: 'success', raw: response.content };
        } catch (e: any) {
            Logger.error('coder', 'Coding task failed', e);
            return { status: 'error', message: e.message };
        }
    }
}
