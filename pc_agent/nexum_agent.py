#!/usr/bin/env python3
"""
NEXUM PC Agent
Connects to NEXUM server via WebSocket and executes PC capabilities.
Run: python nexum_agent.py --code ABCD1234 --server wss://your-app.railway.app
"""

import argparse
import asyncio
import json
import sys
import signal
from datetime import datetime

try:
    import websockets
except ImportError:
    print("[ERROR] Install dependencies: pip install -r requirements.txt")
    sys.exit(1)

from utils.logger import log
from capabilities.screenshot import take_screenshot
from capabilities.shell import run_shell
from capabilities.filesystem import file_list, file_read, file_write, file_delete
from capabilities.system import get_sysinfo
from capabilities.mouse import mouse_move, mouse_click
from capabilities.keyboard import keyboard_type
from capabilities.browser import browser_navigate, browser_screenshot, browser_read_page
from policies.safety import is_safe_path, is_blocked_command
from state.soul import load_soul

VERSION = "1.0.0"
RECONNECT_DELAY = 5  # seconds
MAX_RECONNECT = 20


class NexumAgent:
    def __init__(self, server_url: str, pairing_code: str):
        self.server_url = server_url
        self.pairing_code = pairing_code
        self.ws = None
        self.running = True
        self.reconnect_count = 0
        self.soul = load_soul()

    async def connect(self):
        """Connect to NEXUM server with auto-reconnect."""
        while self.running and self.reconnect_count < MAX_RECONNECT:
            try:
                log.info(f"Connecting to {self.server_url}...")
                async with websockets.connect(
                    self.server_url,
                    ping_interval=30,
                    ping_timeout=10,
                ) as ws:
                    self.ws = ws
                    self.reconnect_count = 0
                    await self._handshake()
                    await self._listen()
            except websockets.exceptions.ConnectionClosed as e:
                log.warn(f"Connection closed: {e.code} {e.reason}")
            except ConnectionRefusedError:
                log.warn(f"Connection refused — server may be down")
            except Exception as e:
                log.error(f"Connection error: {e}")

            if self.running:
                self.reconnect_count += 1
                delay = min(RECONNECT_DELAY * self.reconnect_count, 60)
                log.info(f"Reconnecting in {delay}s... (attempt {self.reconnect_count}/{MAX_RECONNECT})")
                await asyncio.sleep(delay)

        if self.reconnect_count >= MAX_RECONNECT:
            log.error("Max reconnect attempts reached. Exiting.")

    async def _handshake(self):
        """Authenticate with pairing code."""
        msg = {
            "type": "agent_connect",
            "code": self.pairing_code,
            "version": VERSION,
            "platform": sys.platform,
        }
        await self.ws.send(json.dumps(msg))
        log.info("Handshake sent, waiting for server acknowledgment...")

    async def _listen(self):
        """Main message loop."""
        log.success(f"Connected! Listening for commands...")
        async for raw in self.ws:
            try:
                msg = json.loads(raw)
                await self._handle(msg)
            except json.JSONDecodeError:
                log.error(f"Invalid JSON from server: {raw[:100]}")
            except Exception as e:
                log.error(f"Handler error: {e}")
                await self._send_error(str(e))

    async def _handle(self, msg: dict):
        """Dispatch incoming command to capability handler."""
        cmd_type = msg.get("type")
        cmd_id = msg.get("id")
        payload = msg.get("payload", {})

        log.debug(f"Command [{cmd_type}] id={cmd_id}")

        if cmd_type == "ping":
            await self._send({"type": "pong", "id": cmd_id})
            return

        if cmd_type == "disconnect":
            log.info("Server requested disconnect")
            self.running = False
            return

        handlers = {
            "screenshot": self._cmd_screenshot,
            "sysinfo": self._cmd_sysinfo,
            "shell": self._cmd_shell,
            "file_list": self._cmd_file_list,
            "file_read": self._cmd_file_read,
            "file_write": self._cmd_file_write,
            "file_delete": self._cmd_file_delete,
            "mouse_move": self._cmd_mouse_move,
            "mouse_click": self._cmd_mouse_click,
            "keyboard_type": self._cmd_keyboard_type,
            "browser_navigate": self._cmd_browser_navigate,
            "browser_screenshot": self._cmd_browser_screenshot,
            "browser_read": self._cmd_browser_read,
        }

        handler = handlers.get(cmd_type)
        if not handler:
            await self._send_result(cmd_id, False, f"Unknown command: {cmd_type}")
            return

        try:
            result = await handler(payload)
            await self._send_result(cmd_id, True, result)
        except PermissionError as e:
            log.warn(f"Blocked: {e}")
            await self._send_result(cmd_id, False, f"BLOCKED: {e}")
        except Exception as e:
            log.error(f"Command failed [{cmd_type}]: {e}")
            await self._send_result(cmd_id, False, str(e))

    # ── Handlers ───────────────────────────────────────────────────────────────

    async def _cmd_screenshot(self, p: dict):
        path = await take_screenshot()
        with open(path, "rb") as f:
            import base64
            data = base64.b64encode(f.read()).decode()
        return {"type": "image", "data": data, "format": "png"}

    async def _cmd_sysinfo(self, p: dict):
        return get_sysinfo()

    async def _cmd_shell(self, p: dict):
        cmd = p.get("command", "").strip()
        if not cmd:
            raise ValueError("Empty command")
        if is_blocked_command(cmd):
            raise PermissionError(f"Command is blocked by safety policy")
        timeout = min(int(p.get("timeout", 30)), 60)
        return await run_shell(cmd, timeout=timeout)

    async def _cmd_file_list(self, p: dict):
        path = p.get("path", ".")
        if not is_safe_path(path):
            raise PermissionError(f"Path not allowed: {path}")
        return file_list(path)

    async def _cmd_file_read(self, p: dict):
        path = p.get("path", "")
        if not is_safe_path(path):
            raise PermissionError(f"Path not allowed: {path}")
        return file_read(path)

    async def _cmd_file_write(self, p: dict):
        path = p.get("path", "")
        content = p.get("content", "")
        if not is_safe_path(path):
            raise PermissionError(f"Path not allowed: {path}")
        file_write(path, content)
        return {"ok": True, "path": path}

    async def _cmd_file_delete(self, p: dict):
        path = p.get("path", "")
        if not is_safe_path(path):
            raise PermissionError(f"Path not allowed: {path}")
        file_delete(path)
        return {"ok": True, "path": path}

    async def _cmd_mouse_move(self, p: dict):
        x, y = int(p.get("x", 0)), int(p.get("y", 0))
        mouse_move(x, y)
        return {"ok": True, "x": x, "y": y}

    async def _cmd_mouse_click(self, p: dict):
        x = p.get("x")
        y = p.get("y")
        button = p.get("button", "left")
        if x is not None and y is not None:
            mouse_move(int(x), int(y))
        mouse_click(button=button)
        return {"ok": True}

    async def _cmd_keyboard_type(self, p: dict):
        text = p.get("text", "")
        keyboard_type(text)
        return {"ok": True, "chars": len(text)}

    async def _cmd_browser_navigate(self, p: dict):
        url = p.get("url", "")
        return await browser_navigate(url)

    async def _cmd_browser_screenshot(self, p: dict):
        url = p.get("url")
        data = await browser_screenshot(url)
        return {"type": "image", "data": data, "format": "png"}

    async def _cmd_browser_read(self, p: dict):
        url = p.get("url", "")
        return await browser_read_page(url)

    # ── Helpers ────────────────────────────────────────────────────────────────

    async def _send(self, msg: dict):
        if self.ws:
            await self.ws.send(json.dumps(msg))

    async def _send_result(self, cmd_id: str | None, ok: bool, data):
        await self._send({
            "type": "result",
            "id": cmd_id,
            "ok": ok,
            "data": data,
            "ts": datetime.utcnow().isoformat(),
        })

    async def _send_error(self, error: str):
        await self._send({"type": "error", "message": error})

    def stop(self):
        self.running = False
        if self.ws:
            asyncio.create_task(self.ws.close())


def main():
    parser = argparse.ArgumentParser(description="NEXUM PC Agent")
    parser.add_argument("--code", required=True, help="Pairing code from /link command")
    parser.add_argument("--server", required=True, help="NEXUM WebSocket URL (wss://...)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.debug:
        import os
        os.environ["NEXUM_DEBUG"] = "1"

    print(f"""
╔══════════════════════════════════════╗
║     NEXUM PC Agent v{VERSION}          ║
║  Connecting to: {args.server[:24]}...  ║
╚══════════════════════════════════════╝
""")

    agent = NexumAgent(args.server, args.code)

    def handle_signal(sig, frame):
        log.info("Shutting down...")
        agent.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    asyncio.run(agent.connect())


if __name__ == "__main__":
    main()
