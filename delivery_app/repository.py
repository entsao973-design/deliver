from __future__ import annotations

import base64
import json
import re
import shutil
import threading
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any

from .excel_importer import import_deliveries, normalize_vehicle_no
from .geocoding import (
    GEOCODE_FAILED,
    GEOCODE_PENDING,
    DisabledGeocoder,
    GeocodeResult,
    apply_geocode_result,
    default_geocode_fields,
    normalize_address,
)
from .import_diagnostics import write_import_log


STATUS_LABELS = {
    "normal": "正常",
    "abnormal": "異常",
}

GEOCODE_FIELDS = (
    "normalized_address",
    "geocode_lat",
    "geocode_lng",
    "geocode_status",
    "geocode_provider",
    "geocode_place_id",
    "geocode_updated_at",
    "geocode_error",
)


class HistoryCleanupError(RuntimeError):
    pass


class DeliveryRepository:
    def __init__(
        self,
        excel_path: str | None,
        data_file: str,
        photo_root: str,
        archive_root: str | None = None,
        geocoder=None,
    ) -> None:
        self.excel_path = Path(excel_path) if excel_path else None
        self.data_file = Path(data_file)
        self.photo_root = Path(photo_root)
        self.archive_root = Path(archive_root) if archive_root else self.photo_root.parent / "archives"
        self.geocoder = geocoder or DisabledGeocoder()
        self._lock = threading.Lock()
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        self.photo_root.mkdir(parents=True, exist_ok=True)
        self.archive_root.mkdir(parents=True, exist_ok=True)
        if not self.data_file.exists() and self.excel_path and self.excel_path.exists():
            self.reload_from_excel()

    def reload_from_excel(self) -> None:
        if not self.excel_path:
            raise ValueError("No default Excel file is configured. Upload Excel from the admin page.")
        if not self.excel_path.exists():
            raise ValueError(f"Default Excel file not found: {self.excel_path}")
        self.import_excel_file(self.excel_path)

    def import_excel_file(self, excel_path: str | Path) -> dict[str, int]:
        write_import_log("repo_import_start", backend="json", path=excel_path)
        imported = import_deliveries(excel_path)
        records = imported.get("deliveries", [])
        write_import_log("repo_import_loaded", backend="json", records=len(records))
        summary = {"inserted": 0, "updated": 0, "skipped": 0, "locked_delivered": 0}

        with self._lock:
            write_import_log("repo_lock_acquired", backend="json")
            data = self._read_data_unlocked()
            deliveries = data.setdefault("deliveries", [])
            by_invoice: dict[str, list[dict[str, Any]]] = {}
            for record in deliveries:
                invoice_no = record.get("invoice_no")
                if invoice_no:
                    by_invoice.setdefault(invoice_no, []).append(record)

            for index, imported_record in enumerate(records, start=1):
                if index == 1 or index % 100 == 0 or index == len(records):
                    write_import_log(
                        "repo_record_progress",
                        backend="json",
                        index=index,
                        total=len(records),
                        invoice=imported_record.get("invoice_no", ""),
                    )
                invoice_no = imported_record.get("invoice_no")
                invoice_records = by_invoice.get(invoice_no, []) if invoice_no else []
                imported_date = imported_record.get("delivery_date")
                existing = next(
                    (
                        record
                        for record in invoice_records
                        if record.get("delivery_date") == imported_date
                    ),
                    None,
                )
                if existing is None:
                    existing = next((record for record in invoice_records if not record.get("status")), None)
                if existing:
                    if existing.get("status"):
                        summary["locked_delivered"] += 1
                        continue

                    if self._same_imported_values(existing, imported_record):
                        summary["skipped"] += 1
                        continue

                    keep = {
                        "status": existing.get("status"),
                        "photo_path": existing.get("photo_path"),
                        "photo_updated_at": existing.get("photo_updated_at"),
                        "deleted_at": existing.get("deleted_at"),
                        "deleted_by": existing.get("deleted_by"),
                    }
                    if existing.get("address") == imported_record.get("address"):
                        for field in GEOCODE_FIELDS:
                            keep[field] = existing.get(field)
                    existing.clear()
                    existing.update(imported_record)
                    existing.update(keep)
                    existing["updated_at"] = datetime.now().isoformat(timespec="seconds")
                    summary["updated"] += 1
                else:
                    deliveries.append(imported_record)
                    if invoice_no:
                        by_invoice.setdefault(invoice_no, []).append(imported_record)
                    summary["inserted"] += 1

            data["source_excel"] = str(excel_path)
            data["imported_at"] = datetime.now().isoformat(timespec="seconds")
            write_import_log("repo_write_start", backend="json", summary=json.dumps(summary, ensure_ascii=False))
            self._write_data_unlocked(data)
            write_import_log("repo_write_done", backend="json")

        write_import_log("repo_import_done", backend="json", summary=json.dumps(summary, ensure_ascii=False))
        return summary

    def list_for_vehicle(
        self,
        vehicle_no: str,
        include_delivered: bool = False,
        delivery_date: str | None = None,
    ) -> list[dict[str, Any]]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        with self._lock:
            records = [
                self._public_record(record)
                for record in self._read_data_unlocked().get("deliveries", [])
                if self._matches_vehicle_date(record, vehicle_key, delivery_date)
                and not record.get("deleted_at")
            ]

        if not include_delivered:
            records = [record for record in records if record.get("status") is None]

        return sorted(records, key=lambda record: (record["customer"], record["company"], record["invoice_no"]))

    def counts_for_vehicle(self, vehicle_no: str, delivery_date: str | None = None) -> dict[str, int]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        with self._lock:
            records = [
                record
                for record in self._read_data_unlocked().get("deliveries", [])
                if self._matches_vehicle_date(record, vehicle_key, delivery_date)
                and not record.get("deleted_at")
            ]

        done = sum(1 for record in records if record.get("status"))
        return {"open": len(records) - done, "done": done, "total": len(records)}

    def dates_for_vehicle(self, vehicle_no: str) -> list[dict[str, str]]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        dates: dict[str, str] = {}
        with self._lock:
            for record in self._read_data_unlocked().get("deliveries", []):
                if record.get("vehicle_no_normalized") == vehicle_key and not record.get("deleted_at"):
                    dates[record["delivery_date"]] = record["date_folder"]

        return [
            {"delivery_date": delivery_date, "date_folder": date_folder}
            for delivery_date, date_folder in sorted(dates.items(), reverse=True)
        ]

    def vehicle_meta(self, vehicle_no: str, delivery_date: str | None = None) -> dict[str, Any] | None:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        selected_date = delivery_date or self.latest_date_for_vehicle(vehicle_no)
        with self._lock:
            for record in self._read_data_unlocked().get("deliveries", []):
                if self._matches_vehicle_date(record, vehicle_key, selected_date):
                    if record.get("deleted_at"):
                        continue
                    return {
                        "vehicle_no": record["vehicle_no"],
                        "driver": record["driver"],
                        "delivery_date": record["delivery_date"],
                        "date_folder": record["date_folder"],
                    }
        return None

    def latest_date_for_vehicle(self, vehicle_no: str) -> str | None:
        dates = self.dates_for_vehicle(vehicle_no)
        return dates[0]["delivery_date"] if dates else None

    def vehicles_for_latest_date(self) -> dict[str, Any]:
        with self._lock:
            active = [
                record
                for record in self._read_data_unlocked().get("deliveries", [])
                if not record.get("deleted_at")
            ]

        latest_date = max((record.get("delivery_date", "") for record in active), default="")
        drivers_by_vehicle = {
            record.get("vehicle_no", ""): record.get("driver", "")
            for record in active
            if record.get("delivery_date") == latest_date and record.get("vehicle_no")
        }
        vehicles = sorted(drivers_by_vehicle)
        return {
            "delivery_date": latest_date,
            "vehicles": vehicles,
            "vehicle_options": [
                {"vehicle_no": vehicle_no, "driver": drivers_by_vehicle[vehicle_no]}
                for vehicle_no in vehicles
            ],
        }

    def get_public_record(self, delivery_id: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._find_record_unlocked(delivery_id)
            return self._public_record(record) if record else None

    def update_photo(self, delivery_id: str, status: str, photo_data_url: str, captured_at: str | None = None) -> dict[str, Any]:
        if status not in STATUS_LABELS:
            raise ValueError("達交狀態不正確")

        with self._lock:
            data = self._read_data_unlocked()
            record = self._find_record_unlocked(delivery_id, data)
            if not record:
                raise KeyError("找不到出貨單")
            if record.get("deleted_at"):
                raise ValueError("刪除區的出貨單不可更新照片")

            old_photo_path = record.get("photo_path")
            new_photo_path = self._save_photo_unlocked(record, status, photo_data_url)
            photo_time = photo_timestamp(captured_at)
            now = datetime.now().isoformat(timespec="seconds")
            record["status"] = status
            record["photo_path"] = str(new_photo_path)
            record["photo_updated_at"] = photo_time
            record["updated_at"] = now
            self._remove_old_photo_unlocked(old_photo_path, str(new_photo_path))
            self._write_data_unlocked(data)
            return self._public_record(record)

    def list_admin_deliveries(
        self,
        delivery_date: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        company: str | None = None,
        driver: str | None = None,
        deleted: bool = False,
    ) -> list[dict[str, Any]]:
        with self._lock:
            records = []
            for record in self._read_data_unlocked().get("deliveries", []):
                if bool(record.get("deleted_at")) != deleted:
                    continue
                if delivery_date and not self._matches_date(record, delivery_date):
                    continue
                if not delivery_date and not self._matches_date_range(record, start_date, end_date):
                    continue
                if company and record.get("company") != company:
                    continue
                if driver and record.get("driver") != driver:
                    continue
                records.append(self._public_record(record))

        return sorted(records, key=lambda item: (item["delivery_date"], item["company"], item["driver"], item["invoice_no"]))

    def archive_photos(self, delivery_date: str) -> list[dict[str, Any]]:
        date_folder = date_to_folder(delivery_date)
        source_root = self.photo_root / date_folder
        self.archive_root.mkdir(parents=True, exist_ok=True)
        archives: list[dict[str, Any]] = []

        if not source_root.exists():
            return archives

        company_photos: dict[str, list[Path]] = {}
        for child in sorted(path for path in source_root.iterdir() if path.is_dir()):
            if child.name in STATUS_LABELS.values():
                for company_dir in sorted(path for path in child.iterdir() if path.is_dir()):
                    company_photos.setdefault(company_dir.name, []).extend(list_photo_files(company_dir))
            else:
                company_photos.setdefault(child.name, []).extend(list_photo_files(child))

        for company_name, photos in sorted(company_photos.items()):
            if not photos:
                continue

            zip_name = safe_path_part(f"{date_folder}_{company_name}") + ".zip"
            zip_path = self.archive_root / zip_name
            used_names: set[str] = set()
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
                for photo in photos:
                    arcname = unique_archive_name(photo.name, used_names)
                    archive.write(photo, arcname=arcname)

            archives.append({
                "name": zip_name,
                "company": company_name,
                "date_folder": date_folder,
                "size": zip_path.stat().st_size,
            })

        return archives

    def list_archives(self, delivery_date: str) -> list[dict[str, Any]]:
        return list_archive_files(self.archive_root, delivery_date)

    def archive_path_for(self, filename: str) -> Path | None:
        safe_name = safe_path_part(filename)
        if not safe_name.lower().endswith(".zip"):
            return None
        path = self.archive_root / safe_name
        try:
            resolved = path.resolve()
            root = self.archive_root.resolve()
            if root != resolved.parent:
                return None
        except OSError:
            return None
        return path if path.exists() else None

    def cleanup_delivery_history(self, start_date: str, end_date: str) -> dict[str, int]:
        start, end = parse_cleanup_date_range(start_date, end_date)
        with self._lock:
            data = self._read_data_unlocked()
            deliveries = data.get("deliveries", [])
            remaining = [
                record
                for record in deliveries
                if not start.isoformat() <= str(record.get("delivery_date", "")) <= end.isoformat()
            ]
            deleted_records = len(deliveries) - len(remaining)
            data["deliveries"] = remaining
            self._write_data_unlocked(data)

        file_summary = cleanup_history_files(self.photo_root, self.archive_root, start, end)
        return {"deleted_records": deleted_records, **file_summary}

    def filter_options(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        deleted: bool = False,
    ) -> dict[str, list[str]]:
        with self._lock:
            records = [
                record
                for record in self._read_data_unlocked().get("deliveries", [])
                if bool(record.get("deleted_at")) == deleted
                and self._matches_date_range(record, start_date, end_date)
            ]
        return {
            "dates": sorted({record.get("delivery_date", "") for record in records if record.get("delivery_date")}, reverse=True),
            "companies": sorted({record.get("company", "") for record in records if record.get("company")}),
            "drivers": sorted({record.get("driver", "") for record in records if record.get("driver")}),
        }

    def geocode_pending(self) -> dict[str, int]:
        summary = {
            "success": 0,
            "empty": 0,
            "no_result": 0,
            "ambiguous": 0,
            "failed": 0,
            "cached": 0,
            "skipped": 0,
        }
        if not getattr(self.geocoder, "enabled", False):
            return summary

        with self._lock:
            data = self._read_data_unlocked()
            cache = data.setdefault("geocode_cache", {})
            changed = False

            for record in data.get("deliveries", []):
                address = record.get("address", "")
                if not record.get("geocode_status"):
                    record.update(default_geocode_fields(address))
                    changed = True
                if record.get("geocode_status") != GEOCODE_PENDING:
                    summary["skipped"] += 1
                    continue

                normalized = normalize_address(address)
                if not normalized:
                    record.update(default_geocode_fields(""))
                    summary["empty"] += 1
                    changed = True
                    continue

                cached = cache.get(normalized)
                if cached:
                    result = GeocodeResult(
                        status=str(cached.get("status") or GEOCODE_PENDING),
                        normalized_address=normalized,
                        lat=cached.get("lat"),
                        lng=cached.get("lng"),
                        provider=cached.get("provider"),
                        place_id=cached.get("place_id"),
                        error_message=cached.get("error_message"),
                    )
                    apply_geocode_result(record, result)
                    summary["cached"] += 1
                    summary[result.status] = summary.get(result.status, 0) + 1
                    changed = True
                    continue

                result = self.geocoder.geocode(address)
                apply_geocode_result(record, result)
                if result.status != GEOCODE_FAILED:
                    cache[normalized] = {
                        "address": address,
                        "provider": result.provider,
                        "place_id": result.place_id,
                        "lat": result.lat,
                        "lng": result.lng,
                        "status": result.status,
                        "error_message": result.error_message,
                        "updated_at": record.get("geocode_updated_at"),
                    }
                summary[result.status] = summary.get(result.status, 0) + 1
                changed = True

            if changed:
                self._write_data_unlocked(data)

        return summary

    def delete_delivery(self, delivery_id: str, username: str) -> dict[str, Any]:
        with self._lock:
            data = self._read_data_unlocked()
            record = self._find_record_unlocked(delivery_id, data)
            if not record:
                raise KeyError("找不到出貨單")

            now = datetime.now().isoformat(timespec="seconds")
            record["deleted_at"] = now
            record["deleted_by"] = username
            record["updated_at"] = now
            self._write_data_unlocked(data)
            return {"mode": "archived", "delivery": self._public_record(record)}

    def delete_deliveries(self, delivery_ids: list[str], username: str) -> dict[str, int]:
        target_ids = normalize_delivery_ids(delivery_ids)
        if not target_ids:
            return {"deleted_records": 0}

        target_set = set(target_ids)
        deleted_records = 0
        with self._lock:
            data = self._read_data_unlocked()
            now = datetime.now().isoformat(timespec="seconds")
            for record in data.get("deliveries", []):
                if record.get("id") not in target_set or record.get("deleted_at"):
                    continue
                record["deleted_at"] = now
                record["deleted_by"] = username
                record["updated_at"] = now
                deleted_records += 1
            if deleted_records:
                self._write_data_unlocked(data)
        return {"deleted_records": deleted_records}

    def permanently_delete_delivery(self, delivery_id: str) -> None:
        with self._lock:
            data = self._read_data_unlocked()
            record = self._find_record_unlocked(delivery_id, data)
            if not record:
                raise KeyError("找不到出貨單")
            if not record.get("deleted_at"):
                raise ValueError("只能永久刪除刪除區內的出貨單")

            photo_path = record.get("photo_path")
            data["deliveries"] = [
                item
                for item in data.get("deliveries", [])
                if item.get("id") != delivery_id
            ]
            self._write_data_unlocked(data)
            self._remove_old_photo_unlocked(photo_path, "")
            delete_archives_for_records(self.archive_root, [record])

    def permanently_delete_deliveries(self, delivery_ids: list[str]) -> dict[str, int]:
        target_ids = normalize_delivery_ids(delivery_ids)
        if not target_ids:
            return {"deleted_records": 0}

        target_set = set(target_ids)
        with self._lock:
            data = self._read_data_unlocked()
            records = [
                record
                for record in data.get("deliveries", [])
                if record.get("id") in target_set
            ]
            if any(not record.get("deleted_at") for record in records):
                raise ValueError("只能永久刪除刪除區內的出貨單")

            photo_paths = [record.get("photo_path") for record in records]
            data["deliveries"] = [
                item
                for item in data.get("deliveries", [])
                if item.get("id") not in target_set
            ]
            deleted_records = len(records)
            if deleted_records:
                self._write_data_unlocked(data)
            for photo_path in photo_paths:
                self._remove_old_photo_unlocked(photo_path, "")
            delete_archives_for_records(self.archive_root, records)
        return {"deleted_records": deleted_records}

    def restore_delivery(self, delivery_id: str) -> dict[str, Any]:
        with self._lock:
            data = self._read_data_unlocked()
            record = self._find_record_unlocked(delivery_id, data)
            if not record:
                raise KeyError("找不到出貨單")
            if not record.get("deleted_at"):
                raise ValueError("只能還原刪除區內的出貨單")

            record["deleted_at"] = None
            record["deleted_by"] = None
            record["updated_at"] = datetime.now().isoformat(timespec="seconds")
            self._write_data_unlocked(data)
            return self._public_record(record)

    def photo_path_for(self, delivery_id: str) -> Path | None:
        with self._lock:
            record = self._find_record_unlocked(delivery_id)
            if not record or not record.get("photo_path"):
                return None
            path = Path(record["photo_path"])
            return path if path.exists() else None

    def _read_data_unlocked(self) -> dict[str, Any]:
        if not self.data_file.exists():
            return {"deliveries": []}
        with self.data_file.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write_data_unlocked(self, data: dict[str, Any]) -> None:
        temp_path = self.data_file.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        temp_path.replace(self.data_file)

    def _find_record_unlocked(self, delivery_id: str, data: dict[str, Any] | None = None) -> dict[str, Any] | None:
        data = data or self._read_data_unlocked()
        for record in data.get("deliveries", []):
            if record.get("id") == delivery_id:
                return record
        return None

    def _public_record(self, record: dict[str, Any]) -> dict[str, Any]:
        status = record.get("status")
        geocode_fields = default_geocode_fields(record.get("address", ""))
        for field in GEOCODE_FIELDS:
            if record.get(field) is not None:
                geocode_fields[field] = record.get(field)
        return {
            "id": record["id"],
            "seq": record["seq"],
            "vehicle_no": record["vehicle_no"],
            "driver": record["driver"],
            "delivery_date": record["delivery_date"],
            "date_folder": record["date_folder"],
            "customer": record["customer"],
            "address": record.get("address", ""),
            "company": record["company"],
            "invoice_no": record["invoice_no"],
            **geocode_fields,
            "status": status,
            "status_label": STATUS_LABELS.get(status, "未達交"),
            "has_photo": bool(record.get("photo_path")),
            "photo_updated_at": record.get("photo_updated_at"),
            "updated_at": record.get("updated_at"),
            "deleted_at": record.get("deleted_at"),
            "deleted_by": record.get("deleted_by"),
        }

    def _matches_vehicle_date(self, record: dict[str, Any], vehicle_key: str, delivery_date: str | None) -> bool:
        if record.get("vehicle_no_normalized") != vehicle_key:
            return False
        if not delivery_date:
            return True

        normalized_date = normalize_delivery_date(delivery_date)
        return record.get("delivery_date") == normalized_date or record.get("date_folder") == delivery_date

    def _matches_date(self, record: dict[str, Any], delivery_date: str) -> bool:
        normalized_date = normalize_delivery_date(delivery_date)
        return record.get("delivery_date") == normalized_date or record.get("date_folder") == delivery_date

    def _matches_date_range(self, record: dict[str, Any], start_date: str | None, end_date: str | None) -> bool:
        delivery_date = record.get("delivery_date", "")
        normalized_start = normalize_delivery_date(start_date or "")
        normalized_end = normalize_delivery_date(end_date or "")
        if normalized_start and delivery_date < normalized_start:
            return False
        if normalized_end and delivery_date > normalized_end:
            return False
        return True

    def _same_imported_values(self, existing: dict[str, Any], imported: dict[str, Any]) -> bool:
        fields = (
            "id",
            "sheet",
            "row",
            "seq",
            "vehicle_no",
            "vehicle_no_normalized",
            "driver",
            "delivery_date",
            "date_folder",
            "customer",
            "address",
            "company",
            "invoice_no",
        )
        return all(existing.get(field) == imported.get(field) for field in fields)

    def _save_photo_unlocked(self, record: dict[str, Any], status: str, photo_data_url: str) -> Path:
        image_bytes = decode_image_data_url(photo_data_url)
        company = safe_path_part(record["company"])
        invoice = safe_path_part(record["invoice_no"])
        suffix = "_異常" if status == "abnormal" else ""
        folder = self.photo_root / record["date_folder"] / company
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{invoice}{suffix}.JPG"
        with path.open("wb") as file:
            file.write(image_bytes)
        return path

    def _remove_old_photo_unlocked(self, old_path: str | None, new_path: str) -> None:
        if not old_path or old_path == new_path:
            return

        old = Path(old_path)
        try:
            old_resolved = old.resolve()
            root_resolved = self.photo_root.resolve()
            if root_resolved in old_resolved.parents and old.exists():
                old.unlink()
        except OSError:
            return


def decode_image_data_url(photo_data_url: str) -> bytes:
    match = re.match(r"^data:image/(?:jpeg|jpg);base64,(.+)$", photo_data_url, re.IGNORECASE | re.DOTALL)
    if not match:
        raise ValueError("照片格式必須是 JPEG")
    return base64.b64decode(match.group(1), validate=True)


def safe_path_part(value: str) -> str:
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    return text or "_"


def normalize_delivery_date(value: str) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"\d{8}", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return text


def parse_cleanup_date_range(start_date: str, end_date: str) -> tuple[date, date]:
    start_text = str(start_date or "").strip()
    end_text = str(end_date or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start_text) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}",
        end_text,
    ):
        raise ValueError("日期格式不正確，請使用 YYYY-MM-DD")
    try:
        start = datetime.strptime(start_text, "%Y-%m-%d").date()
        end = datetime.strptime(end_text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("日期格式不正確，請使用 YYYY-MM-DD") from exc
    if start > end:
        raise ValueError("開始日期不得晚於結束日期")
    return start, end


def normalize_delivery_ids(delivery_ids: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for delivery_id in delivery_ids or []:
        text = str(delivery_id).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def cleanup_history_files(
    photo_root: Path,
    archive_root: Path,
    start: date,
    end: date,
) -> dict[str, int]:
    try:
        return _cleanup_history_files(photo_root, archive_root, start, end)
    except OSError as exc:
        raise HistoryCleanupError(
            "配送紀錄已清除，但照片或封存 ZIP 清理未完整完成，請使用相同日期區間再次執行"
        ) from exc


def _cleanup_history_files(
    photo_root: Path,
    archive_root: Path,
    start: date,
    end: date,
) -> dict[str, int]:
    deleted_photo_date_folders = 0
    for child in photo_root.iterdir():
        if not child.is_dir() or not re.fullmatch(r"\d{8}", child.name):
            continue
        try:
            folder_date = datetime.strptime(child.name, "%Y%m%d").date()
        except ValueError:
            continue
        if start <= folder_date <= end:
            shutil.rmtree(child)
            deleted_photo_date_folders += 1

    deleted_archives = 0
    for path in archive_root.iterdir():
        if not path.is_file() or path.suffix.lower() != ".zip":
            continue
        if not re.match(r"^\d{8}_", path.name):
            continue
        date_prefix = path.name[:8]
        if not re.fullmatch(r"\d{8}", date_prefix):
            continue
        try:
            archive_date = datetime.strptime(date_prefix, "%Y%m%d").date()
        except ValueError:
            continue
        if start <= archive_date <= end:
            path.unlink()
            deleted_archives += 1

    return {
        "deleted_photo_date_folders": deleted_photo_date_folders,
        "deleted_archives": deleted_archives,
    }


def photo_timestamp(value: str | None) -> str:
    text = str(value or "").strip()
    if text:
        try:
            return datetime.fromisoformat(text).replace(microsecond=0, tzinfo=None).isoformat(timespec="seconds")
        except ValueError:
            pass
    return datetime.now().isoformat(timespec="seconds")


def date_to_folder(value: str) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"\d{8}", text):
        return text
    normalized = normalize_delivery_date(text)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", normalized):
        return normalized.replace("-", "")
    raise ValueError("日期格式不正確")


def delete_archives_for_records(archive_root: Path, records: list[dict[str, Any]]) -> int:
    archive_paths = set()
    for record in records:
        date_folder = str(record.get("date_folder") or date_to_folder(str(record.get("delivery_date", ""))))
        company = str(record.get("company") or "")
        if not date_folder or not company:
            continue
        archive_paths.add(archive_root / (safe_path_part(f"{date_folder}_{company}") + ".zip"))

    deleted_archives = 0
    for path in archive_paths:
        try:
            if path.is_file():
                path.unlink()
                deleted_archives += 1
        except OSError:
            continue
    return deleted_archives


def list_archive_files(archive_root: Path, delivery_date: str) -> list[dict[str, Any]]:
    date_folder = date_to_folder(delivery_date)
    prefix = f"{date_folder}_"
    archives = []
    for path in sorted(archive_root.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".zip" or not path.name.startswith(prefix):
            continue
        archives.append({
            "name": path.name,
            "company": path.stem[len(prefix):],
            "date_folder": date_folder,
            "size": path.stat().st_size,
        })
    return archives


def list_photo_files(folder: Path) -> list[Path]:
    return [
        path
        for path in sorted(folder.rglob("*"))
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg"}
    ]


def unique_archive_name(filename: str, used_names: set[str]) -> str:
    if filename not in used_names:
        used_names.add(filename)
        return filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    index = 2
    while True:
        candidate = f"{stem}_{index}{suffix}"
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate
        index += 1
