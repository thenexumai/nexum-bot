# NEXUM - БЫСТРЫЙ ДЕПЛОЙ

## ✅ ЧТО ИСПРАВЛЕНО

Две критические ошибки TypeScript, которые блокировали деплой на Railway:

1. ❌ `BotCommand` не экспортируется из `grammy`  
   ✅ Исправлено: `import type { BotCommand } from 'grammy/types'`

2. ❌ Ошибка типизации в индексации провайдеров  
   ✅ Исправлено: используем `keyof typeof` вместо `as any`

**Детали:** смотри `BUGFIXES.md`

---

## 🚀 КАК ЗАДЕПЛОИТЬ

### Вариант 1: Через GitHub (рекомендуется)

```bash
# 1. Распакуй архив
tar -xzf NEXUM-FIXED.tar.gz
cd NEXUM-FINAL

# 2. Инициализируй git (если ещё не сделано)
git init
git add .
git commit -m "Fix TypeScript compilation errors"

# 3. Запуш в свой репозиторий
git remote add origin https://github.com/YOUR_USERNAME/nexum-bot.git
git push -u origin main
```

Railway автоматически подхватит изменения и задеплоит.

---

### Вариант 2: Railway CLI

```bash
# 1. Установи Railway CLI
npm install -g @railway/cli

# 2. Логин
railway login

# 3. Деплой из директории
cd NEXUM-FINAL
railway up
```

---

## 🔑 ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

**ВАЖНО:** Убедись что на Railway есть все переменные из твоего списка:

```env
BOT_TOKEN=8758082038:AAFTdkOoRKICPuu1DyNlazTd7xBR96Z7fzw
ADMIN_IDS=387182659
WEBAPP_URL=https://nexum-bot-production-ae70.up.railway.app
DB_PATH=./data/nexum.db

# API ключи (CB1-CB6, GR1-GR7, DS1-DS6, G1-G7, и т.д.)
CB1=csk-3t2ry9tthdpcrjykn4djxkhxmtc96vvjdyj6cm63ef5frhhn
CB2=csk-9858j83698cry32feh32p6jewce6pwmv4mjprddm9dpr8kxm
# ... и так далее
```

Эти ключи **НЕ включены в код** и берутся из переменных окружения Railway.

---

## ✅ ПРОВЕРКА ПОСЛЕ ДЕПЛОЯ

1. Открой Telegram бота
2. Отправь `/start`
3. Должно появиться персонализированное меню:
   - Если ты владелец (UID 387182659) → видишь `/fix`, `/improve`, `/diag`
   - Если Pro пользователь → видишь `/link_pc`, `/byok`
   - Если Free → базовые команды

---

## 📋 ЧТО ИЗМЕНИЛОСЬ С ПРОШЛОЙ ВЕРСИИ

### NEXUM-PERSONALIZED → NEXUM-FIXED

| Компонент | Статус |
|-----------|--------|
| Персонализация ролей | ✅ Без изменений |
| PC Agent токены | ✅ Без изменений |
| BYOK система | ✅ Без изменений |
| TypeScript импорты | ✅ **ИСПРАВЛЕНО** |
| Типизация | ✅ **ИСПРАВЛЕНО** |

**Функционал:** 100% сохранён  
**Исправления:** Только техническая компиляция

---

## 🐛 ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ

### Ошибка: "Module not found"
```bash
npm install
npm run build
```

### Ошибка при старте бота
Проверь логи Railway:
```
View → Deployments → Latest → Logs
```

### Команды не появляются в меню
Отправь боту `/start` заново — это пересоздаст меню.

---

## 📞 КОНТАКТЫ

Если остались вопросы — пиши сюда же в чат!

---

**Версия:** NEXUM v1.2 (исправленная)  
**Дата:** 03.04.2026  
**Готово к деплою:** ✅ ДА
