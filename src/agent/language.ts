// Language Detection — определяет язык пользователя и отвечает на том же языке

export type Language = 'ru' | 'en' | 'uz' | 'unknown';

// Простые эвристики для быстрой детекции
const LANG_PATTERNS: Record<Language, RegExp[]> = {
  ru: [
    /[а-яё]/i,
    /(привет|здравствуй|добрый|день|вечер|утро|пока|спасибо|пожалуйста|да|нет|хорошо|конечно|что|как|где|когда|почему|зачем|кто|чем|куда|откуда)/i,
    /(ты|тысяч|тебя|тебе|тобой|твой|твоя|твоё|твои)/i,
    /(я|меня|мне|мной|моё|моя|мои|мой)/i,
    /(не|ни|нет|нельзя|не надо|не нужно)/i,
  ],
  en: [
    /[a-z]{3,}/i,
    /(hello|hi|hey|good|morning|afternoon|evening|bye|thanks|thank|please|yes|no|ok|okay|what|how|where|when|why|who|which)/i,
    /(you|your|yours|youre)/i,
    /(i|me|my|mine|im|ill)/i,
    /(not|no|never|nothing|nobody|nowhere)/i,
  ],
  uz: [
    /[a-z]{3,}/i,
    /(salom|alaykum|xayr|rahmat|iltimos|ha|yoq|yaxshi|nima|qanday|qayerda|qachon|nega|kim|uchun)/i,
    /(sen|siz|sening|seni|senga|sendan|bilan|uchun|haqida)/i,
    /(men|meni|menga|mendan|men bilan)/i,
    /(emas|yoq|hech|hech narsa|hech kim)/i,
  ],
  unknown: [],
};

// Словарь стоп-слов для каждого языка
const STOP_WORDS: Record<Language, string[]> = {
  ru: ['и', 'в', 'на', 'с', 'к', 'по', 'о', 'об', 'а', 'но', 'же', 'ли', 'бы', 'что', 'это', 'так', 'там', 'тут', 'как', 'где', 'когда', 'кто', 'чем', 'куда', 'откуда', 'почему', 'зачем'],
  en: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'],
  uz: ['va', 'yoki', 'lekin', 'agar', 'chunki', 'uchun', 'haqida', 'bilan', 'dan', 'ga', 'da', 'ni', 'bu', 'shu', 'u', 'biz', 'siz', 'ular', 'men', 'sen', 'nima', 'qayerda', 'qachon', 'kim', 'qanday', 'nega'],
  unknown: [],
};

export function detectLanguage(text: string): Language {
  if (!text || text.trim().length === 0) return 'unknown';

  const lower = text.toLowerCase();
  const scores: Record<Language, number> = { ru: 0, en: 0, uz: 0, unknown: 0 };

  // Паттерны
  for (const [lang, patterns] of Object.entries(LANG_PATTERNS) as Array<[Language, RegExp[]]>) {
    for (const pattern of patterns) {
      const matches = lower.match(pattern);
      if (matches) {
        scores[lang] += matches.length;
      }
    }
  }

  // Стоп-слова
  for (const [lang, words] of Object.entries(STOP_WORDS) as Array<[Language, string[]]>) {
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) {
        scores[lang] += matches.length * 0.5;
      }
    }
  }

  // Кириллица сильно указывает на русский
  const cyrillic = (text.match(/[а-яё]/gi) || []).length;
  if (cyrillic > 3) {
    scores.ru += 5;
  }

  // Латиница для английского/узбекского
  const latin = (text.match(/[a-z]/gi) || []).length;
  if (latin > 10 && scores.en === scores.uz) {
    // Если латиница но нет узбекских паттернов — скорее всего английский
    const uzPatterns = LANG_PATTERNS.uz.some(p => p.test(lower));
    if (!uzPatterns) {
      scores.en += 2;
    }
  }

  // Находим максимальный
  let maxScore = 0;
  let detected: Language = 'unknown';
  for (const [lang, score] of Object.entries(scores) as Array<[Language, number]>) {
    if (score > maxScore) {
      maxScore = score;
      detected = lang;
    }
  }

  // Минимальный порог уверенности
  if (maxScore < 2) return 'unknown';

  return detected;
}

export function getLanguageName(lang: Language): string {
  switch (lang) {
    case 'ru': return 'Russian';
    case 'en': return 'English';
    case 'uz': return 'Uzbek';
    default: return 'Unknown';
  }
}

export function getSystemPromptPrefix(lang: Language): string {
  switch (lang) {
    case 'ru':
      return 'Отвечай ТОЛЬКО на русском языке. Если пользователь пишет на русском — отвечай на русском. Никогда не переключайся на английский или другой язык.';
    case 'en':
      return 'Respond ONLY in English. If the user writes in English — respond in English. Never switch to Russian or another language.';
    case 'uz':
      return 'Faqat o\'zbek tilida javob bering. Agar foydalanuvchi o\'zbek tilida yozsa — o\'zbek tilida javob bering. Hech qachon rus yoki boshqa tilga o\'tmang.';
    default:
      return 'Respond in the same language the user is writing in.';
  }
}
