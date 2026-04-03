import { Logger } from '../infra/logger';
import { CONFIG } from '../core/config';
import fetch from 'node-fetch';

/**
 * Vision через Groq API — meta-llama/llama-4-scout-17b-16e-instruct
 * Принимает URL изображения и текстовый вопрос.
 */
export async function analyzeImageWithGroq(imageUrl: string, question: string): Promise<string> {
    const keys = CONFIG.PROVIDERS.groq;
    if (!keys || !keys.length) {
        throw new Error('Groq API ключи не настроены (GR1–GR7 в env)');
    }

    // Round-robin по ключам
    const key = keys[Math.floor(Date.now() / 1000) % keys.length];

    Logger.info('vision', `Analyzing image via Groq llama-4-scout: ${imageUrl.slice(0, 80)}`);

    // Скачиваем фото и конвертируем в base64
    // Telegram URLs содержат BOT_TOKEN — Groq не может обратиться напрямую
    let imageData: string;
    let mimeType = 'image/jpeg';

    try {
        const imgRes = await fetch(imageUrl, { timeout: 20000 } as any);
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buffer = await imgRes.buffer();
        imageData = `data:${mimeType};base64,${buffer.toString('base64')}`;
        Logger.info('vision', `Image fetched as base64, size: ${buffer.length} bytes`);
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
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal as any,
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Groq vision HTTP ${res.status}: ${errText.slice(0, 300)}`);
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
    return !!(CONFIG.PROVIDERS.groq?.length);
}
