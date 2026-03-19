// NEXUM Soul System - Per-user personalization with admin support

import { config } from "./core/config";

interface UserMemory {
  name?: string;
  interests: string[];
  projects: string[];
  preferences: Record<string, string>;
  notes: string[];
  apiKeys: Record<string, string>;
}

interface UserSoul {
  userId: number;
  memory: UserMemory;
  sessionContext: Array<{ role: string; content: string }>;
  createdAt: number;
  lastActive: number;
}

const userSouls = new Map<number, UserSoul>();

export const isAdmin = (userId: number): boolean => {
  return config.adminIds.includes(userId);
};

export const getUserSoul = (userId: number): UserSoul => {
  if (!userSouls.has(userId)) {
    userSouls.set(userId, {
      userId,
      memory: {
        interests: [],
        projects: [],
        preferences: {},
        notes: [],
        apiKeys: {},
      },
      sessionContext: [],
      createdAt: Date.now(),
      lastActive: Date.now(),
    });
  }
  const soul = userSouls.get(userId)!;
  soul.lastActive = Date.now();
  return soul;
};

export const addToMemory = (
  userId: number,
  category: keyof UserMemory,
  value: string
) => {
  const soul = getUserSoul(userId);
  if (category === "apiKeys") return;
  
  if (Array.isArray(soul.memory[category])) {
    (soul.memory[category] as string[]).push(value);
    if ((soul.memory[category] as string[]).length > 50) {
      (soul.memory[category] as string[]).shift();
    }
  }
};

export const addToContext = (
  userId: number,
  role: string,
  content: string
) => {
  const soul = getUserSoul(userId);
  soul.sessionContext.push({ role, content });
  
  if (soul.sessionContext.length > 30) {
    soul.sessionContext = soul.sessionContext.slice(-30);
  }
};

export const clearContext = (userId: number) => {
  const soul = getUserSoul(userId);
  soul.sessionContext = [];
};

export const buildSystemPrompt = (userId: number): string => {
  const soul = getUserSoul(userId);
  const { memory } = soul;
  const admin = isAdmin(userId);
  
  let prompt = `Ты NEXUM — персональный AI ассистент в Telegram.

Твои главные правила:
1. Будь дружелюбным и теплым
2. Отвечай развёрнуто (3-10 предложений), но не слишком длинно
3. Пиши естественно, как умный друг
4. Можно использовать эмодзи в начале или в тексте
5. Не повторяй вопрос пользователя
6. Если не понял — переспроси вежливо
7. Помогай с кодом, задачами, идеями
8. Запоминай информацию о пользователе`;

  if (admin) {
    prompt += `\n\n⚠️ ТЫ АДМИН! Имеешь доступ к управлению системой и статистике.`;
  }

  if (memory.name) {
    prompt += `\n\nПользователя зовут: ${memory.name}`;
  }

  if (memory.interests.length > 0) {
    prompt += `\n\nИнтересы: ${memory.interests.join(", ")}`;
  }

  if (memory.projects.length > 0) {
    prompt += `\n\nПроекты: ${memory.projects.join(", ")}`;
  }

  prompt += `\n\n🔒 ВАЖНО: Ты работаешь только с этим пользователем!`;

  return prompt;
};

export const getUserStats = (userId: number) => {
  const soul = getUserSoul(userId);
  return {
    totalMessages: soul.sessionContext.length,
    interests: soul.memory.interests.length,
    projects: soul.memory.projects.length,
    notes: soul.memory.notes.length,
    activeSince: soul.createdAt,
    lastActive: soul.lastActive,
    isAdmin: isAdmin(userId),
  };
};

export const getAllUsersStats = (): Array<{userId: number, messages: number, lastActive: number}> => {
  const stats: Array<{userId: number, messages: number, lastActive: number}> = [];
  for (const [userId, soul] of userSouls) {
    stats.push({
      userId,
      messages: soul.sessionContext.length,
      lastActive: soul.lastActive,
    });
  }
  return stats.sort((a, b) => b.lastActive - a.lastActive);
};

export const saveUserApiKey = (userId: number, provider: string, key: string) => {
  const soul = getUserSoul(userId);
  soul.memory.apiKeys[provider] = key;
};

export const getUserApiKeys = (userId: number): Record<string, string> => {
  const soul = getUserSoul(userId);
  return { ...soul.memory.apiKeys };
};

export default getUserSoul;
