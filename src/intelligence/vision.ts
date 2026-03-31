import { chatUnified } from '../agent/router';
import { Logger } from '../infra/logger';

export class VisionReasoning {
    static async planNextAction(screenshotBase64: string, objective: string, uid: number) {
        Logger.info('vision', `Analyzing screen state for: ${objective}`);
        
        const prompt = `
            IMAGE: [User Screen]
            OBJECTIVE: ${objective}
            
            Based on the image provided (base64 context), identify the target element.
            If you see a button with data-nexum-id, specify its ID.
            
            Respond in JSON:
            {
                "thought": "Analysis of the visual state",
                "action": "click | type | scroll | finish",
                "target_id": number | null,
                "text": string | null
            }
        `;

        try {
            // В идеале тут используется модель с Vision (Gemini 2.0 / Llama 3.2 Vision)
            const response = await chatUnified([{ 
                role: 'user', 
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
                ] 
            }], uid);
            
            return JSON.parse(response.content.replace(/```json|```/g, '').trim());
        } catch (e: any) {
            Logger.error('vision', 'Visual reasoning failed', e);
            return { action: 'error', error: e.message };
        }
    }
}
