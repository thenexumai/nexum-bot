// Real-time streaming response with context-aware emoji reactions

import { Context } from "grammy";

interface StreamOptions {
  typing?: boolean;
  chunks?: boolean;
  userMessage?: string; // For context analysis
}

// Emoji reactions disabled - no reactions on messages
const selectReactionForContext = (userMessage: string): string | null => {
  // Return null to disable all reactions
  return null;
};

// Add emoji prefix based on context
const addEmojiPrefix = (text: string, userMessage?: string): string => {
  const emoji = selectReactionForContext(userMessage);
  const emojis = ["🤖", "💬", "✨", "🎯", "💡", "⚡", "🚀"];
  const prefix = emoji || emojis[Math.floor(Math.random() * emojis.length)];
  return `${prefix} ${text}`;
};

export const streamResponse = async (
  ctx: Context,
  text: string,
  options: StreamOptions = {}
) => {
  const { typing = true, chunks = true, userMessage } = options;
  
  try {
    // Show typing indicator
    if (typing) {
      await ctx.replyWithChatAction("typing");
    }
    
    // Add emoji prefix
    const textWithEmoji = addEmojiPrefix(text, userMessage);
    
    // Stream character by character for smooth effect
    if (chunks && text.length > 200) {
      // Send message and edit it character by character
      let msg = await ctx.reply("...");
      let displayText = "";
      
      for (let i = 0; i < textWithEmoji.length; i++) {
        displayText += textWithEmoji[i];
        
        // Edit every 5 characters or 100ms
        if (i % 5 === 0 || i === textWithEmoji.length - 1) {
          try {
            await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, displayText);
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch {
            // Silently fail on edit rate limit
            break;
          }
        }
      }
    } else {
      // Send as single message for short text
      await new Promise(resolve => setTimeout(resolve, 300));
      await ctx.reply(textWithEmoji);
    }
    
  } catch (error) {
    console.error("Stream error:", error);
    await ctx.reply(text);
  }
};

// Manual emoji reaction if needed
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

// Status emojis for internal use
export const REACTION_EMOJIS = {
  thinking: "🤔",
  working: "⚙️",
  loading: "⏳",
  done: "✅",
  error: "❌",
  idea: "💡",
  success: "🎉",
  typing: "📝",
  attention: "👀",
  rocket: "🚀",
  power: "💪",
  fire: "🔥",
  target: "🎯",
};
