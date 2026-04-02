#!/bin/bash

# NEXUM Диагностика
# Этот скрипт поможет найти проблему почему бот не отвечает

echo "🔍 NEXUM Диагностика"
echo "===================="
echo ""

# 1. Проверка переменных окружения
echo "1️⃣ Проверка переменных окружения..."
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ BOT_TOKEN не установлен!"
else
    echo "✅ BOT_TOKEN установлен (${BOT_TOKEN:0:10}...)"
fi

if [ -z "$ADMIN_IDS" ]; then
    echo "❌ ADMIN_IDS не установлен!"
else
    echo "✅ ADMIN_IDS: $ADMIN_IDS"
fi

# Проверка API ключей
echo ""
echo "2️⃣ Проверка API ключей..."
CB_COUNT=0
GR_COUNT=0
DS_COUNT=0
for i in 1 2 3 4 5 6; do
    var="CB$i"
    [ ! -z "${!var}" ] && CB_COUNT=$((CB_COUNT+1))
done
for i in 1 2 3 4 5 6 7; do
    var="GR$i"
    [ ! -z "${!var}" ] && GR_COUNT=$((GR_COUNT+1))
done
for i in 1 2 3 4 5 6; do
    var="DS$i"
    [ ! -z "${!var}" ] && DS_COUNT=$((DS_COUNT+1))
done

echo "Cerebras ключей: $CB_COUNT/6"
echo "Groq ключей: $GR_COUNT/7"
echo "DeepSeek ключей: $DS_COUNT/6"

if [ $CB_COUNT -eq 0 ] && [ $GR_COUNT -eq 0 ] && [ $DS_COUNT -eq 0 ]; then
    echo "⚠️ ВНИМАНИЕ: Нет ни одного API ключа! Бот не сможет отвечать!"
fi

echo ""
echo "3️⃣ Проверка процесса бота..."
if pgrep -f "node.*dist/index.js" > /dev/null; then
    echo "✅ Процесс бота запущен"
    ps aux | grep "node.*dist/index.js" | grep -v grep
else
    echo "❌ Процесс бота НЕ запущен!"
fi

echo ""
echo "4️⃣ Проверка файлов..."
if [ -f "dist/index.js" ]; then
    echo "✅ dist/index.js существует"
else
    echo "❌ dist/index.js НЕ существует! Запусти: npm run build"
fi

if [ -f "dist/telegram/handler.js" ]; then
    echo "✅ dist/telegram/handler.js существует"
else
    echo "❌ dist/telegram/handler.js НЕ существует!"
fi

if [ -f "dist/telegram/commands/index.js" ]; then
    echo "✅ dist/telegram/commands/index.js существует"
else
    echo "❌ dist/telegram/commands/index.js НЕ существует!"
fi

echo ""
echo "5️⃣ Последние 20 строк логов (если есть)..."
if [ -f "logs/nexum.log" ]; then
    tail -20 logs/nexum.log
else
    echo "⚠️ Файл логов не найден"
fi

echo ""
echo "===================="
echo "🔧 Рекомендации:"
echo ""
echo "Если бот не отвечает:"
echo "1. Проверь логи Railway: railway logs"
echo "2. Убедись что все API ключи установлены"
echo "3. Отправь боту /start чтобы обновить команды"
echo "4. Проверь что бот запущен: railway status"
echo ""
echo "Если команды не появляются:"
echo "1. Удали бота из чата и добавь заново"
echo "2. Отправь /start"
echo "3. Перезапусти бот: railway restart"
