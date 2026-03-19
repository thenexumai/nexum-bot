// NEXUM Telegram Formatting Utilities

// Message formatting helpers

export const formatBold = (text: string): string => {
  return `*${text}*`;
};

export const formatItalic = (text: string): string => {
  return `_${text}_`;
};

export const formatCode = (text: string): string => {
  return `\`${text}\``;
};

export const formatCodeBlock = (text: string, language?: string): string => {
  return `\`\`\`${language || ""}\n${text}\n\`\`\``;
};

export const formatList = (items: string[]): string => {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
};

export const formatBulletList = (items: string[]): string => {
  return items.map(item => `• ${item}`).join("\n");
};

// Status indicators
export const STATUS_REACTIONS = {
  queued: "⏳",
  thinking: "🤔",
  tool: "🛠️",
  coding: "💻",
  web: "🌐",
  done: "✅",
  error: "❌",
  voice: "🎤",
  image: "🖼️",
  memory: "🧠",
};

// NEXUM specific emojis
export const NEXUM_EMOJIS = {
  bot: "🤖",
  chat: "💬",
  spark: "✨",
  target: "🎯",
  idea: "💡",
  bolt: "⚡",
  rocket: "🚀",
  brain: "🧠",
  heart: "❤️",
  success: "🎉",
  working: "⚙️",
  loading: "⏳",
  check: "✅",
  cross: "❌",
  pc: "💻",
  phone: "📱",
  cloud: "☁️",
  database: "🗄️",
  money: "💰",
  task: "✅",
  note: "📝",
  calendar: "📅",
  star: "⭐",
  fire: "🔥",
  power: "💪",
};

export const pickEmoji = (category: keyof typeof NEXUM_EMOJIS): string => {
  return NEXUM_EMOJIS[category] || NEXUM_EMOJIS.bot;
};
