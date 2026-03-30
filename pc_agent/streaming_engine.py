import asyncio
import base64
import pyautogui
import time
from io import BytesIO
from utils.logger import log

class StreamingEngine:
    def __init__(self, ws_client):
        self.ws = ws_client
        self.is_streaming = False
        self.fps = 2 # Оптимально для AI-анализа
        self._task = None

    async def start_stream(self, uid):
        if self.is_streaming: return
        self.is_streaming = True
        log.info(f"Starting Live Stream for UID {uid}")
        self._task = asyncio.create_task(self._stream_loop(uid))

    async def stop_stream(self):
        self.is_streaming = False
        if self._task:
            self._task.cancel()
            log.info("Live Stream stopped")

    async def _stream_loop(self, uid):
        while self.is_streaming:
            try:
                # Capture
                screenshot = pyautogui.screenshot()
                # Resize for bandwidth efficiency
                screenshot.thumbnail((1024, 768))
                
                buf = BytesIO()
                screenshot.save(buf, format="JPEG", quality=70)
                img_str = base64.b64encode(buf.getvalue()).decode()

                # Send via WebSocket
                await self.ws.send(json.dumps({
                    "type": "screen_frame",
                    "uid": uid,
                    "data": img_str,
                    "ts": time.time()
                }))
                
                await asyncio.sleep(1 / self.fps)
            except Exception as e:
                log.error(f"Streaming error: {e}")
                break

# Интегрируется в NexumHolyAgent
