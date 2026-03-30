#!/usr/bin/env python3
"""
NEXUM PC Agent v1.0
Connects to NEXUM server via WebSocket and executes AI commands on this machine.

Usage:
    python nexum_agent.py --token <TOKEN> --server wss://yourapp.railway.app
    
Get token from Telegram bot: /link_pc
"""

import asyncio
import websockets
import json
import os
import sys
import argparse
import platform
import uuid
import base64
import signal
from io import BytesIO

# Capability imports
try:
    import pyautogui
    from PIL import Image
    HAS_GUI = True
except ImportError:
    HAS_GUI = False
    print("[WARN] pyautogui/PIL not installed — screenshot/mouse/keyboard disabled")

from capabilities import (
    run_shell, file_list, file_read, file_write, file_delete, get_sysinfo
)
from utils.logger import log


# ============================================================
#  NEXUM AGENT
# ============================================================

class NexumAgent:
    def __init__(self, server_url: str, token: str):
        self.server_url = server_url
        self.token = token
        self.uid = None
        self.device_id = str(uuid.uuid4())[:8]
        self.ws = None
        self._running = True

    async def start(self):
        log.info(f"NEXUM Agent v1.0 | Device: {self.device_id} | OS: {platform.system()} {platform.release()}")
        log.info(f"Connecting to {self.server_url} ...")
        while self._running:
            try:
                await self._connect()
            except Exception as e:
                log.error(f"Connection lost: {e}")
                if self._running:
                    log.info("Reconnecting in 5s...")
                    await asyncio.sleep(5)

    async def _connect(self):
        async with websockets.connect(
            self.server_url,
            ping_interval=20,
            ping_timeout=10,
            extra_headers={"User-Agent": f"NEXUM-Agent/1.0 ({platform.system()})"}
        ) as ws:
            self.ws = ws

            # Authenticate with one-time token
            await ws.send(json.dumps({
                "type": "auth",
                "token": self.token,
                "info": {
                    "os": platform.system(),
                    "os_version": platform.release(),
                    "hostname": platform.node(),
                    "device_id": self.device_id,
                    "has_gui": HAS_GUI,
                }
            }))

            log.info("Auth sent, waiting for server response...")

            async for raw in ws:
                await self._handle(raw)

    async def _handle(self, raw: str):
        try:
            msg = json.loads(raw)
        except Exception:
            log.warn(f"Invalid JSON received: {raw[:100]}")
            return

        msg_type = msg.get("type")

        if msg_type == "auth_ok":
            self.uid = msg.get("uid")
            log.success(f"✅ Authenticated! UID={self.uid} | NEXUM Tunnel is LIVE")
            return

        if msg_type == "auth_error":
            log.error(f"❌ Auth failed: {msg.get('message')}")
            log.error("Get a new token with /link_pc in Telegram")
            self._running = False
            return

        if msg_type == "command":
            action = msg.get("action")
            args = msg.get("args", {})
            req_id = msg.get("requestId")
            log.info(f"← Command: {action}")

            try:
                result = await self._execute(action, args)
                await self.ws.send(json.dumps({
                    "type": "result",
                    "requestId": req_id,
                    "status": "success",
                    "result": result
                }))
                log.success(f"→ {action} OK")
            except Exception as e:
                log.error(f"→ {action} FAILED: {e}")
                await self.ws.send(json.dumps({
                    "type": "result",
                    "requestId": req_id,
                    "status": "error",
                    "error": str(e)
                }))

        if msg_type == "ping":
            await self.ws.send(json.dumps({"type": "pong"}))

    async def _execute(self, action: str, p: dict):
        # ── Screenshot ──────────────────────────────────────────
        if action == "screenshot":
            if not HAS_GUI:
                raise Exception("GUI not available on this system")
            shot = pyautogui.screenshot()
            buf = BytesIO()
            shot.save(buf, format="PNG")
            return {"image_b64": base64.b64encode(buf.getvalue()).decode(), "format": "PNG"}

        # ── Shell ───────────────────────────────────────────────
        if action == "shell":
            cmd = p.get("command", "")
            if not cmd:
                raise Exception("No command provided")
            return await run_shell(cmd)

        # ── Mouse ───────────────────────────────────────────────
        if action == "mouse_move":
            if not HAS_GUI: raise Exception("GUI not available")
            pyautogui.moveTo(p.get("x", 0), p.get("y", 0), duration=0.2)
            return "ok"

        if action == "click":
            if not HAS_GUI: raise Exception("GUI not available")
            button = p.get("button", "left")
            double = p.get("double", False)
            x, y = p.get("x"), p.get("y")
            if x is not None and y is not None:
                pyautogui.moveTo(x, y, duration=0.2)
            if double:
                pyautogui.doubleClick(button=button)
            else:
                pyautogui.click(button=button)
            return "ok"

        # ── Keyboard ────────────────────────────────────────────
        if action == "type_text":
            if not HAS_GUI: raise Exception("GUI not available")
            text = p.get("text", "")
            pyautogui.write(text, interval=0.03)
            return "ok"

        if action == "key_press":
            if not HAS_GUI: raise Exception("GUI not available")
            key = p.get("key", "")
            pyautogui.press(key)
            return "ok"

        # ── File System ─────────────────────────────────────────
        if action == "list_files":
            return await file_list(p.get("path", os.path.expanduser("~")))

        if action == "read_file":
            return await file_read(p.get("path"))

        if action == "write_file":
            return await file_write(p.get("path"), p.get("content", ""))

        if action == "delete_file":
            return await file_delete(p.get("path"))

        # ── System ──────────────────────────────────────────────
        if action == "sysinfo":
            return await get_sysinfo()

        raise Exception(f"Unknown action: {action}")


# ============================================================
#  ENTRY POINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="NEXUM PC Agent — connects your PC to NEXUM AI via Telegram"
    )
    parser.add_argument(
        "--token", required=True,
        help="One-time auth token from /link_pc in Telegram"
    )
    parser.add_argument(
        "--server",
        default=os.environ.get("NEXUM_SERVER", "wss://nexum-production.up.railway.app"),
        help="NEXUM WebSocket server URL (default: Railway deployment)"
    )
    args = parser.parse_args()

    agent = NexumAgent(server_url=args.server, token=args.token)

    # Graceful shutdown
    def shutdown(sig, frame):
        print("\n[NEXUM] Shutting down...")
        agent._running = False
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        asyncio.run(agent.start())
    except KeyboardInterrupt:
        print("\n[NEXUM] Bye!")


if __name__ == "__main__":
    main()
