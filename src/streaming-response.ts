// Real-time streaming response with context-aware emoji reactions

import { Context } from "grammy";

interface StreamOptions {
  typing?: boolean;
  chunks?: boolean;
  userMessage?: string; // For context analysis
}

// Intelligent emoji selection based on context
const selectReactionForContext = (userMessage: string): string | null => {
  const msg = userMessage.toLowerCase();
  
  // Emotion/question context
  if (msg.includes("?")) return "🤔"; // Thinking for questions
  if (msg.includes("!!!")) return "😂"; // Excited
  if (msg.includes("помощ") || msg.includes("помог")) return "🙌"; // Help
  if (msg.includes("спасиб") || msg.includes("спс")) return "❤️"; // Thanks
  if (msg.includes("код") || msg.includes("script")) return "⚙️"; // Code
  if (msg.includes("идея") || msg.includes("idea")) return "💡"; // Idea
  if (msg.includes("ок") || msg.includes("yes")) return "✅"; // Agreement
  if (msg.includes("нет") || msg.includes("no")) return "👎"; // Disagreement
  if (msg.includes("🎉") || msg.includes("праздн")) return "🎉"; // Celebration
  if (msg.includes("грус") || msg.includes("sad")) return "😞"; // Sad
  
  // 30% chance to react otherwise (sparse reactions)
  if (Math.random() < 0.3) {
    const generalEmojis = ["👀", "🎯", "🚀", "💪", "🔥"];
    return generalEmojis[Math.floor(Math.random() * generalEmojis.length)];
  }
  
  return null; // No reaction
};

export const streamResponse = async (
  ctx: Context,
  text: string,
  options: StreamOptions = {}
) => {
  const { typing = true, chunks = true, userMessage } = options;
  
  try {
    // Smart emoji reaction based on user message context
    const userMsg = userMessage || ctx.message?.text || "";
    const emoji = selectReactionForContext(userMsg);
    
    // Send emoji reaction only if context matches
    if (emoji && ctx.msg?.message_id) {
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
