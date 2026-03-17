// AI Router — выбирает модель по приоритету и доступности

interface AIProvider {
  name: string;
  model: string;
  speed: number; // 1-10
  cost: number; // cents per 1k tokens
  available: boolean;
}

const providers: AIProvider[] = [
  { name: "Groq", model: "llama-3.3-70b-specdec", speed: 10, cost: 0.05, available: true },
  { name: "DeepSeek", model: "deepseek-chat", speed: 8, cost: 0.07, available: true },
  { name: "Claude Haiku", model: "claude-3-5-haiku", speed: 7, cost: 0.08, available: true },
  { name: "Gemini", model: "gemini-1.5-flash", speed: 9, cost: 0.075, available: true },
];

export const selectProvider = (userPrefs?: string): AIProvider => {
  const available = providers.filter((p) => p.available);
  
  if (userPrefs) {
    const pref = available.find((p) => p.name.toLowerCase().includes(userPrefs.toLowerCase()));
    if (pref) return pref;
  }

  // Default: cheapest + fast
  return available.sort((a, b) => a.cost - b.cost)[0];
};

export const callAI = async (
  provider: AIProvider,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string
): Promise<string> => {
  // Stub — реальная интеграция после 24-го
  console.log(`[${provider.name}] Processing request...`);
  return "AI response placeholder";
};
