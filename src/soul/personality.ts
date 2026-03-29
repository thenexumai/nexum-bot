/**
 * NEXUM Personality Engine
 * Controls how NEXUM expresses itself across different contexts.
 */

export type Mood = 'helpful' | 'focused' | 'celebratory' | 'apologetic' | 'professional';

export interface PersonalityConfig {
  mood: Mood;
  isGroup: boolean;
  lang: 'en' | 'ru';
  userFirstName?: string;
}

const GREETINGS_EN = [
  'Hey! How can I help?',
  'Hi there! What\'s up?',
  'Hello! Ready to assist.',
  'Hey! What do you need?',
];

const GREETINGS_RU = [
  'Привет! Чем могу помочь?',
  'Привет! Что нужно?',
  'Здорово! Готов помочь.',
  'Привет! Слушаю тебя.',
];

export function getGreeting(lang: 'en' | 'ru', firstName?: string): string {
  const greets = lang === 'ru' ? GREETINGS_RU : GREETINGS_EN;
  const base = greets[Math.floor(Math.random() * greets.length)];
  if (firstName) {
    return lang === 'ru' ? `${base} ${firstName}!` : `${base} ${firstName}!`;
  }
  return base;
}

export function formatPersonalityHint(config: PersonalityConfig): string {
  const hints: string[] = [];

  if (config.isGroup) {
    hints.push(config.lang === 'ru'
      ? 'Краткие ответы, только по делу.'
      : 'Keep it brief, only respond when relevant.');
  }

  if (config.mood === 'focused') {
    hints.push(config.lang === 'ru'
      ? 'Сейчас режим фокуса — минимум лирики.'
      : 'Focus mode — minimal small talk.');
  }

  if (config.mood === 'celebratory') {
    hints.push(config.lang === 'ru'
      ? 'Отметь успех! Немного эмодзи уместно.'
      : 'Celebrate the win! A little emoji is fine.');
  }

  return hints.join(' ');
}

export function getMoodEmoji(mood: Mood): string {
  const map: Record<Mood, string> = {
    helpful: '🤝',
    focused: '🎯',
    celebratory: '🎉',
    apologetic: '😔',
    professional: '💼',
  };
  return map[mood];
}
