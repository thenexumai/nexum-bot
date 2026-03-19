// NEXUM Telegram Message Handler
// Handles all incoming messages with personalized AI responses

import { Bot, Context } from "grammy";
import { getUserSoul, addToContext, clearContext, buildSystemPrompt, addToMemory, isAdmin } from "../soul";
import { streamResponse } from "../streaming-response";

export const handleMessage = async (ctx: Context, bot: Bot) => {
  const msg = ctx.message?.text;
  const userId = ctx.from?.id || 0;
  
  if (!msg || msg.startsWith("/")) return;
  
  // Get user's personalized soul
  const soul = getUserSoul(userId);
  
  // Show typing indicator
  await ctx.replyWithChatAction("typing");
  
  // Add to context
  addToContext(userId, "user", msg);
  
  // Detect user info from messages
  const nameMatch = msg.match(/меня зовут (\w+)|я (\w+)|моё имя (\w+)|зовут (\w+)/i);
  if (nameMatch) {
    const name = nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4];
    soul.memory.name = name;
  }
  
  // Detect interests
  const interests = msg.match(/мне нравится (.+)|я люблю (.+)|интересуюсь (.+)/i);
  if (interests) {
    const interest = interests[1] || interests[2] || interests[3];
    addToMemory(userId, "interests", interest);
  }
  
  // Detect projects
  const projects = msg.match(/мой проект (.+)|работаю над (.+)|делаю (.+)/i);
  if (projects) {
    const project = projects[1] || projects[2] || projects[3];
    addToMemory(userId, "projects", project);
  }
  
  try {
    // Import AI
    const { callAI } = await import("../core/ai-providers");
    
    // Build personalized system prompt with explicit instructions for longer responses
    let systemPrompt = buildSystemPrompt(userId);
    systemPrompt += `

IMPORTANT INSTRUCTIONS:
- Always respond with at least 2-3 complete sentences
- Be friendly and conversational
- Show that you understand the user's message
- Ask follow-up questions when appropriate
- Don't just acknowledge - elaborate slightly`;
    
    // Get context messages
    const contextMessages = soul.sessionContext.slice(-10).map(m => ({ role: m.role, content: m.content }));
    
    // Build final messages
    const messages = [
      { role: "system", content: systemPrompt },
      ...contextMessages,
    ];
    
    // Call AI with no user keys (use system keys)
    const userKeys: Record<string, string> = {};
    const response = await callAI(userKeys, messages);
    
    if (response && response.text) {
      // Add to context
      addToContext(userId, "assistant", response.text);
      
      console.log(`[AI] ${response.provider} -> ${response.text.substring(0, 50)}...`);
      
      // Stream response
      await streamResponse(ctx, response.text, { userMessage: msg });
    } else {
      await ctx.reply("Извини, временно не могу ответить. Попробуй чуть позже!");
    }
  } catch (error) {
    console.error("AI error:", error);
    await ctx.reply("Произошла ошибка. Попробуй ещё раз!");
  }
};

// Streaming effect for longer responses
export const sendStreamingMessage = async (ctx: Context, text: string) => {
  if (text.length > 500) {
    const chunks = text.match(/.{1,400}[.!?]?\s?/g) || [text];
    
    for (const chunk of chunks) {
      await ctx.replyWithChatAction("typing");
      await new Promise(resolve => setTimeout(resolve, 300));
      await ctx.reply(chunk);
    }
  } else {
    await ctx.reply(text);
  }
};

export default handleMessage;
