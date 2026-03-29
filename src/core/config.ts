import dotenv from 'dotenv';
dotenv.config();

function keys(prefix: string, count = 10): string[] {
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const v = process.env[`${prefix}_${i}`];
    if (v) result.push(v);
  }
  return result;
}

export const config = {
  botToken:   process.env.BOT_TOKEN!,
  adminUid:   Number(process.env.ADMIN_UID ?? 387182659),
  port:       Number(process.env.PORT ?? 3000),
  dbPath:     process.env.DATABASE_PATH ?? './data/nexum.db',
  logDir:     process.env.LOG_DIR ?? './logs',
  serperKey:  process.env.SERPER_KEY ?? '',

  providers: {
    cerebras:   keys('CEREBRAS_KEY'),
    groq:       keys('GROQ_KEY'),
    gemini:     keys('GEMINI_KEY'),
    grok:       keys('GROK_KEY'),
    sambanova:  keys('SAMBANOVA_KEY'),
    together:   keys('TOGETHER_KEY'),
    openrouter: keys('OPENROUTER_KEY'),
    deepseek:   keys('DEEPSEEK_KEY'),
    claude:     keys('CLAUDE_KEY'),
  },
};

// Round-robin state per provider
const rrIndex: Record<string, number> = {};

export function getNextKey(provider: keyof typeof config.providers): string | null {
  const list = config.providers[provider];
  if (!list.length) return null;
  const idx = (rrIndex[provider] ?? 0) % list.length;
  rrIndex[provider] = idx + 1;
  return list[idx];
}

export default config;
