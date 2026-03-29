"""
NEXUM PC Agent — WebSocket client
Handles connection to NEXUM server, auto-reconnect, command dispatching.
"""

import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any, Callable, Awaitable

try:
    import websockets
    from websockets.exceptions import ConnectionClosed, WebSocketException
except ImportError:
    raise ImportError("websockets not installed. Run: pip install websockets")

logger = logging.getLogger("nexum.ws")

CommandHandler = Callable[[str, Dict[str, Any]], Awaitable[Any]]


class NexumWebSocketClient:
    """
    Persistent WebSocket client with auto-reconnect.
    Handles the protocol between pc_agent and NEXUM server.
    """

    def __init__(
        self,
        server_url: str,
        link_code: str,
        device_id: str,
        device_name: str,
        platform: str,
    ):
        self.server_url = server_url
        self.link_code = link_code
        self.device_id = device_id
        self.device_name = device_name
        self.platform = platform

        self._ws: Optional[Any] = None
        self._connected = False
        self._running = False
        self._handlers: Dict[str, CommandHandler] = {}
        self._reconnect_delay = 2.0
        self._max_delay = 60.0
        self._ping_interval = 30.0

    # ── Registration ───────────────────────────────────────────────────────────

    def on(self, command: str, handler: CommandHandler) -> None:
        """Register a handler for a specific command type."""
        self._handlers[command] = handler

    # ── Connection ─────────────────────────────────────────────────────────────

    def _build_url(self) -> str:
        from urllib.parse import urlencode
        params = urlencode({
            "code": self.link_code,
            "device_id": self.device_id,
            "device_name": self.device_name,
            "platform": self.platform,
        })
        base = self.server_url.rstrip("/")
        return f"{base}/ws?{params}"

    async def connect(self) -> None:
        """Start the client — connects and auto-reconnects indefinitely."""
        self._running = True
        delay = self._reconnect_delay

        while self._running:
            try:
                url = self._build_url()
                logger.info(f"Connecting to {self.server_url} ...")

                async with websockets.connect(
                    url,
                    ping_interval=self._ping_interval,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    self._connected = True
                    delay = self._reconnect_delay  # reset on success
                    logger.info("✅ Connected to NEXUM server")

                    await self._send({"type": "hello", "agent_version": "1.0.0"})
                    await self._message_loop(ws)

            except ConnectionClosed as e:
                logger.warning(f"Connection closed: {e}")
            except WebSocketException as e:
                logger.error(f"WebSocket error: {e}")
            except OSError as e:
                logger.error(f"Network error: {e}")
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
            finally:
                self._connected = False
                self._ws = None

            if not self._running:
                break

            logger.info(f"Reconnecting in {delay:.0f}s ...")
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, self._max_delay)

    async def _message_loop(self, ws: Any) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
                await self._dispatch(msg)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON: {raw[:100]}")
            except Exception as e:
                logger.error(f"Dispatch error: {e}")

    async def _dispatch(self, msg: Dict[str, Any]) -> None:
        cmd_type = msg.get("type", "")
        cmd_id = msg.get("id")
        payload = msg.get("payload", {})

        handler = self._handlers.get(cmd_type)
        if not handler:
            logger.debug(f"No handler for command: {cmd_type}")
            if cmd_id:
                await self._send({"type": "error", "id": cmd_id, "error": f"Unknown command: {cmd_type}"})
            return

        try:
            result = await handler(cmd_type, payload)
            if cmd_id:
                await self._send({"type": "result", "id": cmd_id, "result": result})
        except Exception as e:
            logger.error(f"Handler error for {cmd_type}: {e}")
            if cmd_id:
                await self._send({"type": "error", "id": cmd_id, "error": str(e)})

    # ── Sending ────────────────────────────────────────────────────────────────

    async def _send(self, data: Dict[str, Any]) -> None:
        if self._ws and self._connected:
            try:
                await self._ws.send(json.dumps(data))
            except Exception as e:
                logger.error(f"Send failed: {e}")

    async def send_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Send an unsolicited event to the server (e.g., status updates)."""
        await self._send({"type": event_type, "data": data, "ts": time.time()})

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def stop(self) -> None:
        """Stop the client."""
        self._running = False

    @property
    def is_connected(self) -> bool:
        return self._connected
