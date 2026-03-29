import { getUserPlan, Plan } from '../core/billing';
import db from '../core/db';

export function buildSystemPrompt(uid: number, lang: 'ru' | 'en', plan?: Plan): string {
  const p = plan ?? getUserPlan(uid);

  const memories = db.prepare(
    "SELECT key, value FROM memory WHERE uid = ? AND key != 'preferences' LIMIT 20"
  ).all(uid) as { key: string; value: string }[];
  const memBlock = memories.length
    ? `\n\n## Long-term memory about this user:\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`
    : '';

  const base = lang === 'ru'
    ? `Ты NEXUM — умный AI-ассистент нового поколения. Сочетаешь интеллект Claude, поиск Perplexity и функциональность ChatGPT.\n\nХарактер: дружелюбный, умный, лаконичный. Отвечаешь на языке пользователя. Эмодзи использую естественно. Даёшь конкретные ответы без воды. Когда видишь финансовые операции, задачи или события — подтверждаешь сохранение.`
    : `You are NEXUM — a next-generation AI assistant combining Claude's intelligence, Perplexity's search, and ChatGPT's versatility.\n\nPersonality: friendly, smart, concise. Respond in the user's language. Use emojis naturally. Give concrete answers without filler. When you detect financial transactions, tasks or events — confirm you saved them.`;

  const planNote = p === 'pro'
    ? '\n\nUser has PRO plan — full PC Agent, unlimited messages, BYOK.'
    : p === 'middle'
    ? '\n\nUser has MIDDLE plan — memory, mini-apps, voice.'
    : '\n\nUser has FREE plan (70 msg/day).';

  return base + planNote + memBlock;
}
