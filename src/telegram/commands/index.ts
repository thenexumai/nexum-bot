import type { Bot } from 'grammy';
import { registerGeneralCommands, DM_COMMANDS, GROUP_COMMANDS } from './general';
import { registerMiniAppCommands } from './mini-apps';
import { registerByokCommands } from './byok';
import { registerPcAgentCommands, setupExecApprovalCallbacks } from './pc-agent';
import { registerAdminCommands } from './admin';

export function setupCommands(bot: Bot): void {
  bot.api.setMyCommands(DM_COMMANDS, { scope: { type: 'all_private_chats' } }).catch(() => {});
  bot.api.setMyCommands(GROUP_COMMANDS, { scope: { type: 'all_group_chats' } }).catch(() => {});

  registerGeneralCommands(bot);
  registerMiniAppCommands(bot);
  registerByokCommands(bot);
  registerPcAgentCommands(bot);
  registerAdminCommands(bot);
}

export { setupExecApprovalCallbacks };
