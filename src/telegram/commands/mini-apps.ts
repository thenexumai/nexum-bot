import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../../core/config';
import { requireFeature } from '../../core/billing';
import { t } from '../../i18n/index';

export function registerMiniAppCommands(bot: Bot): void {
  const APP_ROUTES: [string, string, string][] = [
    ['finance', 'apps.finance', '/finance'],
    ['tasks',   'apps.tasks',   '/tasks'],
    ['notes',   'apps.notes',   '/notes'],
    ['habits',  'apps.habits',  '/habits'],
    ['calendar','apps.calendar', '/calendar'],
    ['contacts','apps.contacts', '/contacts'],
  ];

  bot.command('apps', async (ctx: Context) => {
    const uid = ctx.from?.id ?? 0;
    if (!config.webappUrl) { await ctx.reply(t(uid, 'apps.not_configured')); return; }
    const check = requireFeature(uid, 'hasMiniApps', 'Mini-apps');
    if (!check.ok) { await ctx.reply(check.reason!); return; }

    const url = config.webappUrl;
    const kb = new InlineKeyboard()
      .webApp(t(uid, 'apps.finance'), `${url}/finance?uid=${uid}`).webApp(t(uid, 'apps.tasks'), `${url}/tasks?uid=${uid}`).row()
      .webApp(t(uid, 'apps.notes'), `${url}/notes?uid=${uid}`).webApp(t(uid, 'apps.habits'), `${url}/habits?uid=${uid}`).row()
      .webApp(t(uid, 'apps.calendar'), `${url}/calendar?uid=${uid}`).webApp(t(uid, 'apps.contacts'), `${url}/contacts?uid=${uid}`).row()
      .webApp(t(uid, 'apps.settings'), `${url}/settings?uid=${uid}`).webApp(t(uid, 'apps.home'), `${url}?uid=${uid}`);

    await ctx.reply(t(uid, 'apps.title'), { parse_mode: 'Markdown', reply_markup: kb });
  });

  for (const [command, labelKey, path] of APP_ROUTES) {
    bot.command(command, async (ctx: Context) => {
      const uid = ctx.from?.id ?? 0;
      if (!config.webappUrl) { await ctx.reply(t(uid, 'apps.not_configured')); return; }
      const label = t(uid, labelKey);
      const check = requireFeature(uid, 'hasMiniApps', label);
      if (!check.ok) { await ctx.reply(check.reason!); return; }
      const kb = new InlineKeyboard().webApp(label, `${config.webappUrl}${path}?uid=${uid}`);
      await ctx.reply(label, { reply_markup: kb });
    });
  }
}
