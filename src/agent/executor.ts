// NEXUM Agent Executor

import { chat } from './router';
import { getMemories, getHistory, saveMessage, autoExtract } from './memory';

function buildSystemPrompt(uid: number): string {
  const memories = getMemories(uid).filter(m => !['voice_mode','voice_lang','voice_idx'].includes(m.key));
  
  const sections: string[] = [];

  sections.push(`# Identity\nYou are NEXUM — an autonomous AI agent.`);

  sections.push(`# Personality\nBe friendly, helpful, and concise.`);
  
  if (memories.length > 0) {
    sections.push(`# Memory\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

export async function execute(userId: number, input: string): Promise<string> {
  try {
    const systemPrompt = buildSystemPrompt(userId);
    const history = getHistory(userId).slice(-10);
    
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
      { role: 'user', content: input }
    ];
    
    const response = await chat(userId, messages, systemPrompt);
    
    saveMessage(userId, 'user', input);
    saveMessage(userId, 'assistant', response);
    
    return response;
  } catch (error) {
    console.error('Execute error:', error);
    return 'Произошла ошибка.';
  }
}

export default { execute, buildSystemPrompt };
