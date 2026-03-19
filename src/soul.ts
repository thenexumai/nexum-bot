// NEXUM Soul System - Per-user personalization with admin support
// Each user gets their own personalized AI experience

import { config } from "../core/config";

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

// In-memory user souls - ISOLATED per user
const userSouls = new Map<number, UserSoul>();

// Check if user is admin
export const isAdmin = (userId: number): boolean => {
  return config.adminIds.includes(userId);
};

// Get user's personalized soul - ISOLATED
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

// Add to user's isolated memory
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

// Add to user's isolated session context
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

// Clear user's own context only
export const clearContext = (userId: number) => {
  const soul = getUserSoul(userId);
  soul.sessionContext = [];
};

// Build personalized system prompt for THIS user only
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
    prompt += `

⚠️ ТЫ АДМИН! Имеешь доступ к:
- Управлению системой
- Просмотру статистики
- Модерации контента`;
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

  prompt += `\n\n🔒 ВАЖНО: Ты работаешь только с этим пользователем. Никогда не упоминай и не раскрывай данные других юзеров!`;

  return prompt;
};

// Get user stats - ADMIN only can see all
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

// ADMIN: Get all users stats
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

// Save user's API key - ISOLATED
export const saveUserApiKey = (userId: number, provider: string, key: string) => {
  const soul = getUserSoul(userId);
  soul.memory.apiKeys[provider] = key;
};

// Get user's API keys - ISOLATED
export const getUserApiKeys = (userId: number): Record<string, string> => {
  const soul = getUserSoul(userId);
  return { ...soul.memory.apiKeys };
};

export default getUserSoul;
