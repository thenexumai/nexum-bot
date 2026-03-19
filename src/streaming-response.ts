// Real-time streaming response with emoji prefix

import { Context } from "grammy";

interface StreamOptions {
  typing?: boolean;
  chunks?: boolean;
  userMessage?: string;
}

// Add emoji prefix for visual style
const addEmojiPrefix = (text: string): string => {
  const emojis = ["🤖", "💬", "✨", "🎯", "💡", "⚡", "🚀"];
  const prefix = emojis[Math.floor(Math.random() * emojis.length)];
  return `${prefix} ${text}`;
};

export const streamResponse = async (
  ctx: Context,
  text: string,
  options: StreamOptions = {}
) => {
  const { typing = true, chunks = true } = options;
  
  try {
    // Show typing indicator
    if (typing) {
      await ctx.replyWithChatAction("typing");
    }
    
    // Add emoji prefix
    const textWithEmoji = addEmojiPrefix(text);
    
    // Stream character by character for smooth effect
    if (chunks && text.length > 200) {
      let msg = await ctx.reply("...");
      let displayText = "";
      
      for (let i = 0; i < textWithEmoji.length; i++) {
        displayText += textWithEmoji[i];
        
        if (i % 5 === 0 || i === textWithEmoji.length - 1) {
          try {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, displayText);
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch {
            break;
          }
        }
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 300));
      await ctx.reply(textWithEmoji);
    }
    
  } catch (error) {
    console.error("Stream error:", error);
    await ctx.reply(text);
  }
};
