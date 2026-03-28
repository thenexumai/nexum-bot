import type { Bot, Context } from 'grammy';
import { db, setUserApiKey } from '../../core/db';
import { t } from '../../i18n/index';

const VALID_PROVIDERS = ['cerebras','groq','gemini','deepseek','claude','openrouter','grok','sambanova','together'];

export function registerByokCommands(bot: Bot): void {
  bot.command('setkey', async (ctx: Context) => {
    const uid  = ctx.from?.id ?? 0;
    const args = (ctx.message?.text ?? '').split(' ');

    if (args.length < 3) {
      await ctx.reply(
        t(uid, 'byok.usage', { providers: VALID_PROVIDERS.join(', ') }),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const provider = args[1].toLowerCase();
    const key      = args[2];

    if (!VALID_PROVIDERS.includes(provider)) {
      await ctx.reply(t(uid, 'byok.unknown_provider', { providers: VALID_PROVIDERS.join(', ') }));
      return;
    }

    setUserApiKey(uid, provider, key);
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(`✅ ${t(uid, 'byok.saved', { provider })}`, { parse_mode: 'Markdown' });
  });

  bot.command('mykeys', async (ctx: Context) => {
    const uid  = ctx.from?.id ?? 0;
    const rows = db.prepare(`SELECT provider, substr(api_key,1,8)||'…' AS masked FROM user_api_keys WHERE uid=? ORDER BY provider`).all(uid) as { provider: string; masked: string }[];
    if (!rows.length) {
      await ctx.reply(t(uid, 'byok.list_empty'), { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply(
      `${t(uid, 'byok.list_title')}\n\n${rows.map(r => `• *${r.provider}:* \`${r.masked}\``).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  });
}
