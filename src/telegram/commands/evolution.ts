/**
 * NEXUM Admin: Evolution Commands
 * /pending_fixes, /approve_fix, /reject_fix
 * Wired into existing admin.ts command set.
 */

import type { Bot, Context } from 'grammy';
import { isAdmin } from '../../core/config';
import {
  getPendingFixes,
  approveFix,
  rejectFix,
  getFix,
} from '../../evolution/index';
import { getEvolutionStatus } from '../../evolution/index';

export function registerEvolutionCommands(bot: Bot<Context>): void {

  // /pending_fixes — list all fixes waiting for admin
  bot.command('pending_fixes', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;

    const fixes = getPendingFixes();
    if (!fixes.length) {
      await ctx.reply('✅ Нет ожидающих исправлений.');
      return;
    }

    const lines = fixes.map((f, i) =>
      `${i + 1}. \`${f.id}\`\n` +
      `   📍 ${f.errorSource}: ${f.errorMessage.slice(0, 60)}\n` +
      `   💡 ${f.analysis.slice(0, 80)}`
    ).join('\n\n');

    await ctx.reply(
      `🔧 *Ожидает одобрения: ${fixes.length}*\n\n${lines}\n\n` +
      `Используй /approve_fix <ID> или /reject_fix <ID>`,
      { parse_mode: 'Markdown' }
    );
  });

  // /approve_fix FIX_ID — approve a fix
  bot.command('approve_fix', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;

    const fixId = ctx.match?.trim();
    if (!fixId) {
      await ctx.reply('Использование: /approve_fix <FIX_ID>');
      return;
    }

    const fix = approveFix(fixId);
    if (!fix) {
      await ctx.reply(`❌ Фикс не найден: \`${fixId}\``, { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply(
      `✅ *Фикс одобрен!*\n\n` +
      `ID: \`${fix.id}\`\n` +
      `Файл: ${fix.filePath ?? 'N/A'}\n\n` +
      `Исправление помечено как одобренное.\n` +
      `Примени вручную или через CI/CD pipeline.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /reject_fix FIX_ID — reject a fix
  bot.command('reject_fix', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;

    const fixId = ctx.match?.trim();
    if (!fixId) {
      await ctx.reply('Использование: /reject_fix <FIX_ID>');
      return;
    }

    const fix = rejectFix(fixId);
    if (!fix) {
      await ctx.reply(`❌ Фикс не найден: \`${fixId}\``, { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply(`❌ Фикс отклонён: \`${fix.id}\``, { parse_mode: 'Markdown' });
  });

  // /evolution_status — overview of self-evolution system
  bot.command('evolution_status', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;

    const status = getEvolutionStatus() as {
      pendingFixes: number;
      topErrors: { source: string; message: string; occurrences: number }[];
    };

    const errorLines = status.topErrors.length
      ? status.topErrors.map(e =>
          `• [${e.source}] ${e.message} (×${e.occurrences})`
        ).join('\n')
      : 'Нет активных ошибок 🎉';

    await ctx.reply(
      `🤖 *Evolution Status*\n\n` +
      `Pending fixes: ${status.pendingFixes}\n\n` +
      `Top errors:\n${errorLines}`,
      { parse_mode: 'Markdown' }
    );
  });
}
