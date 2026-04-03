import { Bot, InputFile } from 'grammy';
import { createReadStream } from 'fs';
import { resolve } from 'path';
import {
    readFileWithLines,
    replaceInFile,
    createFile,
    runBashCommand,
    analyzeCode,
    findFiles,
    getProjectStructure,
    grepInProject,
    gitStatus,
    gitDiff,
    gitCommit,
    runTests,
    formatCode
} from '../../tools/code_assistant';
import { isOwner } from '../../core/config';

export function setupCodeCommands(bot: Bot) {
    
    // /code_read <путь> - прочитать файл с номерами строк
    bot.command('code_read', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Команды кода доступны только владельцу');
            return;
        }
        
        const args = ctx.message?.text?.replace('/code_read', '').trim();
        if (!args) {
            await ctx.reply('📖 Использование: `/code_read <путь/к/файлу>`\n\nПример: `/code_read src/index.ts`', { parse_mode: 'Markdown' });
            return;
        }
        
        try {
            const content = await readFileWithLines(args);
            const lines = content.split('\n');
            
            // Telegram имеет лимит 4096 символов
            if (content.length > 3500) {
                // Отправляем файлом через InputFile с ReadStream
                const filePath = resolve(process.cwd(), args);
                await ctx.replyWithDocument(new InputFile(createReadStream(filePath), args), {
                    caption: `📄 ${args} (${lines.length} строк)`
                });
            } else {
                await ctx.reply(`\`\`\`\n${content}\n\`\`\``, { parse_mode: 'Markdown' });
            }
        } catch (err: any) {
            await ctx.reply(`❌ Ошибка: ${err.message}`);
        }
    });
    
    // /code_edit <путь> - редактировать файл
    bot.command('code_edit', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const args = ctx.message?.text?.replace('/code_edit', '').trim();
        if (!args) {
            await ctx.reply(
                '✏️ Использование:\n' +
                '`/code_edit <файл>\n' +
                'СТАРЫЙ_ТЕКСТ\n' +
                '---\n' +
                'НОВЫЙ_ТЕКСТ`\n\n' +
                'Пример:\n' +
                '`/code_edit src/index.ts\n' +
                'console.log("old")\n' +
                '---\n' +
                'Logger.info("new")`',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const parts = args.split('\n');
        const filePath = parts[0].trim();
        const restText = parts.slice(1).join('\n');
        
        if (!restText.includes('---')) {
            await ctx.reply('❌ Формат: СТАРЫЙ_ТЕКСТ\\n---\\nНОВЫЙ_ТЕКСТ');
            return;
        }
        
        const [oldText, newText] = restText.split('---').map(s => s.trim());
        
        const msg = await ctx.reply('⏳ Редактирую...');
        const result = await replaceInFile(filePath, oldText, newText);
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result.message);
    });
    
    // /code_create <путь> - создать новый файл
    bot.command('code_create', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const args = ctx.message?.text?.replace('/code_create', '').trim();
        if (!args) {
            await ctx.reply(
                '📝 Использование:\n' +
                '`/code_create <путь>\n' +
                'СОДЕРЖИМОЕ_ФАЙЛА`\n\n' +
                'Пример:\n' +
                '`/code_create src/test.ts\n' +
                'console.log("Hello!");`',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const lines = args.split('\n');
        const filePath = lines[0].trim();
        const content = lines.slice(1).join('\n');
        
        const msg = await ctx.reply('⏳ Создаю файл...');
        const result = await createFile(filePath, content);
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result.message);
    });
    
    // /bash <команда> - выполнить bash команду
    bot.command('bash', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const command = ctx.message?.text?.replace('/bash', '').trim();
        if (!command) {
            await ctx.reply('💻 Использование: `/bash <команда>`\n\nПример: `/bash ls -la`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('⏳ Выполняю...');
        const result = await runBashCommand(command);
        
        let response = '';
        if (result.success) {
            response = `✅ Выполнено\n\n\`\`\`\n${result.stdout || 'OK'}\n\`\`\``;
        } else {
            response = `❌ Ошибка\n\n\`\`\`\n${result.stderr}\n\`\`\``;
        }
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, response, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(response, { parse_mode: 'Markdown' }));
    });
    
    // /code_analyze <путь> - анализ кода
    bot.command('code_analyze', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const filePath = ctx.message?.text?.replace('/code_analyze', '').trim();
        if (!filePath) {
            await ctx.reply('🔍 Использование: `/code_analyze <путь/к/файлу>`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('🔍 Анализирую...');
        
        try {
            const analysis = await analyzeCode(filePath);
            
            let response = `📊 **Анализ кода: ${filePath}**\n\n`;
            response += `🗣 Язык: ${analysis.language}\n`;
            response += `📝 Строк кода: ${analysis.linesOfCode}\n`;
            response += `🧮 Сложность: ${analysis.complexity}\n\n`;
            
            if (analysis.issues.length > 0) {
                response += `⚠️ **Проблемы:**\n`;
                analysis.issues.forEach(issue => {
                    response += `• ${issue}\n`;
                });
                response += '\n';
            }
            
            if (analysis.suggestions.length > 0) {
                response += `💡 **Рекомендации:**\n`;
                analysis.suggestions.forEach(sug => {
                    response += `• ${sug}\n`;
                });
            }
            
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, response, { parse_mode: 'Markdown' });
        } catch (err: any) {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `❌ ${err.message}`);
        }
    });
    
    // /find <паттерн> - найти файлы
    bot.command('find', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const pattern = ctx.message?.text?.replace('/find', '').trim();
        if (!pattern) {
            await ctx.reply('🔎 Использование: `/find <паттерн>`\n\nПример: `/find "*.ts"`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('🔎 Ищу...');
        const files = await findFiles(process.cwd(), pattern);
        
        if (files.length === 0) {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, '❌ Файлы не найдены');
        } else {
            const response = `📁 **Найдено файлов: ${files.length}**\n\n${files.join('\n')}`;
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, response, { parse_mode: 'Markdown' })
                .catch(() => ctx.reply(response, { parse_mode: 'Markdown' }));
        }
    });
    
    // /tree - структура проекта
    bot.command('tree', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const msg = await ctx.reply('🌳 Получаю структуру...');
        const structure = await getProjectStructure(process.cwd());
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `\`\`\`\n${structure}\n\`\`\``, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(`\`\`\`\n${structure}\n\`\`\``, { parse_mode: 'Markdown' }));
    });
    
    // /grep <текст> - поиск в проекте
    bot.command('grep', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const searchText = ctx.message?.text?.replace('/grep', '').trim();
        if (!searchText) {
            await ctx.reply('🔍 Использование: `/grep <текст>`\n\nПример: `/grep "function"`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('🔍 Ищу в проекте...');
        const results = await grepInProject(process.cwd(), searchText);
        
        if (results.length === 0) {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, '❌ Совпадений не найдено');
        } else {
            const response = `🔍 **Найдено совпадений: ${results.length}**\n\n\`\`\`\n${results.slice(0, 15).join('\n')}\n\`\`\``;
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, response, { parse_mode: 'Markdown' })
                .catch(() => ctx.reply(response, { parse_mode: 'Markdown' }));
        }
    });
    
    // /git_status - git статус
    bot.command('git_status', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const status = await gitStatus(process.cwd());
        await ctx.reply(`🔀 **Git Status:**\n\n\`\`\`\n${status}\n\`\`\``, { parse_mode: 'Markdown' });
    });
    
    // /git_diff - показать изменения
    bot.command('git_diff', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const msg = await ctx.reply('📊 Получаю diff...');
        const diff = await gitDiff(process.cwd());
        
        if (diff.length > 3500) {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, '📊 Diff слишком большой, показываю первые 100 строк...');
            const shortDiff = diff.split('\n').slice(0, 100).join('\n');
            await ctx.reply(`\`\`\`diff\n${shortDiff}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `\`\`\`diff\n${diff}\n\`\`\``, { parse_mode: 'Markdown' });
        }
    });
    
    // /git_commit <сообщение> - коммит изменений
    bot.command('git_commit', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const message = ctx.message?.text?.replace('/git_commit', '').trim();
        if (!message) {
            await ctx.reply('💾 Использование: `/git_commit <сообщение>`\n\nПример: `/git_commit Fix bug in handler`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('💾 Коммичу...');
        const result = await gitCommit(process.cwd(), message);
        
        await ctx.api.editMessageText(
            ctx.chat!.id, 
            msg.message_id, 
            result.success ? `✅ ${result.message}` : `❌ ${result.message}`
        );
    });
    
    // /test - запустить тесты
    bot.command('test', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const msg = await ctx.reply('🧪 Запускаю тесты...');
        const result = await runTests(process.cwd());
        
        const response = result.success 
            ? `✅ **Тесты пройдены**\n\n\`\`\`\n${result.output.slice(0, 2000)}\n\`\`\``
            : `❌ **Тесты failed**\n\n\`\`\`\n${result.output.slice(0, 2000)}\n\`\`\``;
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, response, { parse_mode: 'Markdown' })
            .catch(() => ctx.reply(response, { parse_mode: 'Markdown' }));
    });
    
    // /format <путь> - отформатировать файл
    bot.command('format', async (ctx) => {
        const uid = ctx.from?.id;
        if (!uid || !isOwner(uid)) {
            await ctx.reply('❌ Только для владельца');
            return;
        }
        
        const filePath = ctx.message?.text?.replace('/format', '').trim();
        if (!filePath) {
            await ctx.reply('✨ Использование: `/format <путь/к/файлу>`', { parse_mode: 'Markdown' });
            return;
        }
        
        const msg = await ctx.reply('✨ Форматирую...');
        const result = await formatCode(filePath);
        
        await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, result.message);
    });
}
