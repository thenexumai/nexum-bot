// NEXUM Draft Stream - Message delivery system

import { Context } from "grammy";

interface StreamParams {
  bot: any;
  chatId: number;
  replyToMsgId?: number;
  initialText?: string;
}

export const draftStream = async (params: StreamParams) => {
  const { bot, chatId, replyToMsgId, initialText = '✏️' } = params;
  
  const msg = await bot.api.sendMessage(chatId, initialText, {
    reply_parameters: replyToMsgId ? { message_id: replyToMsgId } : undefined,
  });
  
  return msg;
};

export const editDraft = async (ctx: Context, newText: string) => {
  try {
    await ctx.editMessageText(newText);
  } catch (e) {
    // Ignore edit errors
  }
};

export default { draftStream, editDraft };
