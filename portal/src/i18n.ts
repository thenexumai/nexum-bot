export type Language = 'ru' | 'uz' | 'en'

export interface LangMeta {
  id: Language
  label: string
  native: string
  flag: string
}

export const LANGUAGES: LangMeta[] = [
  { id: 'ru', label: 'Русский',  native: 'Русский',  flag: '🇷🇺' },
  { id: 'uz', label: "O'zbek",   native: "O'zbekcha",flag: '🇺🇿' },
  { id: 'en', label: 'English',  native: 'English',  flag: '🇺🇸' },
]

const STRINGS: Record<Language, Record<string, string>> = {
  ru: {
    // Nav
    chat: 'Чат', discover: 'Обзор', library: 'Библиотека', settings: 'Настройки',
    mini_apps: 'Мини-приложения', new_chat: 'Новый чат', recent: 'Недавние',
    pc_connected: 'ПК подключён', pc_offline: 'ПК офлайн',

    // Chat
    ask_anything: 'Спросите что угодно…',
    thinking: 'NEXUM думает…',
    copied: 'Скопировано',
    disclaimer: 'NEXUM AI может ошибаться. Проверяйте важную информацию.',
    search_web: 'Поиск в сети',
    write_code: 'Написать код',
    analyze: 'Анализ',
    reasoning: 'Рассуждение',
    search_web_sub: 'Реальные результаты из интернета',
    write_code_sub: 'Напишу код на любом языке',
    analyze_sub: 'Анализирую данные и тексты',
    reasoning_sub: 'Пошаговое логическое мышление',

    // Welcome
    welcome_title: 'Чем могу помочь?',
    welcome_sub: 'NEXUM AI — ваш умный ассистент',

    // Settings
    profile: 'Профиль', appearance: 'Оформление', language: 'Язык',
    models: 'Модели', api_keys: 'API ключи', privacy: 'Конфиденциальность',
    name: 'Имя', email: 'Email', save: 'Сохранить', saved: 'Сохранено',
    theme: 'Тема', dark: 'Тёмная', light: 'Светлая', system: 'Системная',
    save_history: 'Сохранять историю чатов',
    share_data: 'Делиться данными для улучшения',
    analytics: 'Аналитика использования',

    // Discover
    discover_sub: 'Актуальные темы и тренды',
    search_placeholder: 'Поиск тем…',
    all: 'Все', trending: 'В тренде', world: 'Мир', code: 'Код',
    science: 'Наука', education: 'Образование', business: 'Бизнес',

    // Library
    library_sub: 'Все ваши разговоры',
    messages: 'сообщ.',
    empty_library: 'Нет сохранённых чатов',
    empty_library_sub: 'Начните разговор — он появится здесь',

    // Mini apps
    tasks: 'Задачи', finance: 'Финансы', notes: 'Заметки',
    habits: 'Привычки', calendar: 'Календарь', contacts: 'Контакты',
  },
  uz: {
    chat: 'Chat', discover: "Ko'rish", library: 'Kutubxona', settings: 'Sozlamalar',
    mini_apps: 'Mini ilovalar', new_chat: 'Yangi chat', recent: 'Oxirgi',
    pc_connected: "Kompyuter ulangan", pc_offline: "Kompyuter offlayn",
    ask_anything: 'Xohlagan narsani so\'rang…',
    thinking: 'NEXUM o\'ylayapti…', copied: 'Nusxalandi',
    disclaimer: 'NEXUM AI xato qilishi mumkin.',
    search_web: 'Internetda qidirish', write_code: 'Kod yozish',
    analyze: 'Tahlil', reasoning: 'Mantiq',
    search_web_sub: 'Real internetdan natijalar',
    write_code_sub: 'Har qanday tilda kod',
    analyze_sub: 'Ma\'lumot va matn tahlili',
    reasoning_sub: 'Bosqichma-bosqich fikrlash',
    welcome_title: 'Qanday yordam bera olaman?',
    welcome_sub: 'NEXUM AI — aqlli yordamchingiz',
    profile: 'Profil', appearance: 'Ko\'rinish', language: 'Til',
    models: 'Modellar', api_keys: 'API kalitlar', privacy: 'Maxfiylik',
    name: 'Ism', email: 'Email', save: 'Saqlash', saved: 'Saqlandi',
    theme: 'Mavzu', dark: 'Qora', light: 'Oq', system: 'Tizim',
    save_history: 'Chat tarixini saqlash',
    share_data: 'Ma\'lumotlarni ulashish',
    analytics: 'Foydalanish analitikasi',
    discover_sub: 'Dolzarb mavzular va trendlar',
    search_placeholder: 'Mavzu qidirish…',
    all: 'Hammasi', trending: 'Trend', world: 'Dunyo', code: 'Kod',
    science: 'Fan', education: 'Ta\'lim', business: 'Biznes',
    library_sub: 'Barcha suhbatlaringiz',
    messages: 'xabar', empty_library: 'Saqlangan chatlar yo\'q',
    empty_library_sub: 'Suhbat boshlang — bu yerda paydo bo\'ladi',
    tasks: 'Vazifalar', finance: 'Moliya', notes: 'Eslatmalar',
    habits: 'Odatlar', calendar: 'Taqvim', contacts: 'Kontaktlar',
  },
  en: {
    chat: 'Chat', discover: 'Discover', library: 'Library', settings: 'Settings',
    mini_apps: 'Mini Apps', new_chat: 'New Chat', recent: 'Recent',
    pc_connected: 'PC Connected', pc_offline: 'PC Offline',
    ask_anything: 'Ask anything…', thinking: 'NEXUM is thinking…',
    copied: 'Copied', disclaimer: 'NEXUM AI can make mistakes. Verify important info.',
    search_web: 'Search Web', write_code: 'Write Code',
    analyze: 'Analyze', reasoning: 'Reasoning',
    search_web_sub: 'Real results from the internet',
    write_code_sub: 'Code in any language',
    analyze_sub: 'Analyze data and text',
    reasoning_sub: 'Step-by-step logical thinking',
    welcome_title: 'How can I help?',
    welcome_sub: 'NEXUM AI — your intelligent assistant',
    profile: 'Profile', appearance: 'Appearance', language: 'Language',
    models: 'Models', api_keys: 'API Keys', privacy: 'Privacy',
    name: 'Name', email: 'Email', save: 'Save', saved: 'Saved',
    theme: 'Theme', dark: 'Dark', light: 'Light', system: 'System',
    save_history: 'Save chat history',
    share_data: 'Share data to improve',
    analytics: 'Usage analytics',
    discover_sub: 'Trending topics and news',
    search_placeholder: 'Search topics…',
    all: 'All', trending: 'Trending', world: 'World', code: 'Code',
    science: 'Science', education: 'Education', business: 'Business',
    library_sub: 'All your conversations',
    messages: 'msgs', empty_library: 'No saved chats',
    empty_library_sub: 'Start a conversation — it will appear here',
    tasks: 'Tasks', finance: 'Finance', notes: 'Notes',
    habits: 'Habits', calendar: 'Calendar', contacts: 'Contacts',
  },
}

export function t(lang: Language, key: string): string {
  return STRINGS[lang]?.[key] ?? STRINGS['en']?.[key] ?? key
}
