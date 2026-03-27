# NEXUM PC Agent

Allows remote control of your computer through NEXUM Telegram bot.

## Requirements

- Python 3.8+
- Pro plan in NEXUM

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. In Telegram, send `/link` to get your pairing code

3. Run the agent:
```bash
python nexum_agent.py --code ABCD1234 --server wss://your-nexum.railway.app
```

## Capabilities

- `run_cmd` — run shell commands
- `mouse_move` / `mouse_click` — control mouse
- `key_press` / `type_text` — control keyboard
- `file_list` / `file_read` / `file_write` / `file_delete` — file system
- `open_url` — open URL in browser
- `screenshot` — take and send screenshot
- `sysinfo` — system information

## Telegram Commands (Pro only)

- `/link` — get pairing code
- `/devices` — list connected devices
- `/pc` — agent status
- `/run [cmd]` — run command on PC
- `/screenshot` — take screenshot
