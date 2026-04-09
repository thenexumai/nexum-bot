/**
 * Команды диагностики (только owner).
 */
import { Bot } from 'grammy';
import { SelfHealing } from '../../evolution/SelfHealing';
import { isOwner } from '../../core/config';
import { smartChat } from '../../core/providers/openrouter';
import { WorkspaceManager } from '../../core/workspace/WorkspaceManager';

export function setupDiagCommands(bot: Bot) {

    /** /diag — диагностика системы */
    bot.command('diag', async (ctx) => {
        const uid = ctx.from!.id;
        if (!isOwner(uid)) return;

        const errors = SelfHealing.getRecentErrors();
        const fixes = SelfHealing.getFixHistory();

        let text = `🔧 *Диагностика NEXUM*\n\n`;
        text += `⚠️ Ошибок за 30 мин: ${errors.length}\n`;
        text += `🔨 Исправлений в истории: ${fixes.length}\n\n`;

        if (errors.length > 0) {
            text += `Последние 5 ошибок:\n`;
            errors.slice(-5).forEach((e, i) => {
                text += `${i+1}. ${e.slice(0, 150)}\n`;
            });
        } else {
            text += `✅ Ошибок нет`;
        }

        await ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(text.replace(/[*_`]/g, '')));
    });

    /** /fix описание — попросить AI исправить ошибку */
    bot.command('fix', async (ctx) => {
        const uid = ctx.from!.id;
        if (!isOwner(uid)) return;

        const issue = ctx.match?.trim() || '';
        if (!issue) {
            await ctx.reply('🔧 Использование: /fix описание проблемы');
            return;
        }

        const msg = await ctx.reply('🔍 Анализирую...');
        const errors = SelfHealing.getRecentErrors(3600000); // последний час

        try {
            const { text } = await smartChat([
                {
                    role: 'system',
                    content: `Ты — старший TypeScript разработчик. Анализируй проблему в Telegram боте на Node.js/grammy/SQLite.
Дай конкретное решение: что именно изменить в коде. Если нужен патч — покажи diff или готовый код.`
                },
                {
                    role: 'user',
                    content: `Проблема: ${issue}\n\nПоследние ошибки:\n${errors.slice(-5).join('\n')}`
                }
            ], { max_tokens: 1000, temperature: 0.2 });

            SelfHealing.recordError(`[FIX REQUEST] ${issue}`);

            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, text)
                .catch(() => ctx.reply(text));
        } catch (e) {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `❌ Ошибка: ${e}`)
                .catch(() => {});
        }
    });

    /** /model — посмотреть/сменить модель AI */
    bot.command('model', async (ctx) => {
        const uid = ctx.from!.id;

        const MODELS = [
            'openai/gpt-oss-120b',
            'meta-llama/llama-4-scout-17b-16e-instruct',
            'meta-llama/llama-4-maverick',
            'google/gemini-2.0-flash',
            'anthropic/claude-3.5-haiku',
        ];

        const args = ctx.match?.trim();
        if (!args) {
            const { InlineKeyboard } = await import('grammy');
            const kb = new InlineKeyboard();
            for (const m of MODELS) {
                kb.text(m, `setmodel:${m}`).row();
            }
            await ctx.reply('🤖 Выбери модель AI:', { reply_markup: kb });
            return;
        }

        // Сохранить предпочтение модели
        WorkspaceManager.updateUserFact(uid, `Предпочитаемая модель: ${args}`);
        await ctx.reply(`✅ Модель установлена: ${args}`);
    });

    bot.callbackQuery(/^setmodel:(.+)$/, async (ctx) => {
        const uid = ctx.from.id;
        const model = ctx.match[1];
        WorkspaceManager.updateUserFact(uid, `Предпочитаемая модель: ${model}`);
        await ctx.answerCallbackQuery({ text: `✅ ${model}` });
        await ctx.reply(`✅ Модель: ${model}`);
    });
}
