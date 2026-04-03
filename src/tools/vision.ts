import { Logger } from '../infra/logger';
import { CONFIG } from '../core/config';
import fetch from 'node-fetch';

/**
 * Vision через Groq API (llama-3.2-11b-vision-preview)
 * Принимает URL изображения (Telegram file URL) и текстовый вопрос
 */
export async function analyzeImageWithGroq(imageUrl: string, question: string): Promise<string> {
    const keys = CONFIG.PROVIDERS.groq;
    if (!keys.length) {
        throw new Error('Groq API ключи не настроены');
    }

    // Round-robin по ключам
    const key = keys[Math.floor(Date.now() / 1000) % keys.length];

    Logger.info('vision', `Analyzing image via Groq vision: ${imageUrl.slice(0, 60)}`);

    // Сначала скачиваем изображение и конвертируем в base64
    // (Groq принимает и URL и base64, но Telegram URLs требуют токен)
    let imageContent: { type: string; image_url: { url: string } } | { type: string; image_url: { url: string } };

    try {
        const imgRes = await fetch(imageUrl, { timeout: 15000 } as any);
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        const buffer = await imgRes.buffer();
        const base64 = buffer.toString('base64');
        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
        imageContent = {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
        };
    } catch (err) {
        Logger.warn('vision', `Failed to fetch image as base64, trying direct URL: ${err}`);
        // Fallback: передаём URL напрямую
        imageContent = {
            type: 'image_url',
            image_url: { url: imageUrl },
        };
    }

    const body = {
        model: 'llama-3.2-11b-vision-preview',
        messages: [
            {
                role: 'user',
                content: [
                    imageContent,
                    {
                        type: 'text',
                        text: question,
                    },
                ],
            },
        ],
        max_tokens: 1024,
        temperature: 0.5,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

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
            throw new Error(`Groq vision HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content;

        if (!content) throw new Error('Groq vision: пустой ответ');

        Logger.info('vision', `Vision analysis complete, ${content.length} chars`);
        return content;

    } finally {
        clearTimeout(timer);
    }
}

/**
 * Быстрая проверка: поддерживает ли провайдер vision
 */
export function isVisionAvailable(): boolean {
    return CONFIG.PROVIDERS.groq.length > 0;
}
