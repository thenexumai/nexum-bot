#!/usr/bin/env python3
"""
NEXUM PC Agent — connects your computer to NEXUM bot via WebSocket.
Capabilities: screenshots, mouse/keyboard control, terminal, files,
browser, notifications, HTTP, system info, processes.
"""
import sys, os, subprocess, platform, json, time, threading, base64
import tempfile, pathlib, asyncio

_PLATFORM = platform.system()  # Windows / Darwin / Linux

# ── Auto-install deps ──────────────────────────────────────────────────────────
_REQUIRED = {
    'websockets': 'websockets',
    'psutil':     'psutil',
    'requests':   'requests',
    'PIL':        'pillow',
    'pyautogui':  'pyautogui',
    'pyperclip':  'pyperclip',
}

def _ensure_deps():
    for imp, pkg in _REQUIRED.items():
        try: __import__(imp)
        except ImportError:
            print(f'Installing {pkg}...')
            subprocess.run([sys.executable, '-m', 'pip', 'install', pkg], check=True, capture_output=True)

_ensure_deps()

import websockets, psutil, requests
from PIL import ImageGrab, Image
import pyautogui
import pyperclip

# ── Config ─────────────────────────────────────────────────────────────────────
CONFIG_FILE   = pathlib.Path.home() / '.nexum_agent.json'
PLATFORM_NAME = f'{_PLATFORM} {platform.machine()}'
DEVICE_ID     = platform.node()

def load_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE) as f: return json.load(f)
        except: pass
    return {}

def save_config(cfg: dict):
    with open(CONFIG_FILE, 'w') as f: json.dump(cfg, f, indent=2)

cfg = load_config()

def get_server_url():
    url = cfg.get('server_url', '').strip()
    if not url: url = os.environ.get('NEXUM_SERVER', '').strip()
    if not url:
        print('\nEnter your NEXUM server WebSocket URL')
        print('  Example: wss://nexum-bot-production-ae70.up.railway.app/ws')
        url = input('  URL: ').strip()
        if url: cfg['server_url'] = url; save_config(cfg)
    return url

SERVER_URL = get_server_url()
if not SERVER_URL:
    print('No server URL. Exiting.')
    sys.exit(1)

# ── Screenshot ─────────────────────────────────────────────────────────────────
def take_screenshot(region=None) -> str:
    try:
        img = ImageGrab.grab(bbox=region) if (region and len(region)==4) else ImageGrab.grab()
        w, h = img.size
        if w > 1920:
            ratio = 1920/w; img = img.resize((int(w*ratio), int(h*ratio)), Image.LANCZOS)
        buf = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        img.save(buf.name, 'PNG', optimize=True)
        with open(buf.name, 'rb') as f: data = base64.b64encode(f.read()).decode()
        os.unlink(buf.name)
        return data
    except Exception as e: raise RuntimeError(f'Screenshot failed: {e}')

# ── Run command ────────────────────────────────────────────────────────────────
def run_command(cmd: str, timeout=30) -> str:
    try:
        shell = True
        result = subprocess.run(cmd, shell=shell, capture_output=True, text=True, timeout=timeout)
        out = (result.stdout + result.stderr).strip()
        return out[:4000] if out else '(no output)'
    except subprocess.TimeoutExpired: return f'Command timed out after {timeout}s'
    except Exception as e: return f'Error: {e}'

# ── System info ────────────────────────────────────────────────────────────────
def get_sysinfo() -> str:
    try:
        cpu = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        return (
            f'Platform: {PLATFORM_NAME}\n'
            f'CPU: {cpu}%\n'
            f'RAM: {mem.percent}% ({round(mem.used/1e9,1)}GB / {round(mem.total/1e9,1)}GB)\n'
            f'Disk: {disk.percent}% ({round(disk.used/1e9,1)}GB / {round(disk.total/1e9,1)}GB)\n'
            f'Boot: {time.ctime(psutil.boot_time())}'
        )
    except Exception as e: return f'Error: {e}'

# ── Process list ───────────────────────────────────────────────────────────────
def get_processes(limit=20) -> str:
    try:
        procs = sorted(psutil.process_iter(['pid','name','cpu_percent','memory_percent']),
                      key=lambda p: p.info['cpu_percent'] or 0, reverse=True)
        lines = [f"{p.info['pid']:6d}  {(p.info['cpu_percent'] or 0):5.1f}%  {(p.info['memory_percent'] or 0):5.1f}%  {p.info['name']}" for p in procs[:limit]]
        return 'PID     CPU    MEM    NAME\n' + '\n'.join(lines)
    except Exception as e: return f'Error: {e}'

# ── Kill process ───────────────────────────────────────────────────────────────
def kill_process(target: str) -> str:
    killed = []
    for p in psutil.process_iter(['pid','name']):
        try:
            if target.isdigit():
                if p.pid == int(target): p.kill(); killed.append(str(p.pid))
            elif target.lower() in p.name().lower():
                p.kill(); killed.append(p.name())
        except: pass
    return f'Killed: {", ".join(killed)}' if killed else f'Process not found: {target}'

# ── File operations ────────────────────────────────────────────────────────────
def file_op(op: str, path: str, content: str = '') -> str:
    try:
        p = pathlib.Path(os.path.expanduser(path))
        if op == 'list':
            items = list(p.iterdir()) if p.is_dir() else []
            return '\n'.join(f"{'[D]' if i.is_dir() else '[F]'} {i.name}" for i in sorted(items)[:50])
        elif op == 'read':
            return p.read_text(encoding='utf-8', errors='replace')[:3000]
        elif op == 'write':
            p.parent.mkdir(parents=True, exist_ok=True); p.write_text(content, encoding='utf-8'); return f'Written: {path}'
        elif op == 'delete':
            p.unlink() if p.is_file() else __import__('shutil').rmtree(p); return f'Deleted: {path}'
        else: return f'Unknown op: {op}'
    except Exception as e: return f'Error: {e}'

# ── Clipboard ──────────────────────────────────────────────────────────────────
def get_clipboard() -> str:
    try: return pyperclip.paste()[:2000]
    except Exception as e: return f'Error: {e}'

def set_clipboard(text: str) -> str:
    try: pyperclip.copy(text); return 'Clipboard set'
    except Exception as e: return f'Error: {e}'

# ── Notification ───────────────────────────────────────────────────────────────
def send_notification(title: str, message: str) -> str:
    try:
        if _PLATFORM == 'Darwin':
            subprocess.run(['osascript', '-e', f'display notification "{message}" with title "{title}"'])
        elif _PLATFORM == 'Windows':
            subprocess.run(['powershell', '-command', f'[System.Windows.Forms.MessageBox]::Show("{message}", "{title}")'])
        else:
            subprocess.run(['notify-send', title, message])
        return 'Notification sent'
    except Exception as e: return f'Error: {e}'

# ── Mouse / Keyboard ───────────────────────────────────────────────────────────
def mouse_action(action: str, x: int = 0, y: int = 0) -> str:
    try:
        pyautogui.FAILSAFE = False
        if action == 'move': pyautogui.moveTo(x, y)
        elif action == 'click': pyautogui.click(x, y)
        elif action == 'right_click': pyautogui.rightClick(x, y)
        elif action == 'double_click': pyautogui.doubleClick(x, y)
        elif action == 'drag': pyautogui.dragTo(x, y, duration=0.5)
        elif action == 'position':
            pos = pyautogui.position()
            return f'Mouse: {pos.x},{pos.y}'
        return f'Mouse {action} at ({x},{y})'
    except Exception as e: return f'Error: {e}'

def keyboard_type(text: str) -> str:
    try: pyautogui.write(text, interval=0.02); return f'Typed: {text[:50]}'
    except Exception as e: return f'Error: {e}'

def hotkey(combo: str) -> str:
    try:
        keys = [k.strip() for k in combo.split('+')]
        pyautogui.hotkey(*keys)
        return f'Hotkey: {combo}'
    except Exception as e: return f'Error: {e}'

# ── Browser / App ──────────────────────────────────────────────────────────────
def open_url(url: str) -> str:
    try: import webbrowser; webbrowser.open(url); return f'Opened: {url}'
    except Exception as e: return f'Error: {e}'

def open_app(name: str) -> str:
    try:
        if _PLATFORM == 'Darwin': subprocess.Popen(['open', '-a', name])
        elif _PLATFORM == 'Windows': subprocess.Popen(['start', name], shell=True)
        else: subprocess.Popen([name])
        return f'Opened: {name}'
    except Exception as e: return f'Error: {e}'

# ── HTTP request ───────────────────────────────────────────────────────────────
def http_request(method: str, url: str, body: str = '') -> str:
    try:
        r = requests.request(method.upper(), url, json=json.loads(body) if body else None, timeout=15)
        return f'Status: {r.status_code}\n{r.text[:2000]}'
    except Exception as e: return f'Error: {e}'

# ── Network info ───────────────────────────────────────────────────────────────
def get_network() -> str:
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_io_counters()
        ifaces = []
        for name, addrs_list in addrs.items():
            for addr in addrs_list:
                if addr.family == 2:  # IPv4
                    ifaces.append(f'{name}: {addr.address}')
        return '\n'.join(ifaces[:10]) + f'\nSent: {round(stats.bytes_sent/1e6,1)}MB  Recv: {round(stats.bytes_recv/1e6,1)}MB'
    except Exception as e: return f'Error: {e}'

# ── Window management (macOS/Windows) ─────────────────────────────────────────
def window_op(op: str) -> str:
    try:
        if _PLATFORM == 'Darwin':
            scripts = {
                'list':     'tell application "System Events" to get name of every process whose background only is false',
                'minimize': 'tell application "System Events" to keystroke "m" using command down',
                'fullscreen': 'tell application "System Events" to keystroke "f" using {command down, control down}',
            }
            if op in scripts:
                r = subprocess.run(['osascript', '-e', scripts[op]], capture_output=True, text=True)
                return r.stdout.strip() or r.stderr.strip() or 'Done'
        return run_command(f'xdotool {op}' if _PLATFORM == 'Linux' else 'Not supported')
    except Exception as e: return f'Error: {e}'

# ── WebSocket Agent ────────────────────────────────────────────────────────────
uid = cfg.get('uid')
linked = bool(uid)

async def handle_message(ws, msg: dict) -> dict:
    mtype = msg.get('type')
    reqId = msg.get('reqId', '')

    if mtype == 'run':
        output = run_command(msg.get('command', ''))
        return {'type': 'result', 'reqId': reqId, 'output': output}

    elif mtype == 'screenshot':
        data = take_screenshot(msg.get('region'))
        return {'type': 'screenshot_result', 'reqId': reqId, 'data': data}

    elif mtype == 'sysinfo':
        return {'type': 'result', 'reqId': reqId, 'output': get_sysinfo()}

    elif mtype == 'ps':
        return {'type': 'result', 'reqId': reqId, 'output': get_processes()}

    elif mtype == 'kill':
        return {'type': 'result', 'reqId': reqId, 'output': kill_process(msg.get('target', ''))}

    elif mtype == 'files':
        return {'type': 'result', 'reqId': reqId, 'output': file_op(msg.get('op','list'), msg.get('path','~'), msg.get('content',''))}

    elif mtype == 'clipboard':
        action = msg.get('action', 'get')
        output = set_clipboard(msg.get('text','')) if action == 'set' else get_clipboard()
        return {'type': 'result', 'reqId': reqId, 'output': output}

    elif mtype == 'notify':
        parts = msg.get('message', '').split('|', 1)
        return {'type': 'result', 'reqId': reqId, 'output': send_notification(parts[0], parts[1] if len(parts)>1 else parts[0])}

    elif mtype == 'mouse':
        return {'type': 'result', 'reqId': reqId, 'output': mouse_action(msg.get('action','click'), msg.get('x',0), msg.get('y',0))}

    elif mtype == 'keyboard':
        return {'type': 'result', 'reqId': reqId, 'output': keyboard_type(msg.get('text',''))}

    elif mtype == 'hotkey':
        return {'type': 'result', 'reqId': reqId, 'output': hotkey(msg.get('combo',''))}

    elif mtype == 'browser':
        return {'type': 'result', 'reqId': reqId, 'output': open_url(msg.get('url',''))}

    elif mtype == 'openapp':
        return {'type': 'result', 'reqId': reqId, 'output': open_app(msg.get('name',''))}

    elif mtype == 'http':
        return {'type': 'result', 'reqId': reqId, 'output': http_request(msg.get('method','GET'), msg.get('url',''), msg.get('body',''))}

    elif mtype == 'network':
        return {'type': 'result', 'reqId': reqId, 'output': get_network()}

    elif mtype == 'window':
        return {'type': 'result', 'reqId': reqId, 'output': window_op(msg.get('op','list'))}

    elif mtype == 'ping':
        return {'type': 'pong'}

    elif mtype == 'linked':
        global uid, linked
        uid = msg.get('uid')
        linked = True
        cfg['uid'] = uid; save_config(cfg)
        print(f'Linked to Telegram user {uid}')
        return None

    return {'type': 'error', 'reqId': reqId, 'message': f'Unknown type: {mtype}'}


async def run():
    global uid, linked
    print(f'NEXUM Agent starting...')
    print(f'Device: {DEVICE_ID}  Platform: {PLATFORM_NAME}')
    print(f'Server: {SERVER_URL}')

    while True:
        try:
            async with websockets.connect(SERVER_URL, ping_interval=30, ping_timeout=10) as ws:
                print('Connected to NEXUM server')

                if not linked:
                    # Request link code
                    await ws.send(json.dumps({'type': 'request_link', 'device_id': DEVICE_ID, 'platform': PLATFORM_NAME}))
                    resp = json.loads(await ws.recv())
                    code = resp.get('code', '')
                    print(f'\nPairing code: {code}')
                    print('Send /link in your Telegram bot, then enter this code\n')

                    # Wait for link
                    msg = json.loads(await ws.recv())
                    if msg.get('type') == 'linked':
                        uid = msg.get('uid')
                        linked = True
                        cfg['uid'] = uid; save_config(cfg)
                        print(f'Linked to Telegram user {uid}')

                # Register
                if uid:
                    await ws.send(json.dumps({'type': 'register', 'uid': uid, 'device_id': DEVICE_ID, 'platform': PLATFORM_NAME}))
                    print(f'Agent registered (uid={uid}). Waiting for commands...')

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        result = await handle_message(ws, msg)
                        if result:
                            await ws.send(json.dumps(result))
                    except Exception as e:
                        print(f'Handler error: {e}')

        except Exception as e:
            print(f'Connection error: {e}. Reconnecting in 5s...')
            await asyncio.sleep(5)


if __name__ == '__main__':
    asyncio.run(run())
