// AI Provider Integrations - Real API calls

interface AIResponse {
  text: string;
  tokensUsed: number;
  cost: number;
  provider: string;
}

// Groq Integration (Free tier available)
export const callGroq = async (
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  model: string = "llama-3.3-70b-versatile"
): Promise<AIResponse | null> => {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("Groq API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return {
      text: data.choices[0]?.message?.content || "",
      tokensUsed: data.usage?.total_tokens || 0,
      cost: (data.usage?.total_tokens || 0) * 0.0000005, // ~$0.5 per 1M tokens
      provider: "groq",
    };
  } catch (error) {
    console.error("Groq error:", error);
    return null;
  }
};

// DeepSeek Integration (Cheap)
export const callDeepSeek = async (
  apiKey: string,
  messages: Array<{ role: string; content: string }>
): Promise<AIResponse | null> => {
  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("DeepSeek API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return {
      text: data.choices[0]?.message?.content || "",
      tokensUsed: data.usage?.total_tokens || 0,
      cost: (data.usage?.total_tokens || 0) * 0.0000007, // ~$0.7 per 1M tokens
      provider: "deepseek",
    };
  } catch (error) {
    console.error("DeepSeek error:", error);
    return null;
  }
};

// Main AI Router with fallback
export const callAI = async (
  userApiKeys: Record<string, string>,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): Promise<AIResponse | null> => {
  const fullMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  // Try Groq first (free tier)
  if (userApiKeys.groq) {
    const result = await callGroq(userApiKeys.groq, fullMessages);
    if (result) return result;
  }

  // Fallback to DeepSeek
  if (userApiKeys.deepseek) {
    const result = await callDeepSeek(userApiKeys.deepseek, fullMessages);
    if (result) return result;
  }

  // Fallback to default system key (if available)
  if (process.env.GR1) {
    const result = await callGroq(process.env.GR1, fullMessages);
    if (result) return result;
  }

  return null;
};
