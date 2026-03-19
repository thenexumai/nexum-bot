// Real-time streaming response with emoji reactions

import { Context } from "grammy";

interface StreamOptions {
  emoji?: string;
  typing?: boolean;
  chunks?: boolean;
}

export const streamResponse = async (
  ctx: Context,
  text: string,
  options: StreamOptions = {}
) => {
  const { emoji = "👀", typing = true, chunks = true } = options;
  
  try {
    // Send initial emoji reaction to user message
    if (ctx.msg?.message_id) {
      try {
        await ctx.api.raw("setMessageReaction", {
          chat_id: ctx.chat?.id,
          message_id: ctx.msg.message_id,
          reaction: [{ type: "emoji", emoji }],
        });
      } catch {
        // Silently fail if reactions not supported
      }
    }
    
    // Show typing indicator
    if (typing) {
      await ctx.replyWithChatAction("typing");
    }
    
    // Stream in chunks if long
    if (chunks && text.length > 500) {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let fullText = "";
      
      for (const sentence of sentences) {
        fullText += sentence;
        await ctx.replyWithChatAction("typing");
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      await ctx.reply(fullText);
    } else {
      // Send as single message
      await new Promise(resolve => setTimeout(resolve, 300));
      await ctx.reply(text);
    }
    
  } catch (error) {
    console.error("Stream error:", error);
    await ctx.reply(text);
  }
};

// Emoji feedback
export const sendEmojiReaction = async (
  ctx: Context,
  emoji: string
) => {
  try {
    if (ctx.msg?.message_id) {
      await ctx.api.raw("setMessageReaction", {
        chat_id: ctx.chat?.id,
        message_id: ctx.msg.message_id,
        reaction: [{ type: "emoji", emoji }],
      });
    }
  } catch {
    // Silently fail
  }
};

// Status emojis
export const REACTION_EMOJIS = {
  thinking: "🤔",
  working: "⚙️",
  loading: "⏳",
  done: "✅",
  error: "❌",
  idea: "💡",
  success: "🎉",
  typing: "📝",
};
