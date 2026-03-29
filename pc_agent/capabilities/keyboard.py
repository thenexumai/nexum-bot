"""Keyboard input capability for NEXUM PC Agent."""

import time


def keyboard_type(text: str, interval: float = 0.02) -> None:
    """Type text via keyboard."""
    try:
        import pyautogui
        pyautogui.write(text, interval=interval)
    except ImportError:
        raise RuntimeError("pyautogui not installed. Run: pip install pyautogui")


def keyboard_hotkey(*keys: str) -> None:
    """Press keyboard shortcut (e.g. 'ctrl', 'c')."""
    try:
        import pyautogui
        pyautogui.hotkey(*keys)
    except ImportError:
        raise RuntimeError("pyautogui not installed")


def keyboard_press(key: str) -> None:
    """Press a single key."""
    try:
        import pyautogui
        pyautogui.press(key)
    except ImportError:
        raise RuntimeError("pyautogui not installed")
