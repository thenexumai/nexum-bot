import { Bot } from 'grammy';
import { canUseFeature } from '../../core/billing';
import { getPreferences } from '../../core/preferences';
import t from '../../i18n';
import db from '../../core/db';

const VALID_PROVIDERS = ['claude', 'groq', 'gemini', 'deepseek', 'grok', 'openrouter', 'together', 'sambanova', 'cerebras'];

function maskKey(key: string): string {
  if (key.length < 12) return '***';
  return key.slice(0, 6) + '...' + key.slice(-4);
}

export function setupByokCommands(bot: Bot) {

  // /setkey PROVIDER KEY
  bot.command('setkey', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'byok')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }

    const parts = ctx.match?.trim().split(/\s+/) ?? [];
    if (parts.length < 2) {
      await ctx.reply(
        `Usage: /setkey <provider> <key>\n\nProviders: ${VALID_PROVIDERS.join(', ')}`
      ); return;
    }

    const [provider, key] = parts;
    if (!VALID_PROVIDERS.includes(provider.toLowerCase())) {
      await ctx.reply(`❌ Unknown provider. Valid: ${VALID_PROVIDERS.join(', ')}`); return;
    }

    const user = db.prepare('SELECT byok_keys FROM users WHERE uid = ?').get(uid) as
      { byok_keys: string } | undefined;
    const keys = JSON.parse(user?.byok_keys ?? '{}');
    keys[provider.toLowerCase()] = key;

    db.prepare('UPDATE users SET byok_keys = ? WHERE uid = ?').run(JSON.stringify(keys), uid);

    // Delete the user's message for security
    try { await ctx.deleteMessage(); } catch { /* ok */ }

    await ctx.reply(t(lang, 'byok_saved', { provider }));
  });

  // /mykeys
  bot.command('mykeys', async (ctx) => {
    const uid   = ctx.from!.id;
    const prefs = getPreferences(uid);
    const lang  = prefs.lang;

    if (!canUseFeature(uid, 'byok')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }

    const user = db.prepare('SELECT byok_keys FROM users WHERE uid = ?').get(uid) as
      { byok_keys: string } | undefined;
    const keys = JSON.parse(user?.byok_keys ?? '{}');
    const entries = Object.entries(keys);

    if (!entries.length) {
      await ctx.reply(t(lang, 'byok_list_empty')); return;
    }

    const list = entries.map(([p, k]) => `• *${p}*: \`${maskKey(String(k))}\``).join('\n');
    await ctx.reply(`🔑 *Your API Keys:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  // /rmkey PROVIDER
  bot.command('rmkey', async (ctx) => {
    const uid      = ctx.from!.id;
    const prefs    = getPreferences(uid);
    const lang     = prefs.lang;
    const provider = ctx.match?.trim().toLowerCase();

    if (!canUseFeature(uid, 'byok')) {
      await ctx.reply(t(lang, 'no_access', { plan: 'PRO' })); return;
    }
    if (!provider) { await ctx.reply('Usage: /rmkey <provider>'); return; }

    const user = db.prepare('SELECT byok_keys FROM users WHERE uid = ?').get(uid) as
      { byok_keys: string } | undefined;
    const keys = JSON.parse(user?.byok_keys ?? '{}');
    if (!keys[provider]) { await ctx.reply(`❌ No key for ${provider}`); return; }

    delete keys[provider];
    db.prepare('UPDATE users SET byok_keys = ? WHERE uid = ?').run(JSON.stringify(keys), uid);
    await ctx.reply(t(lang, 'byok_removed', { provider }));
  });
}
