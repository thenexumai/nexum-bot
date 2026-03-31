import asyncio
import websockets
import json
import os
import argparse
import platform
import uuid
import signal
from utils.logger import log
from voice_gateway import VoiceGateway
from streaming_engine import StreamingEngine
from capabilities.browser import browser_instance as browser

class NexumHolyAgent:
    def __init__(self, server_url, token):
        self.server_url = server_url
        self.token = token
        self.uid = None
        self.ws = None
        self._running = True
        self.voice = None
        self.stream = None

    async def start(self):
        log.info(f"NEXUM Agent v1.0 | OS: {platform.system()}")
        while self._running:
            try:
                await self._connect()
            except Exception as e:
                log.error(f"Link lost: {e}. Retrying in 5s...")
                await asyncio.sleep(5)

    async def _connect(self):
        async with websockets.connect(self.server_url) as ws:
            self.ws = ws
            self.voice = VoiceGateway(ws)
            self.stream = StreamingEngine(ws)

            # Auth
            await ws.send(json.dumps({
                "type": "auth",
                "token": self.token,
                "info": {"os": platform.system(), "hostname": platform.node()}
            }))

            async for message in ws:
                await self._handle_msg(message)

    async def _handle_msg(self, raw):
        try:
            data = json.loads(raw)
        except: return
        msg_type = data.get("type")

        if msg_type == "auth_ok":
            self.uid = data.get("uid")
            log.success(f"Tunnel Established! UID: {self.uid}")
            asyncio.create_task(self.voice.start_listening(self.uid))
            return

        if msg_type == "command":
            action = data.get("action")
            args = data.get("args", {})
            req_id = data.get("requestId")
            
            try:
                result = await self._execute(action, args)
                await self.ws.send(json.dumps({
                    "type": "result", "requestId": req_id, "status": "success", "result": result
                }))
            except Exception as e:
                log.error(f"Command failed: {e}")
                await self.ws.send(json.dumps({
                    "type": "result", "requestId": req_id, "status": "error", "error": str(e)
                }))

    async def _execute(self, action, p):
        log.info(f"Executing: {action}")
        if action == "screenshot":
            # Используем встроенный в браузер скриншот если мы в нем, иначе системный
            state = await browser.get_state()
            return state["screenshot"]
        
        if action == "start_stream":
            await self.stream.start_stream(self.uid)
            return "Stream started"
            
        if action == "browser_navigate":
            return await browser.navigate(p.get("url"))
            
        if action == "browser_click":
            return await browser.click(p.get("nexum_id"))
            
        if action == "browser_type":
            return await browser.type(p.get("nexum_id"), p.get("text"))

        # Fallback to shell
        if action == "shell":
            from capabilities.shell import run_shell
            return await run_shell(p.get("command"))

        return "Action not implemented"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--server", default="ws://localhost:3000")
    args = parser.parse_args()
    
    agent = NexumHolyAgent(args.server, args.token)
    asyncio.run(agent.start())
