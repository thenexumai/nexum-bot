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

    /**
     * Called by WebSocket handler when PC Agent sends a raw audio chunk.
     * Accumulates chunks until silence is detected, then transcribes + executes.
     */
    onAudioChunk(chunk: Buffer): void {  // FIX: was implicit any — explicitly typed as Buffer
        this.audioBuffer.push(chunk);
    }

    /**
     * Called when PC Agent signals end of voice segment.
     * Transcribes accumulated audio and runs it through AI.
     */
    async onVoiceEnd(streamCallback?: (text: string) => void): Promise<string> {
        if (!this.audioBuffer.length) return '';

        const combined = Buffer.concat(this.audioBuffer);
        this.audioBuffer = [];

        try {
            Logger.info('voice-bridge', `Transcribing ${combined.length} bytes of audio for UID ${this.uid}`);
            const transcript = await transcribeVoice(combined);
            if (!transcript.trim()) return '';

            Logger.info('voice-bridge', `Transcript: "${transcript.slice(0, 80)}"`);
            const result = await executeAI(transcript, this.uid, [], streamCallback);
            return result.content;
        } catch (e: any) {
            Logger.error('voice-bridge', 'Voice command failed', e);
            return `❌ Ошибка: ${e.message}`;
        }
    }

    reset(): void {
        this.audioBuffer = [];
    }
}
