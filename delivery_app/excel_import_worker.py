from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from .excel_importer import import_deliveries_direct
from .import_diagnostics import write_import_log


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 2:
        print("Usage: python -m delivery_app.excel_import_worker <excel_path> <output_json>", file=sys.stderr)
        return 2

    excel_path = Path(args[0])
    output_path = Path(args[1])
    write_import_log("excel_worker_process_start", path=excel_path, output=output_path)
    try:
        result = import_deliveries_direct(excel_path)
        output_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        write_import_log("excel_worker_process_exception", error_type=type(exc).__name__, message=str(exc))
        traceback.print_exc()
        return 1

    write_import_log("excel_worker_process_done", path=excel_path, output=output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
