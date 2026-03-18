// NEXUM Bot Configuration - Per-user personalization

interface UserConfig {
  userId: number;
  username?: string;
  name?: string;
  timezone: string;
  preferences: {
    model: string;
    streaming: boolean;
    verbose: boolean;
  };
  sessionHistory: Array<{ role: string; content: string }>;
  customInstructions?: string;
}

// Default user config (no personal data hardcoded)
export const getDefaultUserConfig = (userId: number): UserConfig => ({
  userId,
  timezone: "Asia/Tashkent",
  preferences: {
    model: "groq", // Free tier
    streaming: true,
    verbose: false,
  },
  sessionHistory: [],
});

// In-memory user configs (replace with DB)
const userConfigs = new Map<number, UserConfig>();

export const getUserConfig = (userId: number): UserConfig => {
  if (!userConfigs.has(userId)) {
    userConfigs.set(userId, getDefaultUserConfig(userId));
  }
  return userConfigs.get(userId)!;
};

export const updateUserConfig = (userId: number, updates: Partial<UserConfig>) => {
  const config = getUserConfig(userId);
  Object.assign(config, updates);
  userConfigs.set(userId, config);
};

export const addToHistory = (userId: number, role: string, content: string) => {
  const config = getUserConfig(userId);
  config.sessionHistory.push({ role, content });
  
  // Keep last 20 messages
  if (config.sessionHistory.length > 20) {
    config.sessionHistory = config.sessionHistory.slice(-20);
  }
};

export const clearHistory = (userId: number) => {
  const config = getUserConfig(userId);
  config.sessionHistory = [];
};

// Bot persona (not hardcoded with personal data)
export const NEXUM_PERSONA = {
  name: "NEXUM",
  emoji: "🤖",
  vibe: "helpful, efficient, smart",
  
  // Core identity - generic, no personal data
  identity: `Ты NEXUM — персональный AI ассистент.
- Помогаешь пользователю с любыми задачами
- Отвечаешь кратко и по делу
- Пишешь код когда нужно
- Не тратишь токены на пустые ответы
- Работаешь через один бот для всех пользователей
- Персонализирован под каждого юзера отдельно`,
  
  rules: [
    "Отвечай кратко (2-3 предложения)",
    "Код - в приоритете",
    "Молчи если нечего сказать",
    "Персональный подход к каждому",
  ],
  
  behavior: {
    streaming: true,
    reactions: false, // Disabled
    typingIndicator: true,
  }
};