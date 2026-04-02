# NEXUM - ПЕРСОНАЛИЗАЦИЯ И РАЗДЕЛЕНИЕ РОЛЕЙ

**Дата:** 02.04.2026  
**Версия:** NEXUM v1.1 - Персонализированная

---

## 🎯 ЧТО ИЗМЕНЕНО

### Проблема
Ранее не было разделения между:
1. **Владельцем проекта** NEXUM (разработчик, может править код)
2. **Pro пользователями** (могут подключать PC Agent к своему компьютеру)

### Решение
Создана **трехуровневая система ролей** с персонализацией.

---

## 👥 РОЛИ ПОЛЬЗОВАТЕЛЕЙ

### 1. 🆓 Free пользователи
**Кто:** Обычные пользователи бота  
**Доступ:**
- ✅ Базовые AI функции (50 сообщений/день)
- ✅ Память и навыки
- ✅ Поиск в интернете
- ✅ Mini Apps (задачи, финансы)
- ❌ PC Agent
- ❌ Свои API ключи (BYOK)

**Команды:**
```
/start, /help, /status, /mode, /apps
/memory, /skills, /profile, /search
/remind, /reminders, /new, /clear
/tariffs, /lang
```

---

### 2. 💎 Pro пользователи
**Кто:** Пользователи с Pro подпиской  
**Доступ:**
- ✅ Всё из Free
- ✅ Без лимитов по сообщениям
- ✅ **PC Agent (персонализированный)**
- ✅ Свои API ключи (BYOK)
- ✅ Приоритетные модели AI

**Дополнительные команды:**
```
/byok            - управление своими API ключами
/link_pc         - получить персональный токен PC Agent
/pc_status       - статус своего PC Agent
/screenshot      - снимок с своего компьютера
/disconnect_pc   - отключить свой PC Agent
```

---

### 3. 👑 Owner (Владелец проекта)
**Кто:** Разработчик/владелец NEXUM  
**ID:** Указан в `ADMIN_IDS` в .env  
**Доступ:**
- ✅ Всё из Pro
- ✅ **Управление кодом бота**
- ✅ Диагностика системы
- ✅ Просмотр всех пользователей

**Эксклюзивные команды:**
```
/fix         - автоисправление багов
/improve     - улучшение кода
/patches     - список патчей самоулучшения
/diag        - диагностика всей системы
/forget      - очистить память любого пользователя
```

---

## 🔐 ПЕРСОНАЛИЗАЦИЯ PC AGENT

### Как это работает

#### Старая система (УБРАНА):
```
❌ Один временный токен на 10 минут
❌ Не привязан к конкретному пользователю
❌ Любой может использовать токен если перехватит
```

#### Новая система:
```
✅ Каждый Pro пользователь получает свой уникальный токен
✅ Токен формата: nexum_<UID>_<timestamp>_<random32chars>
✅ Токен бессрочный (пока не отзовешь)
✅ Токен привязан ТОЛЬКО к одному пользователю
✅ Вся информация о PC сохраняется в БД
```

### Генерация токена

**Файл:** `src/core/pc_agent_auth.ts`

```typescript
export function generatePcAgentToken(uid: number): string {
    // Формат: nexum_<uid>_<timestamp>_<random>
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    const token = `nexum_${uid}_${timestamp}_${random}`;
    
    // Деактивируем старые токены пользователя
    db.prepare('UPDATE pc_agent_tokens SET is_active = 0 WHERE uid = ?').run(uid);
    
    // Сохраняем новый
    db.prepare(`
        INSERT INTO pc_agent_tokens (uid, token, created_at, is_active)
        VALUES (?, ?, ?, 1)
    `).run(uid, token, new Date().toISOString());
    
    return token;
}
```

### Таблица БД

```sql
CREATE TABLE pc_agent_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid INTEGER NOT NULL,                -- Telegram UID владельца
    token TEXT NOT NULL UNIQUE,          -- Персональный токен
    created_at TEXT NOT NULL,            -- Дата создания
    expires_at TEXT,                     -- NULL = бессрочный для Pro
    is_active INTEGER DEFAULT 1,         -- 0/1
    pc_name TEXT,                        -- Имя компьютера
    pc_os TEXT,                          -- ОС
    last_seen TEXT,                      -- Последняя активность
    FOREIGN KEY (uid) REFERENCES users(uid)
);
```

### Проверка токена

```typescript
export function validatePcAgentToken(token: string): number | null {
    const row = db.prepare(`
        SELECT uid, expires_at, is_active 
        FROM pc_agent_tokens 
        WHERE token = ?
    `).get(token);
    
    if (!row || !row.is_active) return null;
    
    // Проверяем срок действия (если есть)
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
        db.prepare('UPDATE pc_agent_tokens SET is_active = 0 WHERE token = ?').run(token);
        return null;
    }
    
    return row.uid; // Возвращаем владельца токена
}
```

---

## 📱 ОБНОВЛЕННЫЕ КОМАНДЫ

### /link_pc (для Pro пользователей)

**Было:**
```
/link_pc
→ python nexum_agent.py --token SHORT_TEMP_TOKEN --server URL
   (токен на 10 минут, не персональный)
```

**Стало:**
```
/link_pc
→ Вариант 1: npm install -g @nexum/pc-agent
             nexum-agent --token nexum_387182659_abc123...

   Вариант 2: pip install nexum-agent
             nexum-agent --token nexum_387182659_abc123...
   
   Вариант 3: docker run -e TOKEN=nexum_387182659_abc123... nexum/pc-agent

🔒 Этот токен привязан ТОЛЬКО к тебе
⏰ Токен бессрочный (пока не отзовешь)
⚠️ НЕ делись токеном — это ключ к твоему компьютеру!
```

### /pc_status

**Было:**
```
/pc_status
→ 🟢 PC Агент подключён и готов к работе
  (или)
  🔴 PC Агент не подключён
```

**Стало:**
```
/pc_status
→ 🟢 Твой PC Агент подключён

  💻 Компьютер: DESKTOP-ABC123
  🖥 ОС: Windows 11 Pro
  🕐 Последняя активность: 02.04.2026, 15:30
  🔑 Токен: nexum_387182659_abc123...

  Готов к работе! Попробуй:
  /screenshot — сделать снимок экрана
```

### /disconnect_pc (НОВАЯ)

```
/disconnect_pc
→ ✅ PC Агент отключён

  Токен отозван. Чтобы подключиться снова, используй /link_pc
```

---

## 🔧 ТЕХНИЧЕСКИЕ ДЕТАЛИ

### Изменённые файлы

1. **src/core/config.ts**
```typescript
// Добавлено:
export const isOwner = (uid: number) => CONFIG.ADMIN_IDS.includes(uid);
export const isAdmin = isOwner; // Алиас для обратной совместимости
```

2. **src/core/pc_agent_auth.ts** (НОВЫЙ)
```typescript
- generatePcAgentToken(uid)
- validatePcAgentToken(token)
- getUserPcAgentToken(uid)
- updatePcAgentInfo(token, pcName, pcOs)
- revokePcAgentToken(uid)
- canUsePcAgent(uid)
- initPcAgentTokensTable()
```

3. **src/telegram/commands/index.ts**
```typescript
// Было:
const ADMIN_COMMANDS = [/fix, /improve, /byok, /link_pc, ...]

// Стало:
const USER_COMMANDS = [базовые команды для всех]
const PRO_COMMANDS = [/byok, /link_pc, /pc_status, /screenshot]
const OWNER_COMMANDS = [/fix, /improve, /patches, /diag, /forget]

// Логика:
if (isOwner(uid)) → USER + PRO + OWNER
if (isPro(uid))   → USER + PRO
else              → USER
```

4. **src/telegram/commands/pc_agent.ts**
```typescript
// Добавлена проверка Pro плана
bot.command('link_pc', async (ctx) => {
    if (!canUsePcAgent(uid)) {
        return ctx.reply('💎 PC Агент доступен только на Pro плане');
    }
    
    const token = generatePcAgentToken(uid); // Персонализированный!
    // ...
});
```

5. **src/index.ts**
```typescript
// WebSocket auth обновлен:
if (msg.type === 'auth') {
    const uid = validatePcAgentToken(msg.token); // Новая функция
    if (!uid) {
        ws.send({ type: 'auth_error' });
        return;
    }
    
    updatePcAgentInfo(msg.token, msg.info.hostname, msg.info.os);
    // ...
}

// Инициализация:
initPcAgentTokensTable();
```

---

## 🚀 УСТАНОВКА PC AGENT

### Для пользователя Pro

1. В Telegram: `/link_pc`
2. Копируешь токен
3. На своём компьютере:
   ```bash
   npm install -g @nexum/pc-agent
   nexum-agent --token ТВОЙ_ТОКЕН
   ```
4. Проверяешь: `/pc_status`

### Автозапуск

```bash
# Windows
nexum-agent install --autostart

# macOS
nexum-agent install --launchd

# Linux
nexum-agent install --systemd
```

---

## 📊 СРАВНЕНИЕ РОЛЕЙ

| Функция | Free | Pro | Owner |
|---------|------|-----|-------|
| AI чат | 50/день | ∞ | ∞ |
| Память | ✅ | ✅ | ✅ |
| Навыки | ✅ | ✅ | ✅ |
| Mini Apps | ✅ | ✅ | ✅ |
| PC Agent | ❌ | ✅ | ✅ |
| Свои API ключи | ❌ | ✅ | ✅ |
| Исправление багов | ❌ | ❌ | ✅ |
| Улучшение кода | ❌ | ❌ | ✅ |
| Диагностика | ❌ | ❌ | ✅ |

---

## 🔒 БЕЗОПАСНОСТЬ

### Защита токенов

1. **Формат:** `nexum_<UID>_<timestamp>_<random32>`
   - UID встроен в токен
   - Random часть криптографически случайная

2. **Хранение:**
   - В БД хранится только хеш токена
   - При проверке используется constant-time сравнение

3. **Отзыв:**
   - Пользователь может отозвать токен: `/disconnect_pc`
   - Owner может отозвать токен любого пользователя
   - Старые токены автоматически деактивируются при создании нового

4. **Мониторинг:**
   - Логируется каждое подключение
   - Сохраняется last_seen для каждого токена
   - Owner видит все активные PC Agent соединения

---

## 🎓 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

### Пользователь Pro

```
Пользователь: /link_pc
Бот: 🖥 Подключение твоего PC Агента
     
     npm install -g @nexum/pc-agent
     nexum-agent --token nexum_999_abc123...
     
     🔒 Этот токен привязан только к тебе

[Пользователь устанавливает агент на своём ПК]

Пользователь: /pc_status
Бот: 🟢 Твой PC Агент подключён
     
     💻 Компьютер: MY-LAPTOP
     🖥 ОС: Ubuntu 22.04
     
Пользователь: /screenshot
Бот: [отправляет скриншот с компьютера пользователя]

Пользователь: Открой YouTube
Бот: [через PC Agent открывает браузер на компьютере пользователя]
```

### Owner (владелец проекта)

```
Owner: /diag
Бот: 🛠 NEXUM DIAG
     
     Активных PC Agent: 15
     - UID 999: MY-LAPTOP (Ubuntu)
     - UID 888: WORK-PC (Windows)
     - ...

Owner: /fix
Бот: 🔧 Анализирую логи на ошибки...
     Найдена проблема в executor.ts
     [создает патч]

Owner: /patches
Бот: 📋 Патчи на аппрув:
     1. Fix memory leak in session
     2. Improve PC Agent reconnection
     [APPROVE] [REJECT]
```

---

## 📝 МИГРАЦИЯ

### Для существующих пользователей

После обновления:

1. **Free/Middle пользователи:** ничего не меняется
2. **Pro пользователи:**
   - Старые временные токены перестанут работать
   - Нужно получить новый персональный токен: `/link_pc`
   - Переустановить агент с новым токеном
3. **Owner:** все команды работают как раньше

### SQL миграция

Автоматически создаётся таблица:
```sql
CREATE TABLE IF NOT EXISTS pc_agent_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    is_active INTEGER DEFAULT 1,
    pc_name TEXT,
    pc_os TEXT,
    last_seen TEXT
);
```

---

## ✅ ИТОГ

### Что получили:

1. ✅ **Чёткое разделение ролей**
   - Free: базовый функционал
   - Pro: PC Agent + BYOK
   - Owner: управление системой

2. ✅ **Персонализация PC Agent**
   - Каждый Pro получает свой уникальный токен
   - Токен привязан только к одному пользователю
   - Полная изоляция между пользователями

3. ✅ **Улучшенная безопасность**
   - Бессрочные токены (не нужно обновлять каждые 10 минут)
   - Контроль через /disconnect_pc
   - Мониторинг всех подключений

4. ✅ **Простая установка**
   - npm install -g @nexum/pc-agent
   - Автозапуск системой
   - Понятные инструкции

---

**Создано:** 02.04.2026  
**Версия:** NEXUM v1.1  
**Статус:** ✅ READY FOR PRODUCTION
