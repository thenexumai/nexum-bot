/**
 * SelfHealing — NEXUM обнаруживает ошибки в логах и пытается самоисправиться.
 * Запускается по heartbeat каждые 30 минут.
 */
import { smartChat } from '../core/providers/openrouter';
import { Logger } from '../infra/logger';

interface ErrorPattern {
    pattern: RegExp;
    context: string;
    count: number;
    lastSeen: number;
}

const errorBuffer: ErrorPattern[] = [];
const MAX_BUFFER = 50;

export class SelfHealing {
    private static errors: Array<{ msg: string; ts: number }> = [];
    private static fixes: Array<{ error: string; fix: string; ts: number }> = [];

    static recordError(msg: string): void {
        this.errors.push({ msg: msg.slice(0, 500), ts: Date.now() });
        if (this.errors.length > MAX_BUFFER) this.errors.shift();
    }

    static getRecentErrors(windowMs = 1800000): string[] {
        const cutoff = Date.now() - windowMs;
        return this.errors
            .filter(e => e.ts > cutoff)
            .map(e => e.msg);
    }

    /**
     * Основной цикл самоанализа — вызывается из heartbeat.
     * Анализирует ошибки и генерирует диагностику + патчи.
     */
    static async runHealing(sendToOwner?: (text: string) => Promise<void>): Promise<void> {
        const recent = this.getRecentErrors();
        if (recent.length < 3) return; // мало ошибок — не беспокоимся

        Logger.info('selfHealing', `Analyzing ${recent.length} recent errors...`);

        try {
            const { text } = await smartChat([
                {
                    role: 'system',
                    content: `Ты — система самодиагностики NEXUM бота (TypeScript/Node.js).
Проанализируй логи ошибок и дай:
1. Краткий диагноз (1-2 строки)
2. Список затронутых компонентов
3. Рекомендуемые исправления (конкретные, в коде)
4. Приоритет: CRITICAL / HIGH / LOW

Отвечай кратко, технически точно.`
                },
                {
                    role: 'user',
                    content: `Последние ошибки (${recent.length} шт за 30 мин):\n\n${recent.slice(-20).join('\n---\n')}`
                }
            ], { max_tokens: 600, temperature: 0.2 });

            const report = `🔧 *SelfHealing Report*\n\n${text}`;
            Logger.info('selfHealing', `Analysis done: ${text.slice(0, 200)}`);

            this.fixes.push({ error: `${recent.length} errors`, fix: text, ts: Date.now() });

            if (sendToOwner && text.includes('CRITICAL')) {
                await sendToOwner(report);
            } else if (sendToOwner && recent.length > 10) {
                await sendToOwner(report);
            }
        } catch (e) {
            Logger.warn('selfHealing', `Self-analysis failed: ${e}`);
        }
    }

    static getFixHistory(): Array<{ error: string; fix: string; ts: number }> {
        return this.fixes.slice(-10);
    }

    static clearErrors(): void {
        this.errors = [];
    }
}
