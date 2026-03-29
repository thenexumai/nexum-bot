"""Screenshot capability for NEXUM PC Agent."""

import os
import tempfile
from datetime import datetime

SCREENSHOT_DIR = os.path.join(tempfile.gettempdir(), "nexum_screenshots")


def _ensure_dir():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)


async def take_screenshot(output_path: str | None = None) -> str:
    """Take a screenshot and save to file. Returns file path."""
    _ensure_dir()

    if not output_path:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(SCREENSHOT_DIR, f"nexum_{ts}.png")

    # Try multiple backends in order of preference
    error_msgs = []

    # 1. Pillow ImageGrab (Windows/macOS)
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        img.save(output_path, "PNG")
        return output_path
    except Exception as e:
        error_msgs.append(f"PIL: {e}")

    # 2. pyscreenshot (Linux X11)
    try:
        import pyscreenshot as ImageGrab2
        img = ImageGrab2.grab()
        img.save(output_path)
        return output_path
    except Exception as e:
        error_msgs.append(f"pyscreenshot: {e}")

    # 3. scrot via subprocess (Linux fallback)
    try:
        import subprocess
        result = subprocess.run(["scrot", output_path], capture_output=True, timeout=10)
        if result.returncode == 0:
            return output_path
        error_msgs.append(f"scrot: {result.stderr.decode()}")
    except Exception as e:
        error_msgs.append(f"scrot: {e}")

    raise RuntimeError(f"Screenshot failed. Tried: {'; '.join(error_msgs)}")
