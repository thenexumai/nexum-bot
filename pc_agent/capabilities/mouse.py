"""Mouse control capability for NEXUM PC Agent."""


def mouse_move(x: int, y: int) -> None:
    """Move mouse to absolute coordinates."""
    try:
        import pyautogui
        pyautogui.moveTo(x, y, duration=0.2)
    except ImportError:
        raise RuntimeError("pyautogui not installed. Run: pip install pyautogui")


def mouse_click(button: str = "left", clicks: int = 1) -> None:
    """Click mouse at current position."""
    try:
        import pyautogui
        pyautogui.click(button=button, clicks=clicks)
    except ImportError:
        raise RuntimeError("pyautogui not installed. Run: pip install pyautogui")


def mouse_scroll(x: int, y: int, amount: int = 3) -> None:
    """Scroll at position."""
    try:
        import pyautogui
        pyautogui.scroll(amount, x=x, y=y)
    except ImportError:
        raise RuntimeError("pyautogui not installed")
