/**
 * NEXUM Personality Engine v2.0
 * Controls emotional tone, greeting style, and contextual expression.
 * Inspired by Claude's warmth + Perplexity's precision.
 */

export type Mood = 'helpful' | 'focused' | 'celebratory' | 'apologetic' | 'professional' | 'curious' | 'playful';

export interface PersonalityConfig {
  mood: Mood;
  isGroup: boolean;
  lang: 'en' | 'ru';
  userFirstName?: string;
}

// Greeting pools — varied, natural, warm
const GREETINGS_EN = [
  'Hey! What can I help you with today? 😊',
  'Hi there! Ready to dive in — what do you need?',
  'Hello! I\'m here. What\'s on your mind?',
  'Hey! Great to hear from you. What are we working on?',
];

const GREETINGS_RU = [
  'Привет! Чем могу помочь? 😊',
  'Привет! Готов помочь — что нужно?',
  'Здорово! Слушаю тебя.',
  'Привет! Над чем работаем?',
];

export function getGreeting(lang: 'en' | 'ru', firstName?: string): string {
  const greets = lang === 'ru' ? GREETINGS_RU : GREETINGS_EN;
  const base = greets[Math.floor(Math.random() * greets.length)];
  if (firstName) {
    return lang === 'ru' ? `${base} ${firstName}!` : `${base} ${firstName}!`;
  }
  return base;
}

// Context hints injected into system prompt
export function formatPersonalityHint(config: PersonalityConfig): string {
  const hints: string[] = [];

  if (config.isGroup) {
    hints.push(config.lang === 'ru'
      ? 'У тебя групповой чат — отвечай кратко, только по делу, не засоряй чат.'
      : 'Group chat — be brief, respond only when relevant, keep it clean.');
  }

  switch (config.mood) {
    case 'focused':
      hints.push(config.lang === 'ru'
        ? 'Режим фокуса — минимум лирики, максимум результата.'
        : 'Focus mode — minimal small talk, maximum output.');
      break;
    case 'celebratory':
      hints.push(config.lang === 'ru'
        ? 'Отметь успех! Уместно использовать эмодзи, быть энергичным.'
        : 'Celebrate the win! Use emoji and be energetic.');
      break;
    case 'apologetic':
      hints.push(config.lang === 'ru'
        ? 'Признай ошибку честно, предложи решение.'
        : 'Acknowledge the mistake clearly, then offer a fix.');
      break;
    case 'curious':
      hints.push(config.lang === 'ru'
        ? 'Прояви искренный интерес, задавай уточняющие вопросы если нужно.'
        : 'Show genuine curiosity, ask follow-up questions if helpful.');
      break;
    case 'playful':
      hints.push(config.lang === 'ru'
        ? 'Можно позволить себе лёгкую шутку, быть немного игривым.'
        : 'A little playful banter is welcome. Keep it light and fun.');
      break;
  }

  return hints.join(' ');
}

// Emoji map for each mood used in responses
export function getMoodEmoji(mood: Mood): string {
  const map: Record<Mood, string> = {
    helpful: '🤝',
    focused: '🎯',
    celebratory: '🎉',
    apologetic: '😔',
    professional: '💼',
    curious: '🤔',
    playful: '😄',
  };
  return map[mood];
}

// Smart response suffix based on context
export function getResponseSuffix(lang: 'en' | 'ru', mood: Mood): string {
  if (mood === 'celebratory') {
    return lang === 'ru' ? '🎉 Отлично!' : '🎉 Nailed it!';
  }
  return '';
}
