"""Safety policies for NEXUM PC Agent."""

import os
import re
import sys

# ── Blocked command patterns ───────────────────────────────────────────────────

BLOCKED_EXACT = {
    "rm -rf /",
    "format c:",
    "del /f /s /q c:\\windows",
    ":(){ :|:& };:",  # fork bomb
}

BLOCKED_PATTERNS = [
    r"^(sudo\s+)?rm\s+-rf\s+/",
    r"mkfs\.",
    r"dd\s+if=.*of=/dev/",
    r"nc\s+.*-e\s+/bin",
    r"curl\s+.*\|\s*(sudo\s+)?bash",
    r"wget\s+.*\|\s*(sudo\s+)?sh",
    r"python[23]?\s+-c\s+.*exec",
]

# ── Blocked paths ──────────────────────────────────────────────────────────────

BLOCKED_PATH_FRAGMENTS_WINDOWS = [
    "windows\\system32",
    "windows\\syswow64",
    "program files\\windows nt",
]

BLOCKED_PATH_FRAGMENTS_UNIX = [
    "/bin/", "/sbin/", "/usr/bin/", "/usr/sbin/",
    "/etc/passwd", "/etc/shadow", "/boot/", "/dev/",
    "/System/", "/Library/System",
]

BLOCKED_PATH_FRAGMENTS_ALL = [
    ".ssh", ".aws", ".gnupg",
    "id_rsa", "id_ed25519", "authorized_keys",
    "credentials", ".env",
]


def is_blocked_command(cmd: str) -> bool:
    """Return True if command should be blocked."""
    cmd_lower = cmd.lower().strip()

    if cmd_lower in BLOCKED_EXACT:
        return True

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, cmd_lower, re.IGNORECASE):
            return True

    return False


def is_safe_path(path: str) -> bool:
    """Return True if path is allowed."""
    expanded = os.path.expandvars(os.path.expanduser(path))
    normalized = os.path.normpath(expanded).lower()

    # Check all-platform fragments
    for fragment in BLOCKED_PATH_FRAGMENTS_ALL:
        if fragment.lower() in normalized:
            return False

    if sys.platform == "win32":
        for fragment in BLOCKED_PATH_FRAGMENTS_WINDOWS:
            if fragment in normalized:
                return False
    else:
        for fragment in BLOCKED_PATH_FRAGMENTS_UNIX:
            if normalized.startswith(fragment) or fragment in normalized:
                return False

    return True


def classify_action(action: str) -> str:
    """Return safety classification: safe | sensitive | dangerous."""
    safe = {"screenshot", "sysinfo", "file_list", "file_read", "browser_navigate", "browser_screenshot", "browser_read"}
    sensitive = {"file_write", "mouse_move", "mouse_click", "keyboard_type", "browser_fill_form"}
    dangerous = {"shell", "file_delete", "browser_form_submit"}

    if action in safe:
        return "safe"
    if action in sensitive:
        return "sensitive"
    if action in dangerous:
        return "dangerous"
    return "unknown"
