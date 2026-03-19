# NEXUM PC Agent

Полный OpenClaw аналог для локальной работы с NEXUM ботом.

## Возможности

- 🤖 Выполнение команд через WebSocket
- 💻 Bash/PowerShell интеграция
- 📸 Скриншоты и работа с файлами
- 🔐 Безопасная аутентификация через паринг-коды
- 📊 Мониторинг системы
- 🔄 Автореконнект при потере связи

## Установка

```bash
npm install
# или
yarn install
```

## Использование

```typescript
import { NEXUMAgentCore } from "./core";

const agent = new NEXUMAgentCore("YOUR_PAIRING_CODE");
await agent.connect();

// Получение статуса
agent.onMessage("status_request", () => {
  agent.sendStatus();
});

// Выполнение команд через бот
// Все команды отправляются WebSocket, API ключи не видны
```

## Безопасность

- ✅ Открытый исходный код
- ✅ Токены не хранятся в коде
- ✅ WebSocket шифрование
- ✅ Паринг-коды одноразовые
- ✅ Никаких API ключей в сети

## Архитектура

```
NEXUM Bot (Telegram)
    ↓
WebSocket Server
    ↓
PC Agent (Node.js/TypeScript)
    ↓
Local System
```

## Команды

- `bash <cmd>` — выполнить команду
- `screenshot` — скриншот
- `status` — статус системы
- `file <path>` — работа с файлами

## Лицензия

Open source. Используется с NEXUM ботом.
