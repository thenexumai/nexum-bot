/**
 * Команды для работы с воркспейсом пользователя.
 */
import { Bot, InlineKeyboard } from 'grammy';
import { WorkspaceManager } from '../../core/workspace/WorkspaceManager';
import { WorkspaceAI } from '../../core/workspace/WorkspaceAI';
import { isOwner } from '../../core/config';

const WS_FILES = ['SOUL.md', 'USER.md', 'IDENTITY.md', 'AGENTS.md', 'MEMORY.md', 'TOOLS.md', 'HEARTBEAT.md'] as const;

export function setupWorkspaceCommands(bot: Bot) {

    /** /workspace — показать все файлы воркспейса */
    bot.command('workspace', async (ctx) => {
        const uid = ctx.from!.id;
        const files = WorkspaceManager.listFiles(uid);

        if (!files.length) {
            await ctx.reply('🗂 Воркспейс ещё пустой. Начни общение и NEXUM сам заполнит его!');
            return;
        }

        const keyboard = new InlineKeyboard();
        for (const f of files) {
            keyboard.text(`📄 ${f.filename} (${Math.round(f.size/1024*10)/10}KB)`, `ws:read:${f.filename}`).row();
        }
        keyboard.text('📅 Дневник сегодня', 'ws:daily').row();
        keyboard.text('🔄 Обновить SOUL', 'ws:refresh_soul');

        await ctx.reply(
            `🗂 *Твой воркспейс NEXUM*\n\n` +
            `${files.length} файлов. Нажми чтобы просмотреть:`,
            { reply_markup: keyboard, parse_mode: 'Markdown' }
        );
    });

    /** Чтение файла из воркспейса */
    bot.callbackQuery(/^ws:read:(.+)$/, async (ctx) => {
        const uid = ctx.from.id;
        const filename = ctx.match[1];
        const content = WorkspaceManager.read(uid, filename);

        if (!content) {
            await ctx.answerCallbackQuery({ text: 'Файл пустой' });
            return;
        }

        await ctx.answerCallbackQuery();
        const preview = content.length > 3000 ? content.slice(0, 3000) + '\n...(обрезано)' : content;
        await ctx.reply(`📄 *${filename}*\n\n${preview}`, { parse_mode: 'Markdown' }).catch(async () => {
            // Если Markdown сломан — отправить plain text
            await ctx.reply(`📄 ${filename}\n\n${preview}`);
        });
    });

    /** Дневник сегодня */
    bot.callbackQuery('ws:daily', async (ctx) => {
        const uid = ctx.from.id;
        const daily = WorkspaceManager.getYesterdayContext(uid);
        await ctx.answerCallbackQuery();
        await ctx.reply(daily || '📅 Дневник пустой — начни общение!').catch(() => {});
    });

    /** Обновить SOUL */
    bot.callbackQuery('ws:refresh_soul', async (ctx) => {
        const uid = ctx.from.id;
        await ctx.answerCallbackQuery({ text: '🔄 Обновляю...' });
        const name = ctx.from.first_name || 'User';
        await WorkspaceAI.refreshSoul(uid, name);
        await ctx.reply('✅ SOUL.md обновлён — NEXUM теперь знает тебя лучше!');
    });

    /** /ws_edit FILE текст — редактировать файл воркспейса */
    bot.command('ws_edit', async (ctx) => {
        const uid = ctx.from!.id;
        const args = ctx.match?.trim() || '';
        const spaceIdx = args.indexOf(' ');
        if (spaceIdx === -1) {
            await ctx.reply(
                '✏️ Использование: /ws_edit FILENAME текст\n\n' +
                'Файлы: ' + WS_FILES.join(', ')
            );
            return;
        }
        const filename = args.slice(0, spaceIdx).trim();
        const content = args.slice(spaceIdx + 1).trim();

        if (!WS_FILES.includes(filename as any)) {
            await ctx.reply(`❌ Неверный файл. Доступны: ${WS_FILES.join(', ')}`);
            return;
        }

        WorkspaceManager.write(uid, filename, content);
        await ctx.reply(`✅ ${filename} обновлён!`);
    });

    /** /ws_stats (только owner) */
    bot.command('ws_stats', async (ctx) => {
        const uid = ctx.from!.id;
        if (!isOwner(uid)) return;

        const stats = require('../../core/db').default.prepare(`
            SELECT uid, COUNT(*) as files, SUM(length(content)) as total_size
            FROM workspace_files GROUP BY uid ORDER BY total_size DESC LIMIT 20
        `).all() as any[];

        if (!stats.length) {
            await ctx.reply('📊 Воркспейсов пока нет');
            return;
        }

        let text = '📊 Статистика воркспейсов:\n\n';
        for (const s of stats) {
            text += `uid:${s.uid} — ${s.files} файлов, ${Math.round(s.total_size/1024)}KB\n`;
        }
        await ctx.reply(text);
    });
}
