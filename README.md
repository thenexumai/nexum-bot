# NEXUM v13 — One Bot, Infinite AI

**Decentralized AI Agent Platform for Telegram**

Single bot → Multiple AI providers → User personalization → PC Agent integration

## Status

- ✅ Core infrastructure (AI router, DB, commands)
- ⏳ AI integration (Groq, DeepSeek, Claude, Gemini)
- ⏳ PC Agent pairing
- ⏳ Mini Apps (Finance, Tasks, Notes)

## Архитектура

```
User → Telegram Bot → AI Router (Groq/DeepSeek/Claude/Gemini)
                    → User Database (план, подписка, ключи)
                    → PC Agent (парнинг по коду)
                    → Mini Apps (Finance, Tasks, Notes)
```

## Компоненты

- **NEXUM Bot** — Telegram бот (TypeScript + grammy) ✅
- **AI Router** — выбор модели по стоимости/скорости ✅
- **User DB** — SQLite с подписками и API ключами ✅
- **PC Agent** — парнинг + контроль ПК (в разработке)
- **Mini Apps** — платные приложения (планируется)

## Quick Start

### Local Development

```bash
npm install
cp .env.example .env
# Add your BOT_TOKEN (get from @BotFather on Telegram)
npm run dev
```

### Deployment (Railway)

1. Create Railway project
2. Connect GitHub repo
3. Add `BOT_TOKEN` env variable
4. Deploy

Each user gets:
- Personal AI provider selection
- Custom API key support
- Usage statistics
- PC Agent pairing

## Парнинг PC Agent

```bash
python nexum_agent.py
```

В Telegram: `/link` → получишь код → вставь его агенту.

Готово — PC Agent подключен к боту.

## AI Провайдеры

По умолчанию бот использует **Groq** (бесплатный tier).

Поддерживаемые:
- **Groq** — Llama 3.3 70B (бесплатно)
- **DeepSeek** — дешево ($0.07/1M tokens)
- **Claude Haiku** — быстро ($0.08/1M tokens)
- **Gemini** — с видением (free tier)

Пользователи могут добавить свои ключи:
```
/setkey groq sk-...
/setkey deepseek sk-...
/setkey claude sk-...
```

## Команды

| Команда | Описание |
|---------|---------|
| `/start` | Начало |
| `/help` | Все команды |
| `/plan` | Твой текущий план |
| `/upgrade` | Upgrade to Pro ($5/месяц) |
| `/link` | Привязать PC Agent |
| `/setkey [провайдер] [ключ]` | Добавить API ключ |
| `/status` | Статистика + текущий AI провайдер |

## Команды бота

| Команда | Описание |
|---------|---------|
| `/start` | Приветствие |
| `/help` | Список команд |
| `/apps` | Mini Apps |
| `/website [запрос]` | Создать сайт |
| `/newtool [описание]` | Создать инструмент |
| `/tools` | Мои инструменты |
| `/notes` | Заметки |
| `/tasks` | Задачи |
| `/habits` | Привычки |
| `/finance` | Финансы |
| `/search [запрос]` | Поиск в интернете |
| `/remind [текст]` | Напоминание |
| `/memory` | Что я знаю о тебе |
| `/forget` | Очистить память |
| `/clear` | Очистить историю |
| `/voice` | Голосовой режим |
| `/voices` | Выбор голоса |
| `/setkey [провайдер] [ключ]` | Добавить API ключ |
| `/mykeys` | Мои ключи |
| `/status` | Статистика |
| `/pc` | Статус PC Agent |
| `/link [код]` | Привязать агент |
| `/screenshot` | Скриншот экрана |
| `/run [команда]` | Выполнить команду |
| `/bgrun [команда]` | Фоновый процесс |
| `/bglist` | Фоновые процессы |
| `/sysinfo` | Системная информация |
| `/ps` | Процессы |
| `/kill [имя/pid]` | Убить процесс |
| `/files [op] [path]` | Файловая система |
| `/clipboard` | Буфер обмена |
| `/notify [title\|msg]` | Уведомление |
| `/window [op]` | Управление окнами |
| `/http [METHOD] [url]` | HTTP запрос |
| `/browser [url]` | Открыть браузер |
| `/openapp [имя]` | Открыть приложение |
| `/mouse [action] [x] [y]` | Мышь |
| `/keyboard [текст]` | Набрать текст |
| `/hotkey [combo]` | Горячие клавиши |
| `/network` | Сетевая информация |

## Features

- **Multi-AI Support:** Groq, DeepSeek, Claude, Gemini
- **User Database:** Per-user settings, API keys, subscriptions
- **PC Agent Pairing:** Link your local machine for file/screenshot operations
- **Conversation History:** Persistent memory per user
- **Freemium Model:** Free tier + premium subscriptions
- **Mini Apps:** Expandable ecosystem (Finance, Tasks, Notes, etc.)

## Tech Stack

- **Bot:** TypeScript + grammy
- **Database:** SQLite3
- **Deployment:** Railway/Docker
- **PC Agent:** Python (separate)

## Contributing

Open for contributions. Feature requests & bug reports welcome.

## License

MIT
