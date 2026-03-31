import asyncio
import sounddevice as sd
import numpy as np
import base64
import json
from io import BytesIO
import wave
from utils.logger import log

class VoiceGateway:
    def __init__(self, ws_client):
        self.ws = ws_client
        self.is_listening = False
        self.sample_rate = 16000
        self.threshold = 0.3
        self.silence_frames = 0
        self.buffer = []

    async def start_listening(self, uid):
        self.is_listening = True
        log.info("Voice Gateway: Listening for commands...")
        
        def callback(indata, frames, time, status):
            if not self.is_listening: return
            volume = np.linalg.norm(indata) * 10
            if volume > self.threshold:
                self.buffer.append(indata.copy())
                self.silence_frames = 0
            else:
                self.silence_frames += 1
                if self.silence_frames > 30 and len(self.buffer) > 0:
                    # Silence detected, send for processing
                    asyncio.run_coroutine_threadsafe(self._process_voice(uid), asyncio.get_event_loop())

        with sd.InputStream(callback=callback, channels=1, samplerate=self.sample_rate):
            while self.is_listening:
                await asyncio.sleep(0.1)

    async def _process_voice(self, uid):
        log.info("Processing voice segment...")
        audio_data = np.concatenate(self.buffer)
        self.buffer = []
        
        # Convert to WAV in memory
        byte_io = BytesIO()
        with wave.open(byte_io, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes((audio_data * 32767).astype(np.int16).tobytes())
        
        audio_b64 = base64.b64encode(byte_io.getvalue()).decode()
        
        await self.ws.send(json.dumps({
            "type": "voice_command",
            "uid": uid,
            "data": audio_b64
        }))

    def stop(self):
        self.is_listening = False
