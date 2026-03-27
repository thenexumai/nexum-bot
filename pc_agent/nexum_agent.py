#!/usr/bin/env python3
"""
NEXUM PC Agent — connects to NEXUM backend via WebSocket and executes commands.

Usage:
    python nexum_agent.py --code ABCD1234 --server wss://your-app.railway.app

Requirements:
    pip install websocket-client pyautogui pillow
"""

import json
import time
import base64
import platform
import subprocess
import threading
import uuid
import sys
import os
import argparse
import logging

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
log = logging.getLogger('nexum-agent')

try:
    import websocket
except ImportError:
    print("Install required: pip install websocket-client")
    sys.exit(1)

# ── Optional imports (degrade gracefully) ─────────────────────────────────────

try:
    import pyautogui
    pyautogui.FAILSAFE = True
    HAS_GUI = True
except ImportError:
    HAS_GUI = False
    log.warning("pyautogui not installed — mouse/keyboard control disabled")

try:
    from PIL import ImageGrab
    HAS_SCREENSHOT = True
except ImportError:
    HAS_SCREENSHOT = False
    log.warning("Pillow not installed — screenshots disabled")

# ── Agent config ──────────────────────────────────────────────────────────────

DEVICE_ID = str(uuid.uuid4())[:8].upper()
DEVICE_NAME = platform.node() or 'PC'
PLATFORM = platform.system()

# ── Command handlers ──────────────────────────────────────────────────────────

def handle_run_cmd(params: dict) -> dict:
    cmd = params.get('command', '')
    if not cmd:
        return {'success': False, 'error': 'No command provided'}
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=30
        )
        output = result.stdout or result.stderr or '(no output)'
        return {'success': True, 'data': {'output': output[:4000], 'returncode': result.returncode}}
    except subprocess.TimeoutExpired:
        return {'success': False, 'error': 'Command timed out (30s)'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_mouse_move(params: dict) -> dict:
    if not HAS_GUI:
        return {'success': False, 'error': 'pyautogui not installed'}
    x, y = params.get('x', 0), params.get('y', 0)
    pyautogui.moveTo(x, y, duration=0.3)
    return {'success': True, 'data': {'x': x, 'y': y}}

def handle_mouse_click(params: dict) -> dict:
    if not HAS_GUI:
        return {'success': False, 'error': 'pyautogui not installed'}
    x = params.get('x')
    y = params.get('y')
    button = params.get('button', 'left')
    clicks = params.get('clicks', 1)
    if x is not None and y is not None:
        pyautogui.click(x, y, button=button, clicks=clicks)
    else:
        pyautogui.click(button=button, clicks=clicks)
    return {'success': True}

def handle_key_press(params: dict) -> dict:
    if not HAS_GUI:
        return {'success': False, 'error': 'pyautogui not installed'}
    keys = params.get('keys', '')
    if isinstance(keys, list):
        pyautogui.hotkey(*keys)
    else:
        pyautogui.press(keys)
    return {'success': True}

def handle_type_text(params: dict) -> dict:
    if not HAS_GUI:
        return {'success': False, 'error': 'pyautogui not installed'}
    text = params.get('text', '')
    pyautogui.typewrite(text, interval=0.02)
    return {'success': True}

def handle_file_list(params: dict) -> dict:
    path = params.get('path', os.path.expanduser('~'))
    try:
        items = []
        for entry in os.scandir(path):
            items.append({
                'name': entry.name,
                'is_dir': entry.is_dir(),
                'size': entry.stat().st_size if not entry.is_dir() else 0,
            })
        items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        return {'success': True, 'data': {'path': path, 'items': items[:100]}}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_file_read(params: dict) -> dict:
    path = params.get('path', '')
    if not path:
        return {'success': False, 'error': 'No path provided'}
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read(50_000)
        return {'success': True, 'data': {'content': content}}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_file_write(params: dict) -> dict:
    path = params.get('path', '')
    content = params.get('content', '')
    if not path:
        return {'success': False, 'error': 'No path provided'}
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_file_delete(params: dict) -> dict:
    path = params.get('path', '')
    if not path:
        return {'success': False, 'error': 'No path provided'}
    try:
        os.remove(path)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_open_url(params: dict) -> dict:
    url = params.get('url', '')
    if not url:
        return {'success': False, 'error': 'No URL provided'}
    try:
        import webbrowser
        webbrowser.open(url)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_screenshot(params: dict) -> dict:
    if not HAS_SCREENSHOT:
        # Try system fallback
        try:
            if PLATFORM == 'Darwin':
                tmp = '/tmp/nexum_screenshot.png'
                subprocess.run(['screencapture', '-x', tmp], check=True)
            elif PLATFORM == 'Linux':
                tmp = '/tmp/nexum_screenshot.png'
                subprocess.run(['import', '-window', 'root', tmp], check=True)
            else:
                return {'success': False, 'error': 'Pillow not installed for screenshots'}
            with open(tmp, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode()
            return {'success': True, 'data': {'image': b64}}
        except Exception as e:
            return {'success': False, 'error': f'Screenshot failed: {e}'}

    try:
        screenshot = ImageGrab.grab()
        import io
        buf = io.BytesIO()
        screenshot.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode()
        return {'success': True, 'data': {'image': b64}}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def handle_sysinfo(params: dict) -> dict:
    info = {
        'platform': PLATFORM,
        'node': platform.node(),
        'processor': platform.processor(),
        'python': platform.python_version(),
        'cwd': os.getcwd(),
        'home': os.path.expanduser('~'),
    }
    try:
        import psutil
        info['cpu_percent'] = psutil.cpu_percent(interval=0.5)
        info['ram_total'] = psutil.virtual_memory().total // (1024**2)
        info['ram_used'] = psutil.virtual_memory().used // (1024**2)
        info['disk_free'] = psutil.disk_usage('/').free // (1024**3)
    except ImportError:
        pass
    return {'success': True, 'data': info}

# ── Dispatch ──────────────────────────────────────────────────────────────────

HANDLERS = {
    'run_cmd':     handle_run_cmd,
    'mouse_move':  handle_mouse_move,
    'mouse_click': handle_mouse_click,
    'key_press':   handle_key_press,
    'type_text':   handle_type_text,
    'file_list':   handle_file_list,
    'file_read':   handle_file_read,
    'file_write':  handle_file_write,
    'file_delete': handle_file_delete,
    'open_url':    handle_open_url,
    'screenshot':  handle_screenshot,
    'sysinfo':     handle_sysinfo,
}

def dispatch(command: dict) -> dict:
    action = command.get('action', '')
    params = command.get('params', {})
    command_id = command.get('command_id', '')

    handler = HANDLERS.get(action)
    if not handler:
        result = {'success': False, 'error': f'Unknown action: {action}'}
    else:
        try:
            result = handler(params)
        except Exception as e:
            log.exception(f"Handler error for {action}")
            result = {'success': False, 'error': str(e)}

    result['command_id'] = command_id
    return result

# ── WebSocket client ──────────────────────────────────────────────────────────

class NexumAgent:
    def __init__(self, server_url: str, code: str):
        self.server_url = server_url
        self.code = code
        self.ws = None
        self.running = False

    def _build_ws_url(self) -> str:
        base = self.server_url.rstrip('/')
        return (f"{base}/ws/agent"
                f"?code={self.code}"
                f"&device_id={DEVICE_ID}"
                f"&device_name={DEVICE_NAME}"
                f"&platform={PLATFORM}")

    def on_message(self, ws, message):
        try:
            command = json.loads(message)
            action = command.get('action', '?')
            log.info(f"Command: {action}")
            result = dispatch(command)
            ws.send(json.dumps(result))
        except Exception as e:
            log.error(f"Message error: {e}")

    def on_error(self, ws, error):
        log.error(f"WebSocket error: {error}")

    def on_close(self, ws, close_status_code, close_msg):
        log.info(f"Disconnected: {close_status_code} {close_msg}")
        self.running = False

    def on_open(self, ws):
        log.info(f"Connected to NEXUM as {DEVICE_NAME} ({DEVICE_ID})")
        print(f"\n✅ NEXUM Agent connected!\n   Device: {DEVICE_NAME}\n   Platform: {PLATFORM}\n   Press Ctrl+C to stop\n")
        self.running = True

    def connect(self):
        url = self._build_ws_url()
        log.info(f"Connecting to {self.server_url}...")

        self.ws = websocket.WebSocketApp(
            url,
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
        )

        while True:
            try:
                self.ws.run_forever(ping_interval=30, ping_timeout=10)
            except KeyboardInterrupt:
                print("\n👋 Stopping NEXUM Agent...")
                break
            except Exception as e:
                log.error(f"Connection error: {e}")

            if not self.running:
                log.info("Reconnecting in 5 seconds...")
                time.sleep(5)
            else:
                break

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='NEXUM PC Agent')
    parser.add_argument('--code', required=True, help='Pairing code from /link command')
    parser.add_argument('--server', default='wss://nexum.railway.app', help='NEXUM server URL')
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════╗
║      NEXUM PC Agent v1.0         ║
╚══════════════════════════════════╝
  Device : {DEVICE_NAME}
  Code   : {args.code}
  Server : {args.server}
""")

    agent = NexumAgent(args.server, args.code)
    agent.connect()

if __name__ == '__main__':
    main()
