// Telegram Handler - OpenClaw-style messaging (no reactions, real-time typing)

import { Bot, Context } from "grammy";
import { getUserSoul, addToContext, clearContext, buildSystemPrompt, addToMemory } from "../soul";

export const handleMessage = async (ctx: Context, bot: Bot) => {
  const msg = ctx.message?.text;
  const userId = ctx.from?.id || 0;
  
  if (!msg || msg.startsWith("/")) return;
  
  // Get user's personalized soul
  const soul = getUserSoul(userId);
  
  // Show typing indicator (real-time feel)
  await ctx.replyWithChatAction("typing");
  
  // Add to context
  addToContext(userId, "user", msg);
  
  // Detect user info from messages
  const nameMatch = msg.match(/меня зовут (\w+)|я (\w+)|моё имя (\w+)/i);
  if (nameMatch) {
    const name = nameMatch[1] || nameMatch[2] || nameMatch[3];
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
    
    // Build personalized system prompt
    const systemPrompt = buildSystemPrompt(userId);
    
    // Build messages with context
    const messages = [
      { role: "system", content: systemPrompt },
      ...soul.sessionContext.slice(-15).map(m => ({ role: m.role, content: m.content })),
    ];
    
    // Call AI
    const apiKeys: Record<string, string> = {};
    const response = await callAI(apiKeys, messages);
    
    if (response) {
      // Add to context
      addToContext(userId, "assistant", response.text);
      
      // Simulate typing delay (real-time feel)
      const delay = Math.min(response.text.length * 20, 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Send plain text (no reactions, no markdown formatting for simple messages)
      await ctx.reply(response.text);
    } else {
      await ctx.reply("Что-то не получается. Попробуй ещё раз.");
    }
  } catch (error) {
    console.error("AI error:", error);
    await ctx.reply("Ошибка. Попробуй позже.");
  }
};

// Streaming effect for longer responses
export const sendStreamingMessage = async (ctx: Context, text: string) => {
  // For long messages, split into chunks
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