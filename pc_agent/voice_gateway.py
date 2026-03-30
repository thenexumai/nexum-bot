import asyncio
import sounddevice as sd
import numpy as np
import base64
import json
from io import BytesIO
from utils.logger import log

class VoiceGateway:
    def __init__(self, ws_client):
        self.ws = ws_client
        self.is_listening = False
        self.sample_rate = 16000
        self.threshold = 0.5 # Silence threshold

    async def start_listening(self):
        self.is_listening = True
        log.info("Voice Gateway Active. Listening for commands...")
        
        with sd.InputStream(callback=self._audio_callback, channels=1, samplerate=self.sample_rate):
            while self.is_listening:
                await asyncio.sleep(0.1)

    def _audio_callback(self, indata, frames, time, status):
        volume_norm = np.linalg.norm(indata) * 10
        if volume_norm > self.threshold:
            # Превращаем в аудио-чанк и шлем на сервер для Whisper
            # В реале тут нужна буферизация
            pass

    async def speak(self, text):
        log.info(f"NEXUM Speaking: {text}")
        # Тут интеграция с локальным TTS или воспроизведение файла с сервера
