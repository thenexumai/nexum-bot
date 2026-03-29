"""
NEXUM PC Agent — Path Policy
Blocks access to sensitive system directories.
"""

import os
import re
from pathlib import Path
from typing import Tuple

# ── Blocked patterns ──────────────────────────────────────────────────────────

BLOCKED_PATTERNS = [
    # Unix
    r"^/bin", r"^/sbin", r"^/usr/bin", r"^/usr/sbin",
    r"^/System", r"^/Library/System", r"^/private/etc",
    r"^/etc/shadow", r"^/etc/sudoers", r"^/etc/passwd",
    # Windows
    r"(?i)^C:\\Windows\\System32",
    r"(?i)^C:\\Windows\\SysWOW64",
    r"(?i)^C:\\Windows\\WinSxS",
    # Sensitive config
    r"[/\\]\.ssh[/\\]",
    r"[/\\]\.aws[/\\]",
    r"[/\\]\.gnupg[/\\]",
    # Key files
    r"id_rsa$", r"id_ecdsa$", r"id_ed25519$",
    r"\.pem$", r"\.key$",
    # Crypto wallets
    r"wallet\.dat", r"keystore[/\\]",
]

_compiled = [re.compile(p) for p in BLOCKED_PATTERNS]

# ── Allowed workspace roots ───────────────────────────────────────────────────

HOME = Path.home()

ALLOWED_ROOTS = [
    HOME / "Desktop",
    HOME / "Documents",
    HOME / "Downloads",
    HOME / "nexum-workspace",
    Path("/tmp"),
]


def check_path(file_path: str) -> Tuple[bool, str]:
    """
    Returns (allowed, reason).
    True = access permitted, False = access denied.
    """
    try:
        normalized = os.path.normpath(file_path)
    except Exception:
        return False, "Invalid path"

    # Check for path traversal
    if ".." in file_path:
        return False, "Path traversal attempt detected"

    # Check blocked patterns
    for pattern in _compiled:
        if pattern.search(normalized):
            return False, f"Path is in a protected location: {normalized}"

    return True, "OK"


def is_in_workspace(file_path: str) -> bool:
    """Returns True if path is within allowed workspace roots."""
    try:
        p = Path(file_path).resolve()
        return any(str(p).startswith(str(root)) for root in ALLOWED_ROOTS)
    except Exception:
        return False


def sanitize_path(file_path: str) -> str:
    """Remove null bytes and dangerous characters."""
    return file_path.replace("\0", "").strip()
