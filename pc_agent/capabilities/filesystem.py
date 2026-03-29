"""Filesystem capabilities for NEXUM PC Agent."""

import os
import shutil
from datetime import datetime
from typing import Any


def file_list(path: str) -> dict:
    """List files and directories at path."""
    expanded = os.path.expandvars(os.path.expanduser(path))
    if not os.path.exists(expanded):
        raise FileNotFoundError(f"Path not found: {path}")

    entries = []
    for name in sorted(os.listdir(expanded)):
        full = os.path.join(expanded, name)
        try:
            stat = os.stat(full)
            entries.append({
                "name": name,
                "type": "dir" if os.path.isdir(full) else "file",
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
        except PermissionError:
            entries.append({"name": name, "type": "unknown", "error": "permission denied"})

    return {"path": expanded, "entries": entries, "count": len(entries)}


def file_read(path: str, max_bytes: int = 512_000) -> dict:
    """Read file contents (max 512KB)."""
    expanded = os.path.expandvars(os.path.expanduser(path))
    if not os.path.exists(expanded):
        raise FileNotFoundError(f"File not found: {path}")

    size = os.path.getsize(expanded)
    truncated = size > max_bytes

    with open(expanded, "r", encoding="utf-8", errors="replace") as f:
        content = f.read(max_bytes)

    return {
        "path": expanded,
        "content": content,
        "size": size,
        "truncated": truncated,
    }


def file_write(path: str, content: str) -> None:
    """Write content to file, creating directories as needed."""
    expanded = os.path.expandvars(os.path.expanduser(path))
    os.makedirs(os.path.dirname(expanded) or ".", exist_ok=True)
    with open(expanded, "w", encoding="utf-8") as f:
        f.write(content)


def file_delete(path: str) -> None:
    """Delete a file (not directories for safety)."""
    expanded = os.path.expandvars(os.path.expanduser(path))
    if not os.path.exists(expanded):
        raise FileNotFoundError(f"File not found: {path}")
    if os.path.isdir(expanded):
        raise ValueError("Use a specific file path, not a directory")
    os.remove(expanded)


def file_copy(src: str, dst: str) -> None:
    """Copy a file."""
    src_exp = os.path.expandvars(os.path.expanduser(src))
    dst_exp = os.path.expandvars(os.path.expanduser(dst))
    shutil.copy2(src_exp, dst_exp)
