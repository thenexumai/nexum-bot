// NEXUM Soul System - Per-user personalization and memory
// Each user gets their own personalized AI experience

interface UserMemory {
  name?: string;
  interests: string[];
  projects: string[];
  preferences: Record<string, string>;
  notes: string[];
}

interface UserSoul {
  userId: number;
  memory: UserMemory;
  sessionContext: Array<{ role: string; content: string }>;
  createdAt: number;
  lastActive: number;
}

// In-memory user souls (replace with DB for production)
const userSouls = new Map<number, UserSoul>();

export const getUserSoul = (userId: number): UserSoul => {
  if (!userSouls.has(userId)) {
    userSouls.set(userId, {
      userId,
      memory: {
        interests: [],
        projects: [],
        preferences: {},
        notes: [],
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
  if (Array.isArray(soul.memory[category])) {
    (soul.memory[category] as string[]).push(value);
    // Keep last 50 items per category
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
  
  // Keep last 30 messages for context
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
  
  let prompt = `Ты NEXUM — персональный AI ассистент.

Твоя задача:
- Помогать пользователю с любыми задачами
- Отвечать кратко и по делу (2-3 предложения)
- Писать код когда нужно
- Не тратить токены на пустые ответы
- Работать через одного бота для всех пользователей
- Быть персонализированным под каждого юзера`;

  if (memory.name) {
    prompt += `\n\nПользователя зовут: ${memory.name}`;
  }

  if (memory.interests.length > 0) {
    prompt += `\nИнтересы: ${memory.interests.join(", ")}`;
  }

  if (memory.projects.length > 0) {
    prompt += `\nПроекты: ${memory.projects.join(", ")}`;
  }

  prompt += `\n\nСтиль общения:
- Дружелюбно, но без лишних эмоций
- По делу, без воды
- С эмодзи в начале сообщения (🤖💬✨🎯💡⚡🚀)
- Текст появляется постепенно (эффект печати)`;

  return prompt;
};

export const getUserStats = (userId: number) => {
  const soul = getUserSoul(userId);
  return {
    totalMessages: soul.sessionContext.length,
    interests: soul.memory.interests.length,
    projects: soul.memory.projects.length,
    notes: soul.memory.notes.length,
    activeSince: new Date(soul.createdAt).toISOString(),
  };
};

export default getUserSoul;
