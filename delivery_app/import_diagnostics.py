from __future__ import annotations

import faulthandler
import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
IMPORT_LOG = ROOT_DIR / "server.import.log"
IMPORT_TRACE_LOG = ROOT_DIR / "server.import.trace.log"


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


@contextmanager
def dump_traceback_if_slow(reason: str, timeout_seconds: int = 45):
    trace_file = None
    try:
        trace_file = IMPORT_TRACE_LOG.open("a", encoding="utf-8")
        trace_file.write(f"{datetime.now().isoformat(timespec='seconds')} | pid={os.getpid()} | trace_watch_start | reason={reason} | timeout_seconds={timeout_seconds}\n")
        trace_file.flush()
        faulthandler.dump_traceback_later(timeout_seconds, repeat=False, file=trace_file)
        yield
    finally:
        faulthandler.cancel_dump_traceback_later()
        if trace_file:
            trace_file.write(f"{datetime.now().isoformat(timespec='seconds')} | pid={os.getpid()} | trace_watch_end | reason={reason}\n")
            trace_file.close()
