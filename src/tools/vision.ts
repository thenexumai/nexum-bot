import { Logger } from '../infra/logger';
import { CONFIG } from '../core/config';
import fetch from 'node-fetch';

/**
 * Vision через OpenRouter — meta-llama/llama-4-scout-17b-16e-instruct
 * Принимает URL изображения (Telegram file URL) и текстовый вопрос.
 */
export async function analyzeImageWithGroq(imageUrl: string, question: string): Promise<string> {
    const keys = CONFIG.PROVIDERS.openrouter;
    if (!keys || !keys.length) {
        throw new Error('OpenRouter API ключи не настроены (OR1–OR7 в env)');
    }

    // Round-robin по ключам
    const key = keys[Math.floor(Date.now() / 1000) % keys.length];

    Logger.info('vision', `Analyzing image via llama-4-scout: ${imageUrl.slice(0, 80)}`);

    // Скачиваем фото и конвертируем в base64
    // (Telegram URLs требуют BOT_TOKEN — внешние сервисы не могут обратиться напрямую)
    let imageData: string;
    let mimeType = 'image/jpeg';

    try {
        const imgRes = await fetch(imageUrl, { timeout: 20000 } as any);
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buffer = await imgRes.buffer();
        imageData = `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (fetchErr) {
        Logger.warn('vision', `base64 fetch failed, using direct URL: ${fetchErr}`);
        imageData = imageUrl;
    }

    const body = {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: imageData },
                    },
                    {
                        type: 'text',
                        text: question,
                    },
                ],
            },
        ],
        max_tokens: 1024,
        temperature: 0.4,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://nexum-bot-production-ae70.up.railway.app',
                'X-Title': 'NEXUM AI Bot',
            },
            body: JSON.stringify(body),
            signal: controller.signal as any,
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OpenRouter vision HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content;

        if (!content) throw new Error('Vision: пустой ответ от модели');

        Logger.info('vision', `Vision OK: ${content.length} chars`);
        return content;

    } finally {
        clearTimeout(timer);
    }
}

export function isVisionAvailable(): boolean {
    return !!(CONFIG.PROVIDERS.openrouter?.length);
}
