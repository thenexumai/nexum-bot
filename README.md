# 🚀 NEXUM v1-beta

**AI Chatbot Platform для Telegram**

---

## 📅 Дедлайны

- **MVP:** 28 Марта 2026 (4 дня!)
- **Запуск:** 1 Апреля 2026 (8 дней!)
- **Цель:** $525/мес к Апрелю (25 Middle + 20 Pro)

---

## 🎯 Функции

### ✅ Готово (v1-beta):

1. **Language Detection** — Авто-определение языка (RU/EN/UZ)
2. **Personality** — Системный промпт уровня Claude
3. **Mini Apps Sync** — uid из Telegram initData
4. **PC Agent Relay** — WebSocket контроль ПК (Pro only)
5. **20+ Инструментов** — Поиск, браузер, файлы, код, TTS, STT
6. **Tariff System** — Free/Middle/Pro с лимитами
7. **BYOK** — Bring Your Own Key (Pro)

### 📱 Мини-апы (7 шт):

- 💰 **Финансы** — Учёт доходов/расходов
- ✅ **Задачи** — Список дел
- 📝 **Заметки** — Быстрые заметки
- 🎯 **Привычки** — Трекер привычек
- 📅 **Календарь** — События
- 👥 **Контакты** — База контактов
- 🤖 **NEXUM Agent** — AI чат

---

## 🛠️ Установка

```bash
cd C:\Users\Timur\NEXUM-v1-beta
npm install
npm run build
npm start
```

---

## ⚙️ Настройка Railway

**1. Variables (Railway → nexum-bot → Variables):**

```bash
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=387182659
PORT=3000
WEBAPP_URL=https://nexum-bot-production-ae70.up.railway.app
PUBLIC_BOT=true
DB_PATH=./nexum.db

# AI Keys (fallback ротация)
CB1=...
GR1=...
G1=...
```

**2. Admin доступ:**

Твой Telegram ID: `387182659`

Админ команды:
- `/admin_stats` — статистика пользователей
- `/broadcast [msg]` — рассылка всем
- `/admin_keys` — пулы API ключей
- `/admin_db` — статистика БД
- `/approve [id] [approve|deny]` — одобрение команд

---

## 📱 Мини-апы

**URL:** `https://nexum-bot-production-ae70.up.railway.app`

| Мини-ап | URL |
|---------|-----|
| Hub | `/` или `/hub` |
| Финансы | `/finance` |
| Задачи | `/tasks` |
| Заметки | `/notes` |
| Привычки | `/habits` |

**В боте:** `/apps` — открыть меню мини-апов

---

## 📁 Структура

```
NEXUM-v1-beta/
├── src/
│   ├── index.ts          # Главный файл
│   ├── core/             # Config, DB
│   ├── agent/            # Executor, Router, Memory, Language, Personality
│   ├── telegram/         # Bot commands, handlers
│   ├── apps/             # Server, API
│   ├── tools/            # 20+ инструментов
│   └── public/           # 7 мини-апов (HTML)
├── nexum_agent.py        # PC Agent (Python)
├── .env.example          # Конфиг
├── package.json
└── README.md
```

---

## 🔑 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Меню |
| `/help` | Помощь |
| `/setkey` | Установить API ключ (BYOK) |
| `/mykeys` | Мои ключи |
| `/status` | Статус системы |

---

## 🌍 Языки

- 🇷🇺 Русский
- 🇬🇧 English
- 🇺🇿 O'zbek

---

## 💰 Тарифы

| План | Цена | Лимит | Функции |
|------|------|-------|---------|
| **Free** | $0/мес | 70/день | 1 мини-ап, базовые инструменты |
| **Middle** | $9/мес | 500/день | 3 мини-апа, память |
| **Pro** | $15/мес | Безлимит | 7 мини-апов, BYOK, NEXUM Agent |

---

## 🚀 Деплой

**Railway:**
1. Push на GitHub → автоматически деплоится
2. URL: `https://nexum-bot.railway.app`

**Локально:**
```bash
npm install
npm run build
npm start
```

---

## 💰 Тарифы

| План | Цена | Сообщения | Memory | Mini Apps | BYOK | PC Agent |
|------|------|-----------|--------|-----------|------|----------|
| **Free** | $0/мес | 70/день | ❌ | ❌ | ❌ | ❌ |
| **Middle** | $9/мес | 300/день | ✅ | ✅ | ❌ | ❌ |
| **Pro** | $15/мес | ∞ | ✅ | ✅ | ✅ | ✅ |

**PC Agent (Pro only):**
- Управление ПК через Telegram
- Команды: `/run`, `/screenshot`, `/link`, `/devices`
- Привязка к User ID + Device ID

**BYOK (Pro only):**
- `/setkey [provider] [key]` — добавить ключ
- `/mykeys` — просмотр ключей
- Приоритет: user keys → system fallback

---

## 📞 Контакты

- **Создатель:** Тимур (@exyysdof)
- **Telegram:** @ainexum_bot
- **GitHub:** https://github.com/thenexumai/nexum-bot

---

**NEXUM AI империя строится!** 🔥
