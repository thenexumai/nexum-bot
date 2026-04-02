# NEXUM PC Agent - Управление компьютером через Telegram

## 🎯 Что это?

NEXUM PC Agent позволяет управлять своим компьютером прямо из Telegram. Доступно только для **Pro пользователей**.

## ✨ Возможности

- 📸 Снимки экрана
- 🖱 Управление мышью и клавиатурой
- 📁 Работа с файлами
- 🔍 Поиск и запуск программ
- 💻 Выполнение команд
- 🌐 Автоматизация браузера
- И многое другое!

---

## 🚀 Быстрая установка

### Способ 1: NPM (рекомендуется)

```bash
npm install -g @nexum/pc-agent
nexum-agent
```

При первом запуске agent попросит токен. Получите его в Telegram:
```
/link_pc
```

### Способ 2: Python

```bash
pip install nexum-agent
nexum-agent
```

### Способ 3: Docker

```bash
docker pull nexum/pc-agent
docker run -e TOKEN=your_token nexum/pc-agent
```

---

## 📋 Подробная инструкция

### Шаг 1: Получить токен

1. Откройте Telegram
2. Найдите вашего NEXUM бота
3. Отправьте команду `/link_pc`
4. Скопируйте токен (формат: `nexum_123456_abc123...`)

### Шаг 2: Установить агент

#### На Windows:

```powershell
# Через NPM
npm install -g @nexum/pc-agent

# Через Python
pip install nexum-agent

# Запуск
nexum-agent --token YOUR_TOKEN
```

#### На macOS:

```bash
# Через Homebrew
brew install nexum-agent

# Через NPM
npm install -g @nexum/pc-agent

# Запуск
nexum-agent --token YOUR_TOKEN
```

#### На Linux:

```bash
# Ubuntu/Debian
curl -fsSL https://nexum.app/install.sh | sh

# Arch Linux
yay -S nexum-agent

# Через NPM
npm install -g @nexum/pc-agent

# Запуск
nexum-agent --token YOUR_TOKEN
```

### Шаг 3: Проверить подключение

В Telegram отправьте:
```
/pc_status
```

Должно появиться: 🟢 **Твой PC Агент подключён**

---

## 🔧 Конфигурация

### Файл конфигурации

Создайте `~/.nexum/config.json`:

```json
{
  "token": "nexum_123456_abc123...",
  "server": "wss://nexum-bot-production.up.railway.app",
  "autostart": true,
  "permissions": {
    "screenshot": true,
    "file_access": true,
    "command_execution": true,
    "browser_control": false
  }
}
```

### Автозапуск

#### Windows:
```powershell
nexum-agent install --autostart
```

#### macOS:
```bash
nexum-agent install --launchd
```

#### Linux (systemd):
```bash
nexum-agent install --systemd
```

---

## 🎮 Использование

### Базовые команды в Telegram:

- `/screenshot` - сделать снимок экрана
- `/pc_status` - статус подключения
- `/disconnect_pc` - отключить агент

### Продвинутое использование:

Просто пишите боту что вам нужно:

```
"Открой браузер и зайди на YouTube"
"Создай файл test.txt с текстом Hello World"
"Найди все PDF файлы в папке Документы"
"Закрой все окна Chrome"
```

---

## 🔒 Безопасность

### Персональный токен

- Токен привязан **только к вам**
- Никто другой не может использовать ваш токен
- Токен бессрочный для Pro пользователей
- Можно отозвать в любой момент: `/disconnect_pc`

### Разрешения

По умолчанию агент может:
- ✅ Делать скриншоты
- ✅ Читать файлы
- ✅ Выполнять команды

Опционально (требует подтверждения):
- ⚠️ Удалять файлы
- ⚠️ Устанавливать программы
- ⚠️ Менять системные настройки

### Аппрувы

Для опасных операций бот запросит подтверждение:
```
⚠️ Запрос на действие

Действие: delete_file
Файл: /важный_документ.docx

Разрешить?  [Да] [Нет]
```

---

## 📱 Системные требования

### Минимальные:
- **ОС:** Windows 10+, macOS 11+, Linux (любой)
- **RAM:** 256 MB
- **CPU:** любой x64/ARM
- **Интернет:** постоянное подключение

### Рекомендуемые:
- **RAM:** 512 MB
- **Интернет:** стабильное соединение

---

## 🐛 Решение проблем

### Агент не подключается

```bash
# Проверьте токен
nexum-agent --token YOUR_TOKEN --debug

# Проверьте интернет
ping nexum-bot-production.up.railway.app

# Переустановите агент
npm uninstall -g @nexum/pc-agent
npm install -g @nexum/pc-agent
```

### Агент подключился но не отвечает

1. Проверьте разрешения в config.json
2. Перезапустите агент
3. Проверьте логи: `~/.nexum/logs/agent.log`

### Токен истек

```
/disconnect_pc
/link_pc
```

Получите новый токен и перезапустите агент.

---

## 🔄 Обновление

```bash
# NPM
npm update -g @nexum/pc-agent

# Python
pip install --upgrade nexum-agent

# Docker
docker pull nexum/pc-agent:latest
```

---

## 📚 Дополнительно

### Логи

Логи агента сохраняются в:
- **Windows:** `C:\Users\YourName\.nexum\logs\`
- **macOS:** `~/.nexum/logs/`
- **Linux:** `~/.nexum/logs/`

### Удаление

```bash
# Остановить агент
nexum-agent stop

# Удалить автозапуск
nexum-agent uninstall

# Удалить программу
npm uninstall -g @nexum/pc-agent

# Удалить конфиг и логи
rm -rf ~/.nexum
```

---

## 🆘 Поддержка

- 📧 Email: support@nexum.app
- 💬 Telegram: @nexum_support
- 🐛 Issues: https://github.com/nexum/pc-agent/issues
- 📖 Документация: https://docs.nexum.app/pc-agent

---

## ⚖️ Лицензия

NEXUM PC Agent доступен только для Pro пользователей.

При использовании агента вы соглашаетесь:
- Не использовать агент для незаконной деятельности
- Не передавать свой токен третьим лицам
- Отвечать за все действия выполненные через ваш агент

---

**Создано с ❤️ командой NEXUM**

Версия: 1.0.0 | Последнее обновление: 02.04.2026
