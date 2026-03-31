import fetch from 'node-fetch';
import FormData from 'form-data';
import { CONFIG, getProviderKey } from '../core/config';
import { Logger } from '../infra/logger';

export const transcribeVoice = async (audioBuffer: Buffer): Promise<string> => {
    Logger.info('stt', 'Transcribing audio via Groq Whisper...');
    
    const apiKey = getProviderKey('groq');  // FIX: was 'GROQ', must be lowercase AiProvider
    if (!apiKey) throw new Error('No Groq API key found');

    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-large-v3');

    try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...form.getHeaders()
            },
            body: form
        });

        const data = await response.json() as any;
        return data.text || '';
    } catch (error) {
        Logger.error('stt', 'Transcription failed', error);
        return 'Error transcribing audio.';
    }
};
