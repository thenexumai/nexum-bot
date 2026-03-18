// NEXUM Soul - Персонализация под каждого пользователя (без личных данных в коде)

interface UserSoul {
  userId: number;
  createdAt: Date;
  preferences: {
    language: string;
    timezone: string;
    model: string;
    verbose: boolean;
  };
  memory: {
    name?: string;
    interests: string[];
    projects: string[];
    notes: string[];
  };
  sessionContext: Array<{ role: string; content: string; timestamp: Date }>;
}

// In-memory user souls (replace with DB)
const userSouls = new Map<number, UserSoul>();

export const getUserSoul = (userId: number): UserSoul => {
  if (!userSouls.has(userId)) {
    userSouls.set(userId, {
      userId,
      createdAt: new Date(),
      preferences: {
        language: "ru",
        timezone: "Asia/Tashkent",
        model: "groq",
        verbose: false,
      },
      memory: {
        interests: [],
        projects: [],
        notes: [],
      },
      sessionContext: [],
    });
  }
  return userSouls.get(userId)!;
};

export const updateUserSoul = (userId: number, updates: Partial<UserSoul>) => {
  const soul = getUserSoul(userId);
  Object.assign(soul, updates);
  userSouls.set(userId, soul);
};

export const addToContext = (userId: number, role: string, content: string) => {
  const soul = getUserSoul(userId);
  soul.sessionContext.push({ role, content, timestamp: new Date() });
  
  // Keep last 30 messages
  if (soul.sessionContext.length > 30) {
    soul.sessionContext = soul.sessionContext.slice(-30);
  }
};

export const clearContext = (userId: number) => {
  const soul = getUserSoul(userId);
  soul.sessionContext = [];
};

export const addToMemory = (userId: number, type: "interests" | "projects" | "notes", value: string) => {
  const soul = getUserSoul(userId);
  if (!soul.memory[type].includes(value)) {
    soul.memory[type].push(value);
  }
};

// System prompts per user (personalized)
export const buildSystemPrompt = (userId: number): string => {
  const soul = getUserSoul(userId);
  
  let prompt = `Ты NEXUM — персональный AI ассистент. 
  
ПРАВИЛА:
- Отвечай кратко и по делу (2-3 предложения)
- Никаких эмодзи и реакций в начале сообщений
- Пиши как человек, не как бот
- Не повторяйся
- Персонализируй ответы под этого юзера
- Если юзер спрашивает о себе — используй его память
- Молчи если нечего сказать

`;

  // Add user memory if exists
  if (soul.memory.name) {
    prompt += `Имя юзера: ${soul.memory.name}\n`;
  }
  
  if (soul.memory.interests.length > 0) {
    prompt += `Интересы: ${soul.memory.interests.join(", ")}\n`;
  }
  
  if (soul.memory.projects.length > 0) {
    prompt += `Проекты: ${soul.memory.projects.join(", ")}\n`;
  }
  
  return prompt;
};

// Heartbeat checks for NEXUM
export const HEARTBEAT_CHECKS = {
  // Check every 30 minutes
  checkInterval: 30 * 60 * 1000,
  
  tasks: [
    "Проверить Railway статус",
    "Проверить GitHub репозиторий",
    "Проверить AI провайдеры",
    "Проверить баланс (если есть)",
    "Проверить активность юзеров",
  ],
  
  alerts: [
    "Если Railway упал — сообщить",
    "Если AI не отвечает — переключить провайдера",
    "Если есть новые issues — показать",
    "Если давно не было активности — предложить проверить",
  ],
};