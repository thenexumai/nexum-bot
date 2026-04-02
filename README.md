# NEXUM v1.0 - Personal AI Assistant

<div align="center">

![NEXUM](NEXUM%20LOGO.PNG)

**Ваш личный AI-агент с памятью, навыками и самообучением**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://telegram.org/)

</div>

---

## 🌟 Что умеет NEXUM

### 🧠 Интеллект
- **Долгосрочная память** - помнит всё о вас между сессиями
- **Профиль личности** - адаптируется под ваш стиль общения
- **Система навыков** - самообучается на основе решенных задач
- **Knowledge Graph** - хранит важные факты и связи

### 🔍 Возможности
- **Web Search** - поиск актуальной информации в интернете
- **Напоминания** - умные напоминания с автоматическим распознаванием
- **Mini Apps** - задачи, финансы, заметки, календарь, и многое другое
- **PC Agent** - управление вашим компьютером через Telegram

### 🎯 Режимы работы
- **Default** - сбалансированный режим
- **Deep** - глубокий анализ и детальные ответы
- **Brief** - краткие и ёмкие ответы
- **Creative** - креативный подход
- **Code** - специализация на программировании

### 🔄 Самоулучшение
- Автоматический анализ ошибок
- Генерация патчей для исправления
- Эволюция кодовой базы
- Система аппрувов для безопасности

---

## 🚀 Быстрый старт

### 1. Установка

```bash
# Клонируйте проект
cd NEXUM-FINAL

# Установите зависимости
npm install
```

### 2. Настройка

Создайте файл `.env` на основе `env.example`:

```bash
# Основные настройки
BOT_TOKEN=your_telegram_bot_token_from_@BotFather
PORT=3000
WEBAPP_URL=https://your-domain.com

# AI Providers (нужен хотя бы один)
OPENROUTER_API_KEY=your_openrouter_key
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key

# Web Search
BRAVE_API_KEY=your_brave_search_key

# Админы (ваш Telegram User ID)
ADMIN_UIDS=123456789
```

**Как узнать свой Telegram UID?**
Отправьте `/start` боту [@userinfobot](https://t.me/userinfobot)

### 3. Запуск

```bash
# Разработка (с hot-reload)
npm run dev

# Продакшн
npm run build
npm start
```

### 4. Проверка

Откройте Telegram и:
1. Отправьте `/start` вашему боту
2. Нажмите `/` - увидите меню команд
3. Админы увидят дополнительные [ADMIN] команды

---

## 📱 Команды

### Для всех пользователей
- `/start` - главное меню и приветствие
- `/help` - справка по всем командам
- `/status` - ваш статус и статистика
- `/mode` - выбор режима ответов AI
- `/apps` - Mini Apps (веб-приложения)
- `/memory` - просмотр долгосрочной памяти
- `/skills` - список приобретенных навыков
- `/profile` - ваш профиль личности
- `/search <запрос>` - поиск в интернете
- `/remind <текст> через N минут` - установить напоминание
- `/reminders` - список активных напоминаний
- `/new` - начать новую сессию
- `/clear` - очистить историю диалога
- `/tariffs` - информация о тарифах
- `/lang ru|en` - сменить язык интерфейса

### Только для админов
- `/fix` - автоматическое исправление багов
- `/improve` - улучшение кода
- `/patches` - список ожидающих патчей
- `/diag` - диагностика системы
- `/byok` - управление API ключами
- `/link_pc` - подключение PC Agent
- `/pc_status` - статус PC Agent
- `/screenshot` - снимок экрана с ПК
- `/forget` - очистить всю память пользователя

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    TELEGRAM BOT                          │
│                   (handler.ts)                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   AI EXECUTOR                           │
│                  (executor.ts)                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Long-Term    │  │ User Model   │  │ Skill        │ │
│  │ Memory       │  │ (Profile)    │  │ Manager      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Knowledge    │  │ Web Search   │  │ Tools &      │ │
│  │ Graph        │  │              │  │ Capabilities │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              AI PROVIDERS (Router)                       │
│  OpenRouter │ Anthropic │ OpenAI │ Google │ Groq        │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Структура проекта

```
NEXUM-FINAL/
├── src/
│   ├── agent/              # AI движок
│   │   ├── executor.ts     # Главный executor
│   │   ├── router.ts       # Роутинг между AI провайдерами
│   │   ├── tools.ts        # Инструменты для AI
│   │   └── ...
│   │
│   ├── telegram/           # Telegram бот
│   │   ├── handler.ts      # Обработка сообщений
│   │   └── commands/       # Все команды
│   │
│   ├── core/               # Ядро системы
│   │   ├── skills/         # Система навыков
│   │   ├── user_model/     # Профилирование пользователей
│   │   ├── evolution_memory/ # Долгосрочная память
│   │   ├── memory/         # Knowledge Graph
│   │   └── ...
│   │
│   ├── tools/              # Инструменты
│   │   ├── search.ts       # Web поиск
│   │   ├── reminders.ts    # Напоминания
│   │   └── ...
│   │
│   ├── evolution/          # Самоулучшение
│   │   ├── self_improve.ts
│   │   └── improve_tool.ts
│   │
│   ├── public/             # Mini Apps (фронтенд)
│   │   └── index.html      # Веб-приложения
│   │
│   └── index.ts            # Точка входа
│
├── pc_agent/               # PC Agent клиент
├── system/                 # Системные промпты
├── intelligence/           # AI конфигурация
├── NEXUM_FINAL_STATUS.md   # Полная документация
├── QUICK_FIX_GUIDE.md      # Краткое руководство
└── package.json
```

---

## 🗄 База данных

NEXUM использует SQLite для хранения:

### Основные таблицы
- `users` - пользователи
- `chat_history` - история сообщений
- `session_state` - состояния сессий

### Память и интеллект
- `long_term_memory` - долгосрочная память
- `persistent_facts` - важные факты
- `user_insights` - инсайты о пользователях
- `user_profiles` - профили личности
- `skills` - система навыков
- `knowledge_graph` - граф знаний

### Mini Apps
- `tasks`, `finance`, `notes`, `calendar`, `contacts`
- `habits`, `habit_logs`, `goals`, `mood_entries`, `journal`

### Система
- `reminders` - напоминания
- `code_patches` - патчи самоулучшения
- `evolution_logs` - логи эволюции
- `pc_agent_actions` - действия PC агента

---

## 🎯 Тарифные планы

### 🆓 Free
- 50 сообщений/день
- Базовый AI
- Память и задачи

### ⚡ Middle
- 200 сообщений/день
- Все функции Free +
- Напоминания
- Голосовые сообщения
- Mini Apps
- Система навыков

### 💎 Pro
- Без ограничений по сообщениям
- Все функции Middle +
- PC Agent
- Свои API ключи (BYOK)
- Приоритетные модели AI
- Самоулучшение

---

## 🔧 Разработка

### Требования
- Node.js >= 18
- npm >= 9
- SQLite3

### Скрипты
```bash
npm run dev        # Разработка с hot-reload
npm run build      # Сборка проекта
npm start          # Запуск продакшн версии
npm test           # Запуск тестов
```

### Переменные окружения

Полный список в файле `env.example`:

```bash
# Обязательные
BOT_TOKEN=           # Telegram Bot Token
ADMIN_UIDS=          # Telegram User IDs админов (через запятую)

# AI Providers (нужен хотя бы один)
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=

# Опциональные
PORT=3000                              # Порт сервера
WEBAPP_URL=https://your-domain.com     # URL для Mini Apps
BRAVE_API_KEY=                         # Для web search
```

---

## 📚 Документация

- **[NEXUM_FINAL_STATUS.md](./NEXUM_FINAL_STATUS.md)** - полная техническая документация всех систем
- **[QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md)** - краткое руководство по настройке и исправлению проблем

---

## 🐛 Отладка

### Проблемы с запуском?

1. **Проверьте логи при старте:**
```bash
npm start
```

Должны появиться строки:
```
✅ Database ready
✅ Skill + UserModel + LongTermMemory initialized
✅ Background systems started
✅ NEXUM HTTP live → port 3000
✅ Telegram Bot online
```

2. **Команды не работают?**
- Проверьте BOT_TOKEN в .env
- Отправьте `/start` боту снова
- Перезапустите чат с ботом

3. **AI не отвечает?**
- Проверьте что хотя бы один AI provider ключ настроен
- Проверьте логи на ошибки API

4. **Напоминания не приходят?**
- Убедитесь что бот запущен непрерывно
- Проверьте логи: "Reminder cron started"

Подробнее в [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md)

---

## 🤝 Вклад в проект

Этот проект создан для демонстрации возможностей AI-агентов.

### Как помочь:
1. Сообщайте об ошибках через Issues
2. Предлагайте новые функции
3. Улучшайте документацию
4. Делитесь опытом использования

---

## 📄 Лицензия

Этот проект создан в образовательных целях.

---

## 🙏 Благодарности

- [Grammy](https://grammy.dev/) - Telegram Bot Framework
- [Anthropic](https://www.anthropic.com/) - Claude AI
- [OpenRouter](https://openrouter.ai/) - AI Router
- [Brave Search](https://brave.com/search/api/) - Web Search API

---

## 📞 Контакты

- Telegram: @nexum_support (пример)
- Issues: GitHub Issues (если есть репозиторий)

---

<div align="center">

**Создано с ❤️ и AI**

NEXUM v1.0 - Your Personal AI Assistant

</div>
