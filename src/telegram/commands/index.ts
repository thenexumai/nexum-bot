import { Bot } from 'grammy';
import { setupGeneralCommands } from './general';
import { setupAdminCommands } from './admin';
import { setupByokCommands } from './byok';
import { setupPcAgentCommands } from './pc_agent';

export function registerCommands(bot: Bot) {
  setupGeneralCommands(bot);
  setupAdminCommands(bot);
  setupByokCommands(bot);
  setupPcAgentCommands(bot);
}
