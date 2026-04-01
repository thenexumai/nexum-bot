/**
 * NEXUM Voice Command Bridge
 * Links VoiceGateway (Python PC Agent) → transcribeVoice (Cloud STT) → executeAI
 */

import { transcribeVoice } from '../../tools/stt';
import { executeAI } from '../executor';
import { Logger } from '../../infra/logger';

export class VoiceCommandBridge {
    private uid: number;
    private audioBuffer: Buffer[] = [];

    constructor(uid: number) {
        this.uid = uid;
    }

    onAudioChunk(chunk: Buffer): void {
        this.audioBuffer.push(chunk);
    }

    /**
     * Called when PC Agent signals end of voice segment.
     * executeAI is now an AsyncGenerator — collect all chunks into full response.
     */
    async onVoiceEnd(streamCallback?: (text: string) => void): Promise<string> {
        if (!this.audioBuffer.length) return '';

        const combined = Buffer.concat(this.audioBuffer);
        this.audioBuffer = [];

        try {
            Logger.info('voice-bridge', `Transcribing ${combined.length} bytes for UID ${this.uid}`);
            const transcript = await transcribeVoice(combined);
            if (!transcript.trim()) return '';

            Logger.info('voice-bridge', `Transcript: "${transcript.slice(0, 80)}"`);

            // FIX: executeAI is AsyncGenerator(3 args) — collect chunks, call streamCallback per chunk
            let fullResponse = '';
            for await (const chunk of executeAI(transcript, this.uid, [])) {
                fullResponse += chunk;
                streamCallback?.(chunk);
            }
            return fullResponse;
        } catch (e: any) {
            Logger.error('voice-bridge', 'Voice command failed', e);
            return `❌ Ошибка: ${e.message}`;
        }
    }

    reset(): void {
        this.audioBuffer = [];
    }
}
