/**
 * NEXUM i18n System
 * Full internationalization with EN/RU support.
 * Architecture allows adding more languages later.
 */

import { db } from '../core/db';

export type Lang = 'en' | 'ru';
export type TranslationKey = string;

// ── Translation dictionaries ─────────────────────────────────────────────────

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Welcome & onboarding
    'welcome': 'Hey {name}! I\'m **NEXUM** — your AI assistant.\n\nJust message me anything, or use a command. Type /help to see what I can do.',
    'welcome.anon': 'I\'m **NEXUM** — your AI assistant.\n\nJust message me anything, or /help for commands.',
    'welcome.lang_detected': 'Language set to English.',

    // Help
    'help.title': '*NEXUM Commands*',
    'help.admin': '*Admin:* /admin\\_stats /broadcast /approve',
    'help.group': 'Mention @{username} or reply to me to chat.\n\n/search [query] — web search',

    // Status
    'status.title': '*NEXUM Status*',
    'status.plan': 'Plan: *{plan}* (${price}/mo)',
    'status.messages_today': 'Messages today: {count}',
    'status.total_messages': 'Total messages: {total}',
    'status.memory': 'Memory: {value}',
    'status.memory.facts': '{count} facts',
    'status.memory.locked': 'Middle/Pro',
    'status.mini_apps': 'Mini-apps: {value}',
    'status.byok': 'BYOK: {value}',
    'status.pc_agent': 'PC Agent: {value}',
    'status.pc_online': 'online',
    'status.pc_offline': 'offline',
    'status.providers': 'Providers: {value}',
    'status.admin': 'Admin',
    'status.upgrade': '/tariffs — upgrade',

    // New conversation
    'new.done': 'Fresh start.',

    // Memory
    'memory.title': '*What I remember:*',
    'memory.empty': 'Nothing saved yet. I learn as we talk.',
    'memory.item': '{key}: {value}',

    // Forget
    'forget.done': 'Memory and history cleared. Clean slate.',

    // My stats
    'mystats.title': '*Your Stats*',
    'mystats.messages': 'Messages: {count}',
    'mystats.notes': 'Notes: {count}',
    'mystats.tasks': 'Tasks: {count}',
    'mystats.finance': 'Finance entries: {count}',
    'mystats.habits': 'Habits: {count}',
    'mystats.member_since': 'Member since: {date}',

    // Tariffs
    'tariffs.title': 'NEXUM Plans',
    'tariffs.free.title': '*Free* — $0/mo',
    'tariffs.free.messages': '70 messages/day',
    'tariffs.free.ai': 'Basic AI chat',
    'tariffs.middle.title': '*Middle* — $9/mo',
    'tariffs.middle.messages': '300 messages/day',
    'tariffs.middle.memory': 'Long-term memory',
    'tariffs.middle.apps': 'All mini-apps',
    'tariffs.pro.title': '*Pro* — $15/mo',
    'tariffs.pro.messages': 'Unlimited (BYOK)',
    'tariffs.pro.all': 'Everything in Middle',
    'tariffs.pro.pc': 'PC Agent (remote control)',
    'tariffs.pro.bg': 'Background AI tasks',
    'tariffs.pro.byok': 'Bring your own API keys',
    'tariffs.current': 'You\'re on: *{plan}*',
    'tariffs.upgrade.pro_max': 'You\'re on Pro — all features unlocked.',
    'tariffs.upgrade.middle': 'Upgrade to Pro ($15/mo) for:\n- Unlimited messages (BYOK)\n- PC Agent\n- Background tasks\n\n/tariffs',
    'tariffs.upgrade.free': 'Upgrade to Middle ($9/mo) for memory + mini-apps.\nOr Pro ($15/mo) for everything including PC Agent.\n\n/tariffs',

    // Feature gates
    'feature.needs_middle': '{feature} is available on Middle and Pro plans. /tariffs',
    'feature.needs_pro': '{feature} is a Pro feature. /tariffs',
    'feature.requires': '{feature} requires {plan} plan — /tariffs',

    // Access
    'access.denied': 'You don\'t have access. Contact the admin.',
    'access.not_public': 'This bot is private for now.',

    // Rate limiting
    'rate.limit_reached': 'You\'ve hit your daily limit ({count}/{max} messages).\nUpgrade your plan: /tariffs',

    // Search
    'search.usage': 'Usage: /search [query]',
    'search.unavailable': 'Web search not available — no SERPER_KEY set.',

    // Remind
    'remind.usage': 'Usage: `/remind [text] [minutes]`\nExample: `/remind Call dentist 30`',
    'remind.set': 'Reminder in {minutes} min: _{text}_',

    // Voice
    'voice.off': 'Voice mode off.',
    'voice.on': 'Voice mode on ({voice}).',
    'voice.transcribe_fail': 'Could not transcribe audio. Try again.',

    // BYOK
    'byok.usage': 'Usage: `/setkey [provider] [key]`\n\nProviders: {providers}',
    'byok.unknown_provider': 'Unknown provider. Valid: {providers}',
    'byok.saved': 'Key for *{provider}* saved.',
    'byok.list_title': '*Your API Keys:*',
    'byok.list_empty': 'No API keys saved.\n\nUse `/setkey [provider] [key]` to add one.',
    'byok.item': '{provider}: `{masked}`',

    // PC Agent
    'pc.offline': 'PC Agent is offline. Use /link to connect your computer.',
    'pc.no_device': 'No PC paired yet. Run /link to get a pairing code.',
    'pc.action_blocked': 'Action blocked: {reason}',
    'pc.confirm': '*Confirm action*\n\nAction: `{action}`\nCommand: `{command}`\n\nThis will run on your PC.',
    'pc.link.title': '*Link Your PC*',
    'pc.link.run': 'Run on your computer:',
    'pc.link.expires': 'Code expires in 10 minutes.',
    'pc.devices.title': '*Paired Devices*',
    'pc.devices.empty': 'No devices paired. Use /link to connect your PC.',
    'pc.devices.last_seen': 'Last seen: {date}',
    'pc.status.title': '*PC Agent*',
    'pc.status.connected': 'Connected',
    'pc.status.offline': 'Offline',
    'pc.status.device': 'Device: {name}',
    'pc.status.platform': 'Platform: {platform}',
    'pc.status.last_seen': 'Last seen: {date}',
    'pc.status.actions': 'Available actions: {actions}',
    'pc.run.usage': 'Usage: `/run [shell command]`\nExample: `/run ls -la`',
    'pc.sysinfo.title': '*System Info*',
    'pc.approved': 'Approved. Running...',
    'pc.denied': 'Action denied.',
    'pc.expired': 'Approval request expired.',

    // Background tasks
    'bg.usage': 'Usage: /bgrun [task description]',
    'bg.started': 'Task started.\nID: `{id}`\n\nCheck status: /bglist',
    'bg.title': '*Background Tasks*',
    'bg.empty': 'No background tasks yet. Use /bgrun [task]',

    // Errors
    'error.ai_unavailable': 'All AI providers are unavailable right now. Try again in a minute.',
    'error.generic': 'Something went wrong. Try again.',
    'error.voice_failed': 'Could not transcribe audio. Try again.',
    'photo.default_caption': 'What is in this image?',
    'error.file_types': 'Supported: txt, md, csv, json, js, ts, py, html, css, xml, yaml, sh, log',

    // Status indicators
    'status.thinking': 'Thinking...',
    'status.processing': 'Processing...',
    'status.done': 'Done.',

    // Mini-apps
    'apps.title': '*Mini-Apps*',
    'apps.not_configured': 'Mini-apps not configured (WEBAPP_URL missing).',
    'apps.open': 'Open Apps',
    'apps.finance': 'Finance',
    'apps.tasks': 'Tasks',
    'apps.notes': 'Notes',
    'apps.habits': 'Habits',
    'apps.calendar': 'Calendar',
    'apps.contacts': 'Contacts',
    'apps.agent': 'Agent',
    'apps.home': 'Home',
    'apps.settings': 'Settings',

    // Lang command
    'lang.title': '*Language / Язык*',
    'lang.prompt': 'Choose your language:',
    'lang.set': 'Language set to *English*.',

    // Settings command
    'settings.title': '*Settings*',
    'settings.open': 'Open Settings',

    // Admin
    'admin.stats.title': '*Admin Stats*',
    'admin.stats.users': 'Users: {total} | Active today: {active}',
    'admin.stats.messages': 'Messages: {count}',
    'admin.broadcast.usage': 'Usage: /broadcast [message]',
    'admin.broadcast.done': 'Broadcast done. Sent: {sent}, Failed: {failed}',
    'admin.approve.usage': 'Usage: /approve [user_id] [free|middle|pro]',
    'admin.approve.invalid_uid': 'Invalid user ID.',
    'admin.approve.invalid_plan': 'Invalid plan: free / middle / pro',
    'admin.approve.done': 'User {uid} set to *{plan}*',
    'admin.approve.notify': 'Your NEXUM plan is now *{plan}*. Use /status to see your features.',
    'admin.keys.title': '*System Keys*',

    // Theme
    'theme.title': '*Appearance*',
    'theme.set_dark': 'Theme set to *dark*.',
    'theme.set_light': 'Theme set to *light*.',

    // Confirmation
    'confirm.approve': 'Allow',
    'confirm.deny': 'Deny',
    'confirm.yes': 'Yes',
    'confirm.no': 'No',

    // Mini-app labels (for HTML pages)
    'app.finance.title': 'Finance',
    'app.finance.balance': 'Balance',
    'app.finance.income': 'Income',
    'app.finance.expenses': 'Expenses',
    'app.finance.add': 'Add Transaction',
    'app.finance.amount': 'Amount',
    'app.finance.category': 'Category',
    'app.finance.note': 'Note',
    'app.finance.type.income': 'Income',
    'app.finance.type.expense': 'Expense',
    'app.finance.empty': 'No transactions yet',
    'app.finance.empty.desc': 'Add your first transaction to start tracking',

    'app.tasks.title': 'Tasks',
    'app.tasks.add': 'Add Task',
    'app.tasks.all': 'All',
    'app.tasks.todo': 'Todo',
    'app.tasks.in_progress': 'In Progress',
    'app.tasks.done': 'Done',
    'app.tasks.title_field': 'Title',
    'app.tasks.description': 'Description',
    'app.tasks.priority': 'Priority',
    'app.tasks.priority.high': 'High',
    'app.tasks.priority.medium': 'Medium',
    'app.tasks.priority.low': 'Low',
    'app.tasks.due_date': 'Due Date',
    'app.tasks.empty': 'No tasks yet',
    'app.tasks.empty.desc': 'Add your first task to get started',

    'app.notes.title': 'Notes',
    'app.notes.add': 'Add Note',
    'app.notes.search': 'Search notes...',
    'app.notes.pinned': 'Pinned',
    'app.notes.title_field': 'Title',
    'app.notes.content': 'Content',
    'app.notes.tags': 'Tags',
    'app.notes.empty': 'No notes yet',
    'app.notes.empty.desc': 'Create your first note',
    'app.notes.chars': 'characters',

    'app.habits.title': 'Habits',
    'app.habits.add': 'Add Habit',
    'app.habits.today': 'Today',
    'app.habits.streak': 'Streak',
    'app.habits.best': 'Best',
    'app.habits.name': 'Habit name',
    'app.habits.frequency': 'Frequency',
    'app.habits.frequency.daily': 'Daily',
    'app.habits.frequency.weekly': 'Weekly',
    'app.habits.empty': 'No habits yet',
    'app.habits.empty.desc': 'Start building good habits',

    'app.calendar.title': 'Calendar',
    'app.calendar.add': 'Add Event',
    'app.calendar.today': 'Today',
    'app.calendar.events': 'Events',
    'app.calendar.event_title': 'Event Title',
    'app.calendar.start': 'Start',
    'app.calendar.end': 'End',
    'app.calendar.all_day': 'All Day',
    'app.calendar.empty': 'No events',
    'app.calendar.empty.desc': 'Add your first event',
    'app.calendar.months': 'January,February,March,April,May,June,July,August,September,October,November,December',
    'app.calendar.weekdays': 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',

    'app.contacts.title': 'Contacts',
    'app.contacts.add': 'Add Contact',
    'app.contacts.search': 'Search contacts...',
    'app.contacts.name': 'Name',
    'app.contacts.phone': 'Phone',
    'app.contacts.email': 'Email',
    'app.contacts.company': 'Company',
    'app.contacts.notes': 'Notes',
    'app.contacts.empty': 'No contacts yet',
    'app.contacts.empty.desc': 'Add your first contact',

    'app.settings.title': 'Settings',
    'app.settings.account': 'Account',
    'app.settings.appearance': 'Appearance',
    'app.settings.language': 'Language',
    'app.settings.voice': 'Voice',
    'app.settings.api_keys': 'API Keys',
    'app.settings.plan': 'Plan',
    'app.settings.memory': 'Memory',
    'app.settings.pc_agent': 'PC Agent',
    'app.settings.about': 'About',
    'app.settings.theme': 'Theme',
    'app.settings.theme.dark': 'Dark',
    'app.settings.theme.light': 'Light',
    'app.settings.lang.en': 'English',
    'app.settings.lang.ru': 'Russian',
    'app.settings.voice.on': 'On',
    'app.settings.voice.off': 'Off',
    'app.settings.memory.facts': '{count} facts',
    'app.settings.memory.clear': 'Clear Memory',
    'app.settings.plan.upgrade': 'Upgrade',
    'app.settings.version': 'Version',
    'app.settings.clear_confirm': 'Clear all memory?',

    'app.home.title': 'NEXUM',
    'app.home.greeting': 'Hello, {name}!',
    'app.home.greeting.anon': 'Hello!',
    'app.home.finance.desc': 'Track income & expenses',
    'app.home.tasks.desc': 'Manage your tasks',
    'app.home.notes.desc': 'Quick notes & ideas',
    'app.home.habits.desc': 'Build daily habits',
    'app.home.calendar.desc': 'Events & schedule',
    'app.home.contacts.desc': 'Your contacts',
    'app.home.settings.desc': 'Preferences & account',
    'app.home.agent.desc': 'AI agent status',
    'app.home.locked': 'Upgrade to unlock',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.retry': 'Retry',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.none': 'none',
  },

  ru: {
    // Welcome & onboarding
    'welcome': 'Привет, {name}! Я **NEXUM** — твой AI-ассистент.\n\nПросто напиши мне что угодно, или используй команду. Набери /help для списка команд.',
    'welcome.anon': 'Я **NEXUM** — твой AI-ассистент.\n\nПросто напиши мне что угодно, или /help для команд.',
    'welcome.lang_detected': 'Язык установлен: Русский.',

    // Help
    'help.title': '*Команды NEXUM*',
    'help.admin': '*Админ:* /admin\\_stats /broadcast /approve',
    'help.group': 'Упомяни @{username} или ответь на моё сообщение.\n\n/search [запрос] — веб-поиск',

    // Status
    'status.title': '*Статус NEXUM*',
    'status.plan': 'План: *{plan}* (${price}/мес)',
    'status.messages_today': 'Сообщений сегодня: {count}',
    'status.total_messages': 'Всего сообщений: {total}',
    'status.memory': 'Память: {value}',
    'status.memory.facts': '{count} фактов',
    'status.memory.locked': 'Middle/Pro',
    'status.mini_apps': 'Мини-приложения: {value}',
    'status.byok': 'BYOK: {value}',
    'status.pc_agent': 'PC Агент: {value}',
    'status.pc_online': 'онлайн',
    'status.pc_offline': 'оффлайн',
    'status.providers': 'Провайдеры: {value}',
    'status.admin': 'Админ',
    'status.upgrade': '/tariffs — улучшить',

    // New conversation
    'new.done': 'Начинаем с чистого листа.',

    // Memory
    'memory.title': '*Что я помню:*',
    'memory.empty': 'Пока ничего не сохранено. Я учусь в процессе общения.',
    'memory.item': '{key}: {value}',

    // Forget
    'forget.done': 'Память и история очищены. Чистый лист.',

    // My stats
    'mystats.title': '*Ваша статистика*',
    'mystats.messages': 'Сообщений: {count}',
    'mystats.notes': 'Заметок: {count}',
    'mystats.tasks': 'Задач: {count}',
    'mystats.finance': 'Финансовых записей: {count}',
    'mystats.habits': 'Привычек: {count}',
    'mystats.member_since': 'Участник с: {date}',

    // Tariffs
    'tariffs.title': 'Тарифы NEXUM',
    'tariffs.free.title': '*Free* — $0/мес',
    'tariffs.free.messages': '70 сообщений/день',
    'tariffs.free.ai': 'Базовый AI чат',
    'tariffs.middle.title': '*Middle* — $9/мес',
    'tariffs.middle.messages': '300 сообщений/день',
    'tariffs.middle.memory': 'Долгосрочная память',
    'tariffs.middle.apps': 'Все мини-приложения',
    'tariffs.pro.title': '*Pro* — $15/мес',
    'tariffs.pro.messages': 'Безлимит (BYOK)',
    'tariffs.pro.all': 'Всё из Middle',
    'tariffs.pro.pc': 'PC Агент (удалённое управление)',
    'tariffs.pro.bg': 'Фоновые AI задачи',
    'tariffs.pro.byok': 'Свои API ключи',
    'tariffs.current': 'Ваш план: *{plan}*',
    'tariffs.upgrade.pro_max': 'У вас Pro — все функции разблокированы.',
    'tariffs.upgrade.middle': 'Перейдите на Pro ($15/мес) для:\n- Безлимитные сообщения (BYOK)\n- PC Агент\n- Фоновые задачи\n\n/tariffs',
    'tariffs.upgrade.free': 'Перейдите на Middle ($9/мес) для памяти + мини-приложений.\nИли Pro ($15/мес) для всего, включая PC Агент.\n\n/tariffs',

    // Feature gates
    'feature.needs_middle': '{feature} доступно на тарифах Middle и Pro. /tariffs',
    'feature.needs_pro': '{feature} — функция Pro. /tariffs',
    'feature.requires': '{feature} требует тариф {plan} — /tariffs',

    // Access
    'access.denied': 'У вас нет доступа. Свяжитесь с администратором.',
    'access.not_public': 'Этот бот пока приватный.',

    // Rate limiting
    'rate.limit_reached': 'Вы достигли дневного лимита ({count}/{max} сообщений).\nУлучшите план: /tariffs',

    // Search
    'search.usage': 'Использование: /search [запрос]',
    'search.unavailable': 'Веб-поиск недоступен — нет SERPER_KEY.',

    // Remind
    'remind.usage': 'Использование: `/remind [текст] [минуты]`\nПример: `/remind Позвонить врачу 30`',
    'remind.set': 'Напоминание через {minutes} мин: _{text}_',

    // Voice
    'voice.off': 'Голосовой режим выключен.',
    'voice.on': 'Голосовой режим включён ({voice}).',
    'voice.transcribe_fail': 'Не удалось распознать аудио. Попробуйте ещё раз.',

    // BYOK
    'byok.usage': 'Использование: `/setkey [провайдер] [ключ]`\n\nПровайдеры: {providers}',
    'byok.unknown_provider': 'Неизвестный провайдер. Доступные: {providers}',
    'byok.saved': 'Ключ для *{provider}* сохранён.',
    'byok.list_title': '*Ваши API ключи:*',
    'byok.list_empty': 'Нет сохранённых ключей.\n\nИспользуйте `/setkey [провайдер] [ключ]` для добавления.',
    'byok.item': '{provider}: `{masked}`',

    // PC Agent
    'pc.offline': 'PC Агент оффлайн. Используйте /link для подключения компьютера.',
    'pc.no_device': 'Нет подключённого ПК. Используйте /link для получения кода.',
    'pc.action_blocked': 'Действие заблокировано: {reason}',
    'pc.confirm': '*Подтвердите действие*\n\nДействие: `{action}`\nКоманда: `{command}`\n\nЭто выполнится на вашем ПК.',
    'pc.link.title': '*Подключение ПК*',
    'pc.link.run': 'Запустите на компьютере:',
    'pc.link.expires': 'Код действует 10 минут.',
    'pc.devices.title': '*Подключённые устройства*',
    'pc.devices.empty': 'Нет подключённых устройств. Используйте /link.',
    'pc.devices.last_seen': 'Последний раз: {date}',
    'pc.status.title': '*PC Агент*',
    'pc.status.connected': 'Подключён',
    'pc.status.offline': 'Оффлайн',
    'pc.status.device': 'Устройство: {name}',
    'pc.status.platform': 'Платформа: {platform}',
    'pc.status.last_seen': 'Последний раз: {date}',
    'pc.status.actions': 'Доступные действия: {actions}',
    'pc.run.usage': 'Использование: `/run [команда]`\nПример: `/run ls -la`',
    'pc.sysinfo.title': '*Системная информация*',
    'pc.approved': 'Одобрено. Выполняется...',
    'pc.denied': 'Действие отклонено.',
    'pc.expired': 'Запрос на подтверждение истёк.',

    // Background tasks
    'bg.usage': 'Использование: /bgrun [описание задачи]',
    'bg.started': 'Задача запущена.\nID: `{id}`\n\nСтатус: /bglist',
    'bg.title': '*Фоновые задачи*',
    'bg.empty': 'Нет фоновых задач. Используйте /bgrun [задача]',

    // Errors
    'error.ai_unavailable': 'Все AI провайдеры недоступны. Попробуйте через минуту.',
    'error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
    'error.voice_failed': 'Не удалось распознать голос. Попробуй ещё раз.',
    'photo.default_caption': 'Что на этом изображении?',
    'error.file_types': 'Поддерживается: txt, md, csv, json, js, ts, py, html, css, xml, yaml, sh, log',

    // Status indicators
    'status.thinking': 'Думаю...',
    'status.processing': 'Обработка...',
    'status.done': 'Готово.',

    // Mini-apps
    'apps.title': '*Мини-приложения*',
    'apps.not_configured': 'Мини-приложения не настроены (нет WEBAPP_URL).',
    'apps.open': 'Открыть приложения',
    'apps.finance': 'Финансы',
    'apps.tasks': 'Задачи',
    'apps.notes': 'Заметки',
    'apps.habits': 'Привычки',
    'apps.calendar': 'Календарь',
    'apps.contacts': 'Контакты',
    'apps.agent': 'Агент',
    'apps.home': 'Главная',
    'apps.settings': 'Настройки',

    // Lang command
    'lang.title': '*Language / Язык*',
    'lang.prompt': 'Выберите язык:',
    'lang.set': 'Язык установлен: *Русский*.',

    // Settings command
    'settings.title': '*Настройки*',
    'settings.open': 'Открыть настройки',

    // Admin
    'admin.stats.title': '*Статистика админа*',
    'admin.stats.users': 'Пользователи: {total} | Активных сегодня: {active}',
    'admin.stats.messages': 'Сообщений: {count}',
    'admin.broadcast.usage': 'Использование: /broadcast [сообщение]',
    'admin.broadcast.done': 'Рассылка завершена. Отправлено: {sent}, Ошибок: {failed}',
    'admin.approve.usage': 'Использование: /approve [user_id] [free|middle|pro]',
    'admin.approve.invalid_uid': 'Неверный ID пользователя.',
    'admin.approve.invalid_plan': 'Неверный план: free / middle / pro',
    'admin.approve.done': 'Пользователь {uid} переведён на *{plan}*',
    'admin.approve.notify': 'Ваш план NEXUM теперь *{plan}*. Используйте /status для просмотра.',
    'admin.keys.title': '*Системные ключи*',

    // Theme
    'theme.title': '*Внешний вид*',
    'theme.set_dark': 'Тема: *тёмная*.',
    'theme.set_light': 'Тема: *светлая*.',

    // Confirmation
    'confirm.approve': 'Разрешить',
    'confirm.deny': 'Запретить',
    'confirm.yes': 'Да',
    'confirm.no': 'Нет',

    // Mini-app labels (for HTML pages)
    'app.finance.title': 'Финансы',
    'app.finance.balance': 'Баланс',
    'app.finance.income': 'Доходы',
    'app.finance.expenses': 'Расходы',
    'app.finance.add': 'Добавить транзакцию',
    'app.finance.amount': 'Сумма',
    'app.finance.category': 'Категория',
    'app.finance.note': 'Заметка',
    'app.finance.type.income': 'Доход',
    'app.finance.type.expense': 'Расход',
    'app.finance.empty': 'Нет транзакций',
    'app.finance.empty.desc': 'Добавьте первую транзакцию',

    'app.tasks.title': 'Задачи',
    'app.tasks.add': 'Добавить задачу',
    'app.tasks.all': 'Все',
    'app.tasks.todo': 'К выполнению',
    'app.tasks.in_progress': 'В процессе',
    'app.tasks.done': 'Готово',
    'app.tasks.title_field': 'Название',
    'app.tasks.description': 'Описание',
    'app.tasks.priority': 'Приоритет',
    'app.tasks.priority.high': 'Высокий',
    'app.tasks.priority.medium': 'Средний',
    'app.tasks.priority.low': 'Низкий',
    'app.tasks.due_date': 'Срок',
    'app.tasks.empty': 'Нет задач',
    'app.tasks.empty.desc': 'Добавьте первую задачу',

    'app.notes.title': 'Заметки',
    'app.notes.add': 'Добавить заметку',
    'app.notes.search': 'Поиск заметок...',
    'app.notes.pinned': 'Закреплённые',
    'app.notes.title_field': 'Заголовок',
    'app.notes.content': 'Содержание',
    'app.notes.tags': 'Теги',
    'app.notes.empty': 'Нет заметок',
    'app.notes.empty.desc': 'Создайте первую заметку',
    'app.notes.chars': 'символов',

    'app.habits.title': 'Привычки',
    'app.habits.add': 'Добавить привычку',
    'app.habits.today': 'Сегодня',
    'app.habits.streak': 'Серия',
    'app.habits.best': 'Лучшая',
    'app.habits.name': 'Название привычки',
    'app.habits.frequency': 'Частота',
    'app.habits.frequency.daily': 'Ежедневно',
    'app.habits.frequency.weekly': 'Еженедельно',
    'app.habits.empty': 'Нет привычек',
    'app.habits.empty.desc': 'Начните формировать полезные привычки',

    'app.calendar.title': 'Календарь',
    'app.calendar.add': 'Добавить событие',
    'app.calendar.today': 'Сегодня',
    'app.calendar.events': 'События',
    'app.calendar.event_title': 'Название события',
    'app.calendar.start': 'Начало',
    'app.calendar.end': 'Конец',
    'app.calendar.all_day': 'Весь день',
    'app.calendar.empty': 'Нет событий',
    'app.calendar.empty.desc': 'Добавьте первое событие',
    'app.calendar.months': 'Январь,Февраль,Март,Апрель,Май,Июнь,Июль,Август,Сентябрь,Октябрь,Ноябрь,Декабрь',
    'app.calendar.weekdays': 'Пн,Вт,Ср,Чт,Пт,Сб,Вс',

    'app.contacts.title': 'Контакты',
    'app.contacts.add': 'Добавить контакт',
    'app.contacts.search': 'Поиск контактов...',
    'app.contacts.name': 'Имя',
    'app.contacts.phone': 'Телефон',
    'app.contacts.email': 'Email',
    'app.contacts.company': 'Компания',
    'app.contacts.notes': 'Заметки',
    'app.contacts.empty': 'Нет контактов',
    'app.contacts.empty.desc': 'Добавьте первый контакт',

    'app.settings.title': 'Настройки',
    'app.settings.account': 'Аккаунт',
    'app.settings.appearance': 'Внешний вид',
    'app.settings.language': 'Язык',
    'app.settings.voice': 'Голос',
    'app.settings.api_keys': 'API Ключи',
    'app.settings.plan': 'Тариф',
    'app.settings.memory': 'Память',
    'app.settings.pc_agent': 'PC Агент',
    'app.settings.about': 'О приложении',
    'app.settings.theme': 'Тема',
    'app.settings.theme.dark': 'Тёмная',
    'app.settings.theme.light': 'Светлая',
    'app.settings.lang.en': 'English',
    'app.settings.lang.ru': 'Русский',
    'app.settings.voice.on': 'Вкл',
    'app.settings.voice.off': 'Выкл',
    'app.settings.memory.facts': '{count} фактов',
    'app.settings.memory.clear': 'Очистить память',
    'app.settings.plan.upgrade': 'Улучшить',
    'app.settings.version': 'Версия',
    'app.settings.clear_confirm': 'Очистить всю память?',

    'app.home.title': 'NEXUM',
    'app.home.greeting': 'Привет, {name}!',
    'app.home.greeting.anon': 'Привет!',
    'app.home.finance.desc': 'Доходы и расходы',
    'app.home.tasks.desc': 'Управление задачами',
    'app.home.notes.desc': 'Быстрые заметки',
    'app.home.habits.desc': 'Ежедневные привычки',
    'app.home.calendar.desc': 'События и расписание',
    'app.home.contacts.desc': 'Ваши контакты',
    'app.home.settings.desc': 'Настройки и аккаунт',
    'app.home.agent.desc': 'Статус AI агента',
    'app.home.locked': 'Улучшите план',

    // Common
    'common.save': 'Сохранить',
    'common.cancel': 'Отмена',
    'common.delete': 'Удалить',
    'common.edit': 'Изменить',
    'common.close': 'Закрыть',
    'common.loading': 'Загрузка...',
    'common.error': 'Ошибка',
    'common.retry': 'Повторить',
    'common.confirm': 'Подтвердить',
    'common.back': 'Назад',
    'common.add': 'Добавить',
    'common.search': 'Поиск',
    'common.none': 'нет',
  },
};

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Translate a key for a given user.
 * Looks up user language from DB, falls back to EN.
 */
export function t(uid: number, key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = getUserLang(uid);
  return tLang(lang, key, params);
}

/**
 * Translate by language directly (no DB lookup).
 */
export function tLang(lang: Lang, key: TranslationKey, params?: Record<string, string | number>): string {
  let text = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/**
 * Get all translations for a language (used by mini-apps).
 */
export function getTranslations(lang: Lang): Record<string, string> {
  return { ...translations.en, ...translations[lang] };
}

// ── Language detection ───────────────────────────────────────────────────────

const CYRILLIC_RE = /[\u0400-\u04FF]/;

/**
 * Detect language from Telegram context.
 * Priority: 1) saved user pref 2) Telegram language_code 3) message text analysis
 */
export function detectLang(ctx: { from?: { language_code?: string; id?: number }; message?: { text?: string } }): Lang {
  // Check saved preference first
  if (ctx.from?.id) {
    const saved = getUserLang(ctx.from.id);
    if (saved !== 'en') return saved; // Only skip default
  }

  // Telegram language_code
  const tgLang = ctx.from?.language_code?.toLowerCase();
  if (tgLang === 'ru' || tgLang === 'uk' || tgLang === 'be' || tgLang === 'kk') return 'ru';

  // Message text analysis
  const text = ctx.message?.text ?? '';
  if (CYRILLIC_RE.test(text)) return 'ru';

  return 'en';
}

// ── User language persistence ────────────────────────────────────────────────

const langCache = new Map<number, Lang>();

export function getUserLang(uid: number): Lang {
  const cached = langCache.get(uid);
  if (cached) return cached;

  const row = db.prepare(`SELECT value FROM memory WHERE uid=? AND key='__pref_lang'`).get(uid) as { value: string } | undefined;
  const lang = (row?.value === 'ru' ? 'ru' : 'en') as Lang;
  langCache.set(uid, lang);
  return lang;
}

export function setUserLang(uid: number, lang: Lang): void {
  db.prepare(`
    INSERT INTO memory (uid, key, value, updated_at) VALUES (?, '__pref_lang', ?, datetime('now'))
    ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(uid, lang);
  langCache.set(uid, lang);

  // Also update users table lang field
  db.prepare(`UPDATE users SET lang=? WHERE uid=?`).run(lang, uid);
}
