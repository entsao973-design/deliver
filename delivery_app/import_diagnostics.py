from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
IMPORT_LOG = ROOT_DIR / "server.import.log"


def write_import_log(event: str, **fields) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    parts = [timestamp, f"pid={os.getpid()}", event]
    for key, value in fields.items():
        text = str(value).replace("\r", " ").replace("\n", " ")
        parts.append(f"{key}={text[:500]}")
    try:
        with IMPORT_LOG.open("a", encoding="utf-8") as file:
            file.write(" | ".join(parts) + "\n")
    except OSError:
        return
