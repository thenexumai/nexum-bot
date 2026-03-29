export type Lang = 'ru' | 'en';

const strings: Record<Lang, Record<string, string>> = {
  ru: {
    welcome: `👋 Привет, {name}! Я **NEXUM** — твой AI-ассистент нового поколения.\n\nОбъединяю лучшее из Perplexity, Claude и ChatGPT.\n\n/help — все команды\n/tariffs — планы и цены`,
    help_header: '📖 **Команды NEXUM:**',
    help_general: `
/start — начало работы
/help — это меню
/status — твой план и лимиты
/new — новая сессия
/tariffs — тарифы
/lang — сменить язык`,
    help_middle: `
/memory — долгосрочная память
/forget — очистить память
/remind [текст] [минуты] — напоминание
/reminders — мои напоминания
/voice — голосовой режим
/apps — мини-приложения`,
    help_pro: `
/link — подключить ПК
/pc — статус PC Agent
/run [команда] — выполнить в терминале
/screenshot — скриншот экрана
/browse [URL] — открыть сайт
/setkey [провайдер] [ключ] — свой API ключ
/mykeys — мои ключи`,
    plan_free: '🆓 FREE',
    plan_middle: '💼 MIDDLE',
    plan_pro: '🚀 PRO',
    limit_reached: '⚠️ Дневной лимит исчерпан. Upgrade до Middle или Pro для большего.',
    no_access: '🔒 Эта функция доступна на плане {plan}+.',
    tariffs: `💰 **Тарифы NEXUM:**

🆓 **FREE** — Бесплатно
• 70 сообщений/день
• Базовый AI чат
• Поиск в интернете
• Задачи и финансы

💼 **MIDDLE** — $9/мес
• 300 сообщений/день
• Память и контекст
• Все мини-приложения
• Голосовой режим
• Напоминания

🚀 **PRO** — $15/мес
• Безлимитные сообщения
• PC Agent (управление ПК)
• Свои API ключи (BYOK)
• Все функции Middle+`,
    memory_saved: '💾 Запомнено!',
    memory_cleared: '🗑️ Память очищена.',
    session_reset: '🔄 Новая сессия начата.',
    searching: '🔍 Ищу...',
    thinking: '💭 Думаю...',
    voice_on: '🎙️ Голосовой режим включён.',
    voice_off: '🎙️ Голосовой режим выключён.',
    reminder_set: '⏰ Напоминание установлено!',
    reminder_fired: '⏰ Напоминание: {text}',
    lang_changed: '🌍 Язык изменён на Русский.',
    admin_only: '🔐 Только для администратора.',
    user_not_found: '❌ Пользователь не найден.',
    grant_success: '✅ Пользователю {uid} выдан план {plan} на {days} дней!',
    revoke_success: '✅ Подписка пользователя {uid} отменена.',
    broadcast_success: '📢 Рассылка отправлена {count} пользователям.',
    byok_saved: '✅ Ключ {provider} сохранён.',
    byok_removed: '✅ Ключ {provider} удалён.',
    byok_list_empty: '📭 У вас нет сохранённых ключей.',
    pc_link_code: '🔗 Код для подключения ПК: `{code}`\n\nЗапустите на своём компьютере:\n```\npython nexum_agent.py --code {code}\n```',
    pc_connected: '✅ PC Agent подключён!',
    pc_disconnected: '❌ PC Agent не подключён.',
    pc_action_confirm: '⚠️ Выполнить команду?\n```\n{cmd}\n```',
    error_generic: '❌ Произошла ошибка. Попробуйте ещё раз.',
    status_msg: `📊 **Статус аккаунта:**

👤 Пользователь: {name}
📋 План: {plan}
📨 Сообщений сегодня: {count}/{limit}
🌍 Язык: {lang}
📅 Подписка до: {expires}`,
  },
  en: {
    welcome: `👋 Hi, {name}! I'm **NEXUM** — your next-gen AI assistant.\n\nCombining the best of Perplexity, Claude and ChatGPT.\n\n/help — all commands\n/tariffs — pricing plans`,
    help_header: '📖 **NEXUM Commands:**',
    help_general: `
/start — get started
/help — this menu
/status — your plan & limits
/new — new session
/tariffs — pricing
/lang — change language`,
    help_middle: `
/memory — long-term memory
/forget — clear memory
/remind [text] [minutes] — set reminder
/reminders — my reminders
/voice — voice mode
/apps — mini apps`,
    help_pro: `
/link — connect PC
/pc — PC Agent status
/run [command] — execute in terminal
/screenshot — screen capture
/browse [URL] — open website
/setkey [provider] [key] — your API key
/mykeys — my keys`,
    plan_free: '🆓 FREE',
    plan_middle: '💼 MIDDLE',
    plan_pro: '🚀 PRO',
    limit_reached: '⚠️ Daily limit reached. Upgrade to Middle or Pro for more.',
    no_access: '🔒 This feature is available on {plan}+ plan.',
    tariffs: `💰 **NEXUM Pricing:**

🆓 **FREE** — Free
• 70 messages/day
• Basic AI chat
• Web search
• Tasks & finance

💼 **MIDDLE** — $9/mo
• 300 messages/day
• Memory & context
• All mini apps
• Voice mode
• Reminders

🚀 **PRO** — $15/mo
• Unlimited messages
• PC Agent (desktop control)
• BYOK (your own API keys)
• All Middle features+`,
    memory_saved: '💾 Saved!',
    memory_cleared: '🗑️ Memory cleared.',
    session_reset: '🔄 New session started.',
    searching: '🔍 Searching...',
    thinking: '💭 Thinking...',
    voice_on: '🎙️ Voice mode enabled.',
    voice_off: '🎙️ Voice mode disabled.',
    reminder_set: '⏰ Reminder set!',
    reminder_fired: '⏰ Reminder: {text}',
    lang_changed: '🌍 Language changed to English.',
    admin_only: '🔐 Admin only.',
    user_not_found: '❌ User not found.',
    grant_success: '✅ User {uid} granted {plan} plan for {days} days!',
    revoke_success: '✅ Subscription for user {uid} revoked.',
    broadcast_success: '📢 Broadcast sent to {count} users.',
    byok_saved: '✅ Key for {provider} saved.',
    byok_removed: '✅ Key for {provider} removed.',
    byok_list_empty: '📭 You have no saved keys.',
    pc_link_code: '🔗 PC link code: `{code}`\n\nRun on your computer:\n```\npython nexum_agent.py --code {code}\n```',
    pc_connected: '✅ PC Agent connected!',
    pc_disconnected: '❌ PC Agent not connected.',
    pc_action_confirm: '⚠️ Execute command?\n```\n{cmd}\n```',
    error_generic: '❌ Something went wrong. Please try again.',
    status_msg: `📊 **Account Status:**

👤 User: {name}
📋 Plan: {plan}
📨 Messages today: {count}/{limit}
🌍 Language: {lang}
📅 Subscription until: {expires}`,
  },
};

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let str = strings[lang]?.[key] ?? strings['ru'][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`{${k}}`, 'g'), String(v));
    }
  }
  return str;
}

export default t;
