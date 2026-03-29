"""PC Agent local state — soul and workspace."""

import json
import os

STATE_DIR = os.path.join(os.path.dirname(__file__))
SOUL_FILE = os.path.join(STATE_DIR, "soul.json")
USER_FILE = os.path.join(STATE_DIR, "user.json")
WORKSPACE_FILE = os.path.join(STATE_DIR, "workspace.json")

DEFAULT_SOUL = {
    "name": "NEXUM Agent",
    "version": "1.0.0",
    "role": "PC Control Agent",
    "connected_to": None,
    "session_start": None,
}

DEFAULT_WORKSPACE = {
    "allowed_paths": ["~/", "~/Desktop", "~/Documents", "~/Downloads"],
    "last_active_path": "~/",
    "shell": "auto",
}


def load_soul() -> dict:
    try:
        with open(SOUL_FILE) as f:
            return {**DEFAULT_SOUL, **json.load(f)}
    except Exception:
        return DEFAULT_SOUL


def save_soul(data: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(SOUL_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_workspace() -> dict:
    try:
        with open(WORKSPACE_FILE) as f:
            return {**DEFAULT_WORKSPACE, **json.load(f)}
    except Exception:
        return DEFAULT_WORKSPACE
