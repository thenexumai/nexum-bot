"""System information capability for NEXUM PC Agent."""

import os
import sys
import platform


def get_sysinfo() -> dict:
    """Get system information."""
    info: dict = {
        "os": platform.system(),
        "os_version": platform.version(),
        "arch": platform.machine(),
        "hostname": platform.node(),
        "python": platform.python_version(),
    }

    # CPU
    try:
        import psutil
        info["cpu_percent"] = psutil.cpu_percent(interval=0.5)
        info["cpu_cores"] = psutil.cpu_count()
        mem = psutil.virtual_memory()
        info["ram_total_gb"] = round(mem.total / 1e9, 1)
        info["ram_used_gb"] = round(mem.used / 1e9, 1)
        info["ram_percent"] = mem.percent
        disk = psutil.disk_usage("/")
        info["disk_total_gb"] = round(disk.total / 1e9, 1)
        info["disk_free_gb"] = round(disk.free / 1e9, 1)
        info["disk_percent"] = round(disk.percent, 1)
    except ImportError:
        info["note"] = "Install psutil for full system info"

    # Screen resolution
    try:
        if sys.platform == "win32":
            import ctypes
            user32 = ctypes.windll.user32
            info["screen"] = f"{user32.GetSystemMetrics(0)}x{user32.GetSystemMetrics(1)}"
        else:
            import subprocess
            result = subprocess.run(["xdpyinfo"], capture_output=True, text=True, timeout=5)
            for line in result.stdout.split("\n"):
                if "dimensions" in line:
                    info["screen"] = line.strip().split()[1]
                    break
    except Exception:
        pass

    return info
