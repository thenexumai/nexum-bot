"""
NEXUM PC Agent — Blocked Commands
Shell commands that are always denied regardless of user approval.
"""

import re
from typing import Tuple, List

# ── Command blacklist ─────────────────────────────────────────────────────────

BLOCKED_PATTERNS: List[re.Pattern] = [
    # Destructive filesystem
    re.compile(r"^rm\s+-[rRf]*f[rR]?\s+/"),
    re.compile(r"^rmdir\s+/"),
    re.compile(r"^mkfs"),
    re.compile(r"^dd\s+if="),
    # Windows destructive
    re.compile(r"(?i)^format\s+[a-z]:"),
    re.compile(r"(?i)^del\s+/[sf]"),
    re.compile(r"(?i)^rd\s+/s\s+/q\s+C:\\Windows"),
    # System shutdown/reboot
    re.compile(r"^(shutdown|reboot|halt|poweroff|init\s+0)"),
    re.compile(r"(?i)^shutdown\s+(/r|/s|/t)"),
    # Fork bomb
    re.compile(r":\(\)\{.*\}"),
    re.compile(r"\(\)\s*\{[^}]*\(\)"),
    # Pipe to shell (code execution)
    re.compile(r"curl[^|]+\|\s*(ba)?sh"),
    re.compile(r"wget[^|]+\|\s*(ba)?sh"),
    re.compile(r"python\s+-c\s+['\"].*exec"),
    # Sensitive file access
    re.compile(r"cat\s+/etc/(shadow|passwd|sudoers)"),
    re.compile(r"cat\s+.*id_rsa"),
    # Overwrite disk
    re.compile(r">\s*/dev/s[da-z]"),
    re.compile(r">\s*/dev/nvme"),
]

# ── Suspicious patterns (warn but allow if user approves) ─────────────────────

SUSPICIOUS_PATTERNS: List[re.Pattern] = [
    re.compile(r"sudo\s+"),
    re.compile(r"su\s+-"),
    re.compile(r"chmod\s+777"),
    re.compile(r"chown\s+root"),
    re.compile(r"iptables"),
    re.compile(r"nc\s+-l"),   # netcat listener
    re.compile(r"nmap\s+"),
]


def is_blocked(command: str) -> Tuple[bool, str]:
    """
    Returns (blocked, reason).
    True = command is absolutely blocked, no override possible.
    """
    cmd = command.strip()
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(cmd):
            return True, f"Command matches blocked pattern: {pattern.pattern}"
    return False, ""


def is_suspicious(command: str) -> Tuple[bool, str]:
    """
    Returns (suspicious, reason).
    Suspicious commands should still go through approval flow.
    """
    cmd = command.strip()
    for pattern in SUSPICIOUS_PATTERNS:
        if pattern.search(cmd):
            return True, f"Command requires elevated privileges: {pattern.pattern}"
    return False, ""
