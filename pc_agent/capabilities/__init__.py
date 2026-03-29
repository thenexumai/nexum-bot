# NEXUM PC Agent Capabilities
from .screenshot import take_screenshot
from .shell import run_shell
from .filesystem import file_list, file_read, file_write, file_delete
from .system import get_sysinfo
from .mouse import mouse_move, mouse_click
from .keyboard import keyboard_type
from .browser import browser_navigate, browser_screenshot, browser_read_page

__all__ = [
    "take_screenshot", "run_shell",
    "file_list", "file_read", "file_write", "file_delete",
    "get_sysinfo", "mouse_move", "mouse_click", "keyboard_type",
    "browser_navigate", "browser_screenshot", "browser_read_page",
]
