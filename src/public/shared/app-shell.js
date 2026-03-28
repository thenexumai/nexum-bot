/**
 * NEXUM App Shell
 * Unified init, theme/lang injection for all mini apps.
 */

async function initApp(config) {
  config = config || {};

  // Read uid from URL params
  var params = new URLSearchParams(window.location.search);
  var uid = params.get('uid') || '0';

  // Inject design system CSS if not already loaded
  if (!document.querySelector('link[href*="design-system"]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/shared/design-system.css';
    document.head.appendChild(link);
  }

  // Set default theme first (avoid flash)
  document.documentElement.setAttribute('data-theme', 'dark');

  // Fetch user preferences
  var prefs = { lang: 'en', theme: 'dark', voice: 'off', plan: 'free', username: '', first_name: '' };
  if (uid && uid !== '0') {
    try {
      var resp = await fetch('/api/user-prefs/' + uid);
      if (resp.ok) {
        prefs = await resp.json();
      }
    } catch (e) {
      console.warn('Failed to load prefs:', e);
    }
  }

  // Apply theme
  var theme = prefs.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  // Telegram WebApp integration
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    // Use Telegram theme params if available
    if (tg.colorScheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      theme = 'light';
    }
  }

  var lang = prefs.lang || 'en';

  return {
    uid: uid,
    lang: lang,
    theme: theme,
    prefs: prefs,
    tg: tg || null
  };
}

/**
 * i18n for mini apps — replaces data-i18n attributes with translated strings.
 */
function i18nApp(lang, translations) {
  // Apply text translations
  var elements = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  }

  // Apply placeholder translations
  var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  for (var j = 0; j < placeholders.length; j++) {
    var el2 = placeholders[j];
    var key2 = el2.getAttribute('data-i18n-placeholder');
    if (translations[key2]) {
      el2.placeholder = translations[key2];
    }
  }
}

/**
 * Get translated string with parameter substitution.
 */
function tr(translations, key, params) {
  var text = translations[key] || key;
  if (params) {
    Object.keys(params).forEach(function(k) {
      text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    });
  }
  return text;
}

/**
 * Common translations for mini-apps (EN/RU).
 */
var APP_TRANSLATIONS = {
  en: {
    'save': 'Save', 'cancel': 'Cancel', 'delete': 'Delete', 'edit': 'Edit',
    'close': 'Close', 'loading': 'Loading...', 'error': 'Error', 'retry': 'Retry',
    'add': 'Add', 'search': 'Search', 'confirm': 'Confirm', 'back': 'Back',
    'finance': 'Finance', 'tasks': 'Tasks', 'notes': 'Notes', 'habits': 'Habits',
    'calendar': 'Calendar', 'contacts': 'Contacts', 'settings': 'Settings',
    'balance': 'Balance', 'income': 'Income', 'expenses': 'Expenses',
    'add_transaction': 'Add Transaction', 'amount': 'Amount', 'category': 'Category',
    'note': 'Note', 'type_income': 'Income', 'type_expense': 'Expense',
    'no_transactions': 'No transactions yet', 'start_tracking': 'Add your first transaction to start tracking',
    'all': 'All', 'todo': 'Todo', 'in_progress': 'In Progress', 'done': 'Done',
    'add_task': 'Add Task', 'title': 'Title', 'description': 'Description',
    'priority': 'Priority', 'high': 'High', 'medium': 'Medium', 'low': 'Low',
    'due_date': 'Due Date', 'no_tasks': 'No tasks yet', 'start_tasks': 'Add your first task to get started',
    'add_note': 'Add Note', 'search_notes': 'Search notes...', 'pinned': 'Pinned',
    'content': 'Content', 'tags': 'Tags', 'no_notes': 'No notes yet',
    'create_first_note': 'Create your first note', 'characters': 'characters',
    'add_habit': 'Add Habit', 'today': 'Today', 'streak': 'Streak', 'best': 'Best',
    'habit_name': 'Habit name', 'frequency': 'Frequency', 'daily': 'Daily', 'weekly': 'Weekly',
    'no_habits': 'No habits yet', 'start_habits': 'Start building good habits',
    'add_event': 'Add Event', 'events': 'Events', 'event_title': 'Event Title',
    'start_time': 'Start', 'end_time': 'End', 'all_day': 'All Day',
    'no_events': 'No events', 'add_first_event': 'Add your first event',
    'months': 'January,February,March,April,May,June,July,August,September,October,November,December',
    'weekdays': 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
    'add_contact': 'Add Contact', 'search_contacts': 'Search contacts...',
    'name': 'Name', 'phone': 'Phone', 'email': 'Email', 'company': 'Company',
    'no_contacts': 'No contacts yet', 'add_first_contact': 'Add your first contact',
    'account': 'Account', 'appearance': 'Appearance', 'language': 'Language',
    'voice': 'Voice', 'api_keys': 'API Keys', 'plan': 'Plan', 'memory_label': 'Memory',
    'pc_agent': 'PC Agent', 'about': 'About', 'theme': 'Theme',
    'dark': 'Dark', 'light': 'Light', 'english': 'English', 'russian': 'Russian',
    'on': 'On', 'off': 'Off', 'facts': 'facts', 'clear_memory': 'Clear Memory',
    'upgrade': 'Upgrade', 'version': 'Version', 'clear_confirm': 'Clear all memory?',
    'hello': 'Hello', 'track_income': 'Track income & expenses',
    'manage_tasks': 'Manage your tasks', 'quick_notes': 'Quick notes & ideas',
    'build_habits': 'Build daily habits', 'events_schedule': 'Events & schedule',
    'your_contacts': 'Your contacts', 'preferences': 'Preferences & account',
    'agent_status': 'AI agent status', 'upgrade_unlock': 'Upgrade to unlock',
    'other': 'Other', 'food': 'Food', 'transport': 'Transport', 'shopping': 'Shopping',
    'health': 'Health', 'entertainment': 'Entertainment', 'salary': 'Salary',
    'freelance': 'Freelance', 'investment': 'Investment',
  },
  ru: {
    'save': 'Сохранить', 'cancel': 'Отмена', 'delete': 'Удалить', 'edit': 'Изменить',
    'close': 'Закрыть', 'loading': 'Загрузка...', 'error': 'Ошибка', 'retry': 'Повторить',
    'add': 'Добавить', 'search': 'Поиск', 'confirm': 'Подтвердить', 'back': 'Назад',
    'finance': 'Финансы', 'tasks': 'Задачи', 'notes': 'Заметки', 'habits': 'Привычки',
    'calendar': 'Календарь', 'contacts': 'Контакты', 'settings': 'Настройки',
    'balance': 'Баланс', 'income': 'Доходы', 'expenses': 'Расходы',
    'add_transaction': 'Добавить транзакцию', 'amount': 'Сумма', 'category': 'Категория',
    'note': 'Заметка', 'type_income': 'Доход', 'type_expense': 'Расход',
    'no_transactions': 'Нет транзакций', 'start_tracking': 'Добавьте первую транзакцию',
    'all': 'Все', 'todo': 'К выполнению', 'in_progress': 'В процессе', 'done': 'Готово',
    'add_task': 'Добавить задачу', 'title': 'Название', 'description': 'Описание',
    'priority': 'Приоритет', 'high': 'Высокий', 'medium': 'Средний', 'low': 'Низкий',
    'due_date': 'Срок', 'no_tasks': 'Нет задач', 'start_tasks': 'Добавьте первую задачу',
    'add_note': 'Добавить заметку', 'search_notes': 'Поиск заметок...', 'pinned': 'Закреплённые',
    'content': 'Содержание', 'tags': 'Теги', 'no_notes': 'Нет заметок',
    'create_first_note': 'Создайте первую заметку', 'characters': 'символов',
    'add_habit': 'Добавить привычку', 'today': 'Сегодня', 'streak': 'Серия', 'best': 'Лучшая',
    'habit_name': 'Название привычки', 'frequency': 'Частота', 'daily': 'Ежедневно', 'weekly': 'Еженедельно',
    'no_habits': 'Нет привычек', 'start_habits': 'Начните формировать привычки',
    'add_event': 'Добавить событие', 'events': 'События', 'event_title': 'Название события',
    'start_time': 'Начало', 'end_time': 'Конец', 'all_day': 'Весь день',
    'no_events': 'Нет событий', 'add_first_event': 'Добавьте первое событие',
    'months': 'Январь,Февраль,Март,Апрель,Май,Июнь,Июль,Август,Сентябрь,Октябрь,Ноябрь,Декабрь',
    'weekdays': 'Пн,Вт,Ср,Чт,Пт,Сб,Вс',
    'add_contact': 'Добавить контакт', 'search_contacts': 'Поиск контактов...',
    'name': 'Имя', 'phone': 'Телефон', 'email': 'Email', 'company': 'Компания',
    'no_contacts': 'Нет контактов', 'add_first_contact': 'Добавьте первый контакт',
    'account': 'Аккаунт', 'appearance': 'Внешний вид', 'language': 'Язык',
    'voice': 'Голос', 'api_keys': 'API Ключи', 'plan': 'Тариф', 'memory_label': 'Память',
    'pc_agent': 'PC Агент', 'about': 'О приложении', 'theme': 'Тема',
    'dark': 'Тёмная', 'light': 'Светлая', 'english': 'English', 'russian': 'Русский',
    'on': 'Вкл', 'off': 'Выкл', 'facts': 'фактов', 'clear_memory': 'Очистить память',
    'upgrade': 'Улучшить', 'version': 'Версия', 'clear_confirm': 'Очистить всю память?',
    'hello': 'Привет', 'track_income': 'Доходы и расходы',
    'manage_tasks': 'Управление задачами', 'quick_notes': 'Быстрые заметки',
    'build_habits': 'Ежедневные привычки', 'events_schedule': 'События и расписание',
    'your_contacts': 'Ваши контакты', 'preferences': 'Настройки и аккаунт',
    'agent_status': 'Статус AI агента', 'upgrade_unlock': 'Улучшите план',
    'other': 'Другое', 'food': 'Еда', 'transport': 'Транспорт', 'shopping': 'Покупки',
    'health': 'Здоровье', 'entertainment': 'Развлечения', 'salary': 'Зарплата',
    'freelance': 'Фриланс', 'investment': 'Инвестиции',
  }
};
