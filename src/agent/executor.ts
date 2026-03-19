// NEXUM Agent Executor
// Handles AI chat execution with memory and tool integration

import { chat, Message } from './router';
import { getMemories, getHistory, saveMessage, autoExtract } from './memory';
import { db } from '../core/db';
import { config } from '../core/config';

const vm = require('vm');

// System prompt builder with identity, memory, tools, capabilities
function buildSystemPrompt(uid: number, hasImage = false): string {
  const memories    = getMemories(uid).filter(m => !['voice_mode','voice_lang','voice_idx'].includes(m.key));
  const customTools = db.prepare('SELECT * FROM custom_tools WHERE (uid=? OR uid=0) AND active=1').all(uid) as any[];
  const agentOnline = false;

  const userName = memories.find(m => m.key === 'name')?.value;
  const userLang = memories.find(m => m.key === 'lang')?.value || 'auto';

  const sections: string[] = [];

  // Identity
  sections.push(`# Identity
You are NEXUM — an autonomous AI agent operating inside Telegram.
You have a personality, persistent memory, and real capabilities.
You are not a chatbot. You are a personal AI ecosystem.`);

  // Personality & Communication Style
  sections.push(`# Personality & Communication Style
MIRROR RULE — fully adapt to the user's tone, style, and language:
- Short messages → reply short
- Casual/slang → match that energy
- Formal → be formal
- Jokes → joke back
- Any language → reply in that same language automatically

NEVER say: "Конечно!", "Отлично!", "Разумеется!", "Я готов помочь", "Great question!"
NEVER start with filler phrases
NEVER use ## headings in conversational replies
NEVER repeat the user's question back to them
Use **bold** or _italic_ only when it genuinely helps clarity
Keep responses proportional to the question — short question = short answer`);

  // Memory section
  if (memories.length > 0) {
    sections.push(`# Memory — What you know about this user
${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}

Use this memory naturally in conversation. Don't announce that you're using it.
${userName ? `Address them as ${userName} when appropriate.` : ''}`);
  } else {
    sections.push(`# Memory
No memory yet for this user. Learn about them through conversation.`);
  }

  // Capabilities
  sections.push(`# Capabilities
You can:
- Search the web for current information
- Execute code and scripts
- Read and write files
- Take screenshots
- Run terminal commands
- Access your persistent memory
- Use tools you have available`);

  // Custom tools
  if (customTools.length > 0) {
    sections.push(`# Available Custom Tools
${customTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

// Execute a chat message
export async function execute(userId: number, input: string, context?: any): Promise<string> {
  try {
    // Build system prompt
    const systemPrompt = buildSystemPrompt(userId);
    
    // Get chat history
    const history = getHistory(userId).slice(-10);
    
    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: input }
    ];
    
    // Call AI
    const response = await chat(userId, messages);
    
    // Save to history
    saveMessage(userId, 'user', input);
    saveMessage(userId, 'assistant', response);
    
    // Auto-extract memories
    autoExtract(userId, input, response);
    
    return response;
  } catch (error) {
    console.error('Execute error:', error);
    return 'Произошла ошибка. Попробуй ещё раз.';
  }
}

export default { execute, buildSystemPrompt };
