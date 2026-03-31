export const i18n: any = {
    ru: {
        welcome: "🚀 Добро пожаловать в NEXUM v1.0!\nЯ — твой революционный AI-ассистент.",
        help: "📚 *Доступные команды:*\n/status - Мой план и лимиты\n/new - Новая сессия\n/search - Веб-поиск\n/remind - Напоминание\n/tariffs - Цены и планы",
        plan_status: (plan: string, limit: any) => `📊 Ваш план: *${plan.toUpperCase()}*\nЛимит: ${limit === Infinity ? 'Безлимитно' : limit + ' сообщ./день'}`,
        no_key: "❌ API ключ не настроен. Используйте /setkey (для PRO) или обратитесь в поддержку.",
        cmd_pro_only: "🔐 Эта функция доступна только в PRO плане.",
        cmd_admin_only: "🛡 Доступ запрещен. Только для администратора.",
        searching: (q: string) => `🔍 Ищу в сети: ${q}...`,
    },
    en: {
        welcome: "🚀 Welcome to NEXUM v1.0!\nI am your revolutionary AI assistant.",
        help: "📚 *Available commands:*\n/status - My plan & limits\n/new - New session\n/search - Web search\n/remind - Reminder\n/tariffs - Prices & plans",
        plan_status: (plan: string, limit: any) => `📊 Your plan: *${plan.toUpperCase()}*\nLimit: ${limit === Infinity ? 'Unlimited' : limit + ' msg/day'}`,
        no_key: "❌ API key not configured. Use /setkey (for PRO) or contact support.",
        cmd_pro_only: "🔐 This feature is PRO only.",
        cmd_admin_only: "🛡 Access denied. Admin only.",
        searching: (q: string) => `🔍 Searching web: ${q}...`,
    }
};

export const t = (uid: number, key: string, ...args: any[]) => {
    const lang = 'ru';
    const entry = i18n[lang][key];
    if (typeof entry === 'function') return entry(...args);
    return entry || key;
};

export default { i18n, t };
