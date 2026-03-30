# NEXUM — Часть 1: Критические фиксы

## Что исправлено

### 🐛 Баг #1: Circular self-import (КРИТИЧЕСКИЙ)
**Файл:** `src/index.ts`
**Проблема:** `import { bot } from './index'` — файл импортирует сам себя. Бот никогда не создавался.
**Исправление:** `bot = new Bot(CONFIG.TELEGRAM_TOKEN)` создаётся прямо в `index.ts` и экспортируется.

### 🐛 Баг #2: Несовпадение имён ENV переменных
**Файл:** `src/core/config.ts` + `.env.example`
**Проблема:** `.env.example` использует `BOT_TOKEN`, но config.ts искал `TELEGRAM_TOKEN`.
**Исправление:** `config.ts` теперь принимает оба: `BOT_TOKEN || TELEGRAM_TOKEN`.

### 🔒 Баг #3: WebSocket без авторизации (БЕЗОПАСНОСТЬ)
**Файл:** `src/index.ts` (WebSocket handler)
**Проблема:** Любой мог подключиться с любым `uid` — полный контроль чужим ПК.
**Исправление:** Добавлена система one-time токенов через `/link_pc`:
- `/link_pc` генерирует токен → агент подключается с этим токеном → токен удаляется

### ✨ Добавлено: `src/telegram/commands/pc_agent.ts`
- `/link_pc` — генерация токена, инструкция запуска
- `/pc_status` — проверка подключения
- `/screenshot` — снимок экрана через агент

## Как установить

```bash
# 1. Скопируй файлы в проект:
cp src/index.ts → nexum-bot/src/index.ts
cp src/core/config.ts → nexum-bot/src/core/config.ts
cp src/telegram/commands/pc_agent.ts → nexum-bot/src/telegram/commands/pc_agent.ts
cp src/telegram/commands/index.ts → nexum-bot/src/telegram/commands/index.ts
cp .env.example → nexum-bot/.env.example

# 2. Добавь в .env свои ключи

# 3. Обнови pc_agent, передавай токен:
python nexum_agent.py --token TOKEN --server ws://localhost:3000
```

## Следующие части
- Часть 2: PC Agent (Python) — обновление аутентификации с --token флагом
- Часть 3: NEXUM Browser (Electron) — рабочая версия
- Часть 4: Telegram Mini Apps — React портал
