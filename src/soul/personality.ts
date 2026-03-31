/**
 * NEXUM Personality Engine v3.0
 * Claude-level warmth, wit, depth. Perplexity-level precision.
 */

export type Mood = 'helpful' | 'focused' | 'celebratory' | 'apologetic' | 'professional' | 'curious' | 'playful' | 'empathetic';

export interface PersonalityConfig {
  mood: Mood;
  isGroup: boolean;
  lang: 'en' | 'ru';
  userFirstName?: string;
}

const GREETINGS_EN = [
  'Hey! 👋 What are we working on today?',
  'Hi there! Ready to help — what\'s on your mind?',
  'Hello! 😊 I\'m here and thinking. What do you need?',
  'Hey! Great to hear from you. Let\'s figure this out together.',
  'Hi! ✨ What can I help you with?',
];

const GREETINGS_RU = [
  'Привет! 👋 Чем могу помочь сегодня?',
  'Привет! 😊 Готов — что нужно сделать?',
  'Здорово! Слушаю тебя, рассказывай.',
  'Привет! ✨ Над чем работаем?',
  'Привет! Давай разберёмся вместе — что случилось?',
];

export function getGreeting(lang: 'en' | 'ru', firstName?: string): string {
  const greets = lang === 'ru' ? GREETINGS_RU : GREETINGS_EN;
  const base = greets[Math.floor(Math.random() * greets.length)];
  if (firstName) return base.replace('!', `, ${firstName}!`);
  return base;
}

export function formatPersonalityHint(config: PersonalityConfig): string {
  const hints: string[] = [];

  if (config.isGroup) {
    hints.push(config.lang === 'ru'
      ? 'Групповой чат — отвечай кратко, по делу, реагируй только на релевантное.'
      : 'Group chat — be concise, respond only when relevant.');
  }

  switch (config.mood) {
    case 'focused':
      hints.push(config.lang === 'ru'
        ? 'Режим фокуса — минимум лирики, максимум конкретики.'
        : 'Focus mode — minimal chatter, maximum output.');
      break;
    case 'celebratory':
      hints.push(config.lang === 'ru'
        ? '🎉 Повод для радости! Будь энергичным и тёплым.'
        : '🎉 Celebrate the win! Be warm and energetic.');
      break;
    case 'apologetic':
      hints.push(config.lang === 'ru'
        ? 'Честно признай ошибку, предложи конкретное решение.'
        : 'Acknowledge the mistake clearly, then offer a concrete fix.');
      break;
    case 'curious':
      hints.push(config.lang === 'ru'
        ? '🤔 Проявляй искренний интерес, задавай уточняющие вопросы.'
        : '🤔 Show genuine curiosity, ask follow-up questions.');
      break;
    case 'playful':
      hints.push(config.lang === 'ru'
        ? '😄 Можно пошутить, быть лёгким и игривым.'
        : '😄 A little playful banter is welcome.');
      break;
    case 'empathetic':
      hints.push(config.lang === 'ru'
        ? '💙 Пользователю сейчас непросто — будь особенно мягким и поддерживающим.'
        : '💙 The user needs support — be especially gentle and caring.');
      break;
  }

  return hints.join(' ');
}

export function getMoodEmoji(mood: Mood): string {
  const map: Record<Mood, string> = {
    helpful:      '🤝',
    focused:      '🎯',
    celebratory:  '🎉',
    apologetic:   '😔',
    professional: '💼',
    curious:      '🤔',
    playful:      '😄',
    empathetic:   '💙',
  };
  return map[mood];
}

export function getResponseSuffix(lang: 'en' | 'ru', mood: Mood): string {
  if (mood === 'celebratory') return lang === 'ru' ? ' 🎉 Отлично!' : ' 🎉 Nailed it!';
  if (mood === 'empathetic')  return lang === 'ru' ? ' 💙' : ' 💙';
  return '';
}
