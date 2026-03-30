import fs from 'fs';
import path from 'path';
import { chatUnified } from '../src/agent/router';
import { Logger } from '../src/infra/logger';

export class EvolutionEngine {
    private static PROJECT_ROOT = path.join(__dirname, '../../');

    static async analyzeAndFix(filePath: string, error: string) {
        Logger.info('evolution', `Starting self-repair for ${filePath}`);
        
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.PROJECT_ROOT, filePath);
        if (!fs.existsSync(absolutePath)) {
            Logger.error('evolution', `File not found: ${absolutePath}`);
            return;
        }

        const code = fs.readFileSync(absolutePath, 'utf-8');
        
        const prompt = `
            You are the NEXUM Evolution Engine. 
            FILE: ${filePath}
            ERROR: ${error}
            CODE:
            ${code}

            TASK:
            1. Analyze why this error happens.
            2. Provide the FIXED code for the entire file.
            3. Return ONLY the code, no talk.
        `;

        try {
            const response = await chatUnified([{ role: 'user', content: prompt }]);
            const newCode = response.content.replace(/```typescript|```ts|```/g, '').trim();
            
            // Сохраняем бекап
            fs.writeFileSync(`${absolutePath}.bak`, code);
            // Применяем фикс
            fs.writeFileSync(absolutePath, newCode);
            
            Logger.success('evolution', `Successfully evolved ${filePath}. Backup created.`);
        } catch (e) {
            Logger.error('evolution', `Evolution failed for ${filePath}`, e);
        }
    }
}
