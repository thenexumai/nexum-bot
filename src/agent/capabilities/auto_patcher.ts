import fs from 'fs';
import path from 'path';
import { Logger } from '../../infra/logger';

export class AutoPatcher {
    static applyChanges(rawAiResponse: string) {
        Logger.info('patcher', 'Starting automatic code application...');

        // Парсим блоки [REPLACE FILE: path] или [CREATE FILE: path]
        const fileBlocks = rawAiResponse.split(/\[(?:REPLACE|CREATE) FILE: (.*?)\]/g);
        
        for (let i = 1; i < fileBlocks.length; i += 2) {
            const filePath = fileBlocks[i].trim();
            let content = fileBlocks[i + 1].trim();

            // Очистка от markdown оберток
            content = content.replace(/^```(?:\w+)?\n/, '').replace(/```$/, '').trim();

            const absolutePath = path.join(process.cwd(), filePath);
            const dir = path.dirname(absolutePath);

            try {
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                // Бэкап если файл существует
                if (fs.existsSync(absolutePath)) {
                    fs.copyFileSync(absolutePath, `${absolutePath}.bak`);
                }

                fs.writeFileSync(absolutePath, content);
                Logger.success('patcher', `Applied changes to: ${filePath}`);
            } catch (e) {
                Logger.error('patcher', `Failed to patch ${filePath}`, e);
            }
        }
    }
}
