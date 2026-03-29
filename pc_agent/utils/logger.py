"""OpenClaw-style colored logger for NEXUM PC Agent."""

import os
import sys
from datetime import datetime

DEBUG = os.environ.get("NEXUM_DEBUG") == "1"

# ANSI colors
RESET  = "\033[0m"
GREY   = "\033[90m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"

_use_colors = sys.stdout.isatty() or os.environ.get("NEXUM_COLOR") == "1"


def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def _fmt(level: str, color: str, msg: str) -> str:
    if _use_colors:
        return f"{GREY}[{_ts()}]{RESET} {color}{BOLD}[{level}]{RESET} {msg}"
    return f"[{_ts()}] [{level}] {msg}"


class Logger:
    def debug(self, msg: str):
        if DEBUG:
            print(_fmt("DEBUG", GREY, msg))

    def info(self, msg: str):
        print(_fmt("INFO", CYAN, msg))

    def success(self, msg: str):
        print(_fmt("OK", GREEN, msg))

    def warn(self, msg: str):
        print(_fmt("WARN", YELLOW, msg), file=sys.stderr)

    def error(self, msg: str):
        print(_fmt("ERROR", RED, msg), file=sys.stderr)


log = Logger()
