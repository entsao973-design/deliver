from __future__ import annotations

import importlib
import hashlib
import json
import threading
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .auth import (
    LOCK_AFTER_FAILURES,
    LOCK_MINUTES,
    ROLES,
    hash_password,
    make_seed_user,
    normalize_permissions,
    parse_time,
    public_user,
    verify_password,
)
from .excel_importer import import_deliveries, normalize_vehicle_no
from .geocoding import (
    GEOCODE_EMPTY,
    GEOCODE_FAILED,
    GEOCODE_PENDING,
    DisabledGeocoder,
    GeocodeResult,
    default_geocode_fields,
    normalize_address,
)
from .import_diagnostics import write_import_log
from .repository import (
    GEOCODE_FIELDS,
    STATUS_LABELS,
    cleanup_history_files,
    date_to_folder,
    decode_image_data_url,
    list_archive_files,
    list_photo_files,
    normalize_delivery_ids,
    normalize_delivery_date,
    parse_cleanup_date_range,
    photo_timestamp,
    safe_path_part,
    unique_archive_name,
)


DEFAULT_DATABASE = "DeliveryPhotoArchive"
DEFAULT_DRIVER = "ODBC Driver 17 for SQL Server"

DELIVERY_FIELDS = (
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
    "normalized_address",
    "geocode_lat",
    "geocode_lng",
    "geocode_status",
    "geocode_provider",
    "geocode_place_id",
    "geocode_updated_at",
    "geocode_error",
    "company",
    "invoice_no",
    "status",
    "photo_path",
    "photo_updated_at",
    "updated_at",
    "deleted_at",
    "deleted_by",
)

DELIVERY_SELECT = """
id,
sheet,
excel_row,
seq,
vehicle_no,
vehicle_no_normalized,
driver,
CONVERT(char(10), delivery_date, 23) AS delivery_date,
date_folder,
customer,
address,
normalized_address,
CAST(geocode_lat AS float) AS geocode_lat,
CAST(geocode_lng AS float) AS geocode_lng,
geocode_status,
geocode_provider,
geocode_place_id,
CONVERT(varchar(19), geocode_updated_at, 126) AS geocode_updated_at,
geocode_error,
company,
invoice_no,
status,
photo_path,
CONVERT(varchar(19), photo_updated_at, 126) AS photo_updated_at,
CONVERT(varchar(19), updated_at, 126) AS updated_at,
CONVERT(varchar(19), deleted_at, 126) AS deleted_at,
deleted_by
"""

IMPORTED_FIELDS = (
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


class SqlServerBase:
    def __init__(self, database_config: dict[str, Any]) -> None:
        self.database_config = database_config
        self.pyodbc = load_pyodbc()
        self.server = require_config(database_config, "server")
        self.database = str(database_config.get("database") or DEFAULT_DATABASE)
        self.master_database = str(database_config.get("master_database") or "master")
        self.driver = str(database_config.get("driver") or DEFAULT_DRIVER)
        self.username = require_config(database_config, "username")
        self.password = require_config(database_config, "password")
        self.timeout = int(database_config.get("timeout", 5))
        self._schema_lock = threading.Lock()
        if database_config.get("initialize_schema", True):
            self._initialize_database()

    def _initialize_database(self) -> None:
        with self._schema_lock:
            if self.database_config.get("create_database", True):
                self._ensure_database()
            self._ensure_schema()

    def _connect(self, database: str | None = None, autocommit: bool = False):
        return self.pyodbc.connect(
            self._connection_string(database or self.database),
            timeout=self.timeout,
            autocommit=autocommit,
        )

    def _connection_string(self, database: str) -> str:
        parts = [
            f"DRIVER={{{self.driver}}}",
            f"SERVER={odbc_value(self.server)}",
            f"DATABASE={odbc_value(database)}",
            f"UID={odbc_value(self.username)}",
            f"PWD={odbc_value(self.password)}",
            f"Encrypt={yes_no(self.database_config.get('encrypt', True))}",
            f"TrustServerCertificate={yes_no(self.database_config.get('trust_server_certificate', True))}",
            "APP=DeliveryPhotoServer",
        ]
        return ";".join(parts)

    def _ensure_database(self) -> None:
        with self._connect(self.master_database, autocommit=True) as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
IF DB_ID(?) IS NULL
BEGIN
    DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(?);
    EXEC (@sql);
END
""",
                self.database,
                self.database,
            )

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
IF OBJECT_ID(N'dbo.deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.deliveries (
        id nvarchar(64) NOT NULL CONSTRAINT PK_deliveries PRIMARY KEY,
        sheet nvarchar(255) NOT NULL CONSTRAINT DF_deliveries_sheet DEFAULT N'',
        excel_row int NOT NULL CONSTRAINT DF_deliveries_excel_row DEFAULT 0,
        seq int NOT NULL,
        vehicle_no nvarchar(80) NOT NULL,
        vehicle_no_normalized nvarchar(80) NOT NULL,
        driver nvarchar(255) NOT NULL,
        delivery_date date NOT NULL,
        date_folder char(8) NOT NULL,
        customer nvarchar(500) NOT NULL,
        address nvarchar(1000) NOT NULL CONSTRAINT DF_deliveries_address DEFAULT N'',
        normalized_address nvarchar(1000) NULL,
        geocode_lat decimal(9,6) NULL,
        geocode_lng decimal(9,6) NULL,
        geocode_status nvarchar(20) NOT NULL CONSTRAINT DF_deliveries_geocode_status DEFAULT N'pending',
        geocode_provider nvarchar(50) NULL,
        geocode_place_id nvarchar(255) NULL,
        geocode_updated_at datetime2(0) NULL,
        geocode_error nvarchar(500) NULL,
        company nvarchar(255) NOT NULL,
        invoice_no nvarchar(255) NOT NULL,
        status nvarchar(20) NULL,
        photo_path nvarchar(1024) NULL,
        photo_updated_at datetime2(0) NULL,
        updated_at datetime2(0) NULL,
        deleted_at datetime2(0) NULL,
        deleted_by nvarchar(255) NULL,
        created_at datetime2(0) NOT NULL CONSTRAINT DF_deliveries_created_at DEFAULT SYSDATETIME()
    );
END
"""
            )
            cursor.execute(
                """
IF COL_LENGTH(N'dbo.deliveries', N'address') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD address nvarchar(1000) NOT NULL CONSTRAINT DF_deliveries_address DEFAULT N'';
END
IF COL_LENGTH(N'dbo.deliveries', N'normalized_address') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD normalized_address nvarchar(1000) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_lat') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_lat decimal(9,6) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_lng') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_lng decimal(9,6) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_status') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_status nvarchar(20) NOT NULL CONSTRAINT DF_deliveries_geocode_status DEFAULT N'pending';
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_provider') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_provider nvarchar(50) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_place_id') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_place_id nvarchar(255) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_updated_at') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_updated_at datetime2(0) NULL;
END
IF COL_LENGTH(N'dbo.deliveries', N'geocode_error') IS NULL
BEGIN
    ALTER TABLE dbo.deliveries ADD geocode_error nvarchar(500) NULL;
END
"""
            )
            cursor.execute(
                """
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UX_deliveries_invoice_no'
      AND object_id = OBJECT_ID(N'dbo.deliveries')
)
BEGIN
    CREATE UNIQUE INDEX UX_deliveries_invoice_no ON dbo.deliveries(invoice_no);
END
"""
            )
            cursor.execute(
                """
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_deliveries_vehicle_date'
      AND object_id = OBJECT_ID(N'dbo.deliveries')
)
BEGIN
    CREATE INDEX IX_deliveries_vehicle_date ON dbo.deliveries(vehicle_no_normalized, delivery_date, deleted_at);
END
"""
            )
            cursor.execute(
                """
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_deliveries_admin_filters'
      AND object_id = OBJECT_ID(N'dbo.deliveries')
)
BEGIN
    CREATE INDEX IX_deliveries_admin_filters ON dbo.deliveries(delivery_date, company, driver, deleted_at);
END
"""
            )
            cursor.execute(
                """
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_deliveries_geocode_status'
      AND object_id = OBJECT_ID(N'dbo.deliveries')
)
BEGIN
    CREATE INDEX IX_deliveries_geocode_status ON dbo.deliveries(geocode_status, deleted_at);
END
"""
            )
            cursor.execute(
                """
IF OBJECT_ID(N'dbo.address_geocode_cache', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.address_geocode_cache (
        cache_key char(64) NOT NULL CONSTRAINT PK_address_geocode_cache PRIMARY KEY,
        normalized_address nvarchar(1000) NOT NULL,
        original_address nvarchar(1000) NULL,
        provider nvarchar(50) NULL,
        place_id nvarchar(255) NULL,
        lat decimal(9,6) NULL,
        lng decimal(9,6) NULL,
        status nvarchar(20) NOT NULL,
        error_message nvarchar(500) NULL,
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_address_geocode_cache_updated_at DEFAULT SYSDATETIME()
    );
END
"""
            )
            cursor.execute(
                """
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        username nvarchar(255) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        display_name nvarchar(255) NOT NULL CONSTRAINT DF_users_display_name DEFAULT N'',
        role nvarchar(20) NOT NULL,
        password_hash nvarchar(512) NOT NULL,
        active bit NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
        permissions_json nvarchar(max) NULL,
        failed_attempts int NOT NULL CONSTRAINT DF_users_failed_attempts DEFAULT 0,
        locked_until datetime2(0) NULL,
        last_login_at datetime2(0) NULL,
        created_at datetime2(0) NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSDATETIME(),
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_users_updated_at DEFAULT SYSDATETIME()
    );
END
IF COL_LENGTH(N'dbo.users', N'permissions_json') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD permissions_json nvarchar(max) NULL;
END
IF COL_LENGTH(N'dbo.users', N'display_name') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD display_name nvarchar(255) NOT NULL CONSTRAINT DF_users_display_name DEFAULT N'';
END
"""
            )
            cursor.execute(
                """
IF OBJECT_ID(N'dbo.app_metadata', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.app_metadata (
        [key] nvarchar(100) NOT NULL CONSTRAINT PK_app_metadata PRIMARY KEY,
        [value] nvarchar(max) NULL,
        updated_at datetime2(0) NOT NULL CONSTRAINT DF_app_metadata_updated_at DEFAULT SYSDATETIME()
    );
END
"""
            )
            connection.commit()

    def _set_metadata(self, cursor, key: str, value: str) -> None:
        cursor.execute(
            """
MERGE dbo.app_metadata AS target
USING (SELECT ? AS [key], ? AS [value]) AS source
ON target.[key] = source.[key]
WHEN MATCHED THEN
    UPDATE SET [value] = source.[value], updated_at = SYSDATETIME()
WHEN NOT MATCHED THEN
    INSERT ([key], [value], updated_at)
    VALUES (source.[key], source.[value], SYSDATETIME());
""",
            key,
            value,
        )


class SqlServerRepository(SqlServerBase):
    def __init__(
        self,
        database_config: dict[str, Any],
        excel_path: str | None,
        photo_root: str,
        archive_root: str | None = None,
        geocoder=None,
    ) -> None:
        self.excel_path = Path(excel_path) if excel_path else None
        self.photo_root = Path(photo_root)
        self.archive_root = Path(archive_root) if archive_root else self.photo_root.parent / "archives"
        self.geocoder = geocoder or DisabledGeocoder()
        self._lock = threading.Lock()
        self.photo_root.mkdir(parents=True, exist_ok=True)
        self.archive_root.mkdir(parents=True, exist_ok=True)
        super().__init__(database_config)
        if (
            database_config.get("auto_import_on_empty", False)
            and self.excel_path
            and self.excel_path.is_file()
            and self._count_deliveries() == 0
        ):
            self.reload_from_excel()

    def reload_from_excel(self) -> None:
        if not self.excel_path:
            raise ValueError("No default Excel file is configured. Upload Excel from the admin page.")
        if not self.excel_path.is_file():
            raise ValueError(f"Default Excel file not found: {self.excel_path}")
        self.import_excel_file(self.excel_path)

    def import_excel_file(self, excel_path: str | Path) -> dict[str, int]:
        write_import_log("repo_import_start", backend="sqlserver", path=excel_path)
        imported = import_deliveries(excel_path)
        records = imported.get("deliveries", [])
        write_import_log("repo_import_loaded", backend="sqlserver", records=len(records))
        summary = {"inserted": 0, "updated": 0, "skipped": 0, "locked_delivered": 0}

        with self._lock:
            write_import_log("repo_lock_acquired", backend="sqlserver")
            write_import_log("repo_sql_connect_start", backend="sqlserver")
            with self._connect() as connection:
                write_import_log("repo_sql_connect_done", backend="sqlserver")
                cursor = connection.cursor()
                try:
                    for index, imported_record in enumerate(records, start=1):
                        if index == 1 or index % 100 == 0 or index == len(records):
                            write_import_log(
                                "repo_record_progress",
                                backend="sqlserver",
                                index=index,
                                total=len(records),
                                invoice=imported_record.get("invoice_no", ""),
                            )
                        invoice_no = imported_record.get("invoice_no")
                        existing = self._fetch_by_invoice(cursor, invoice_no) if invoice_no else None
                        if existing:
                            if existing.get("status"):
                                summary["locked_delivered"] += 1
                                continue

                            if existing.get("address") == imported_record.get("address"):
                                for field in GEOCODE_FIELDS:
                                    imported_record[field] = existing.get(field)

                            if same_imported_values(existing, imported_record):
                                summary["skipped"] += 1
                                continue

                            self._update_imported_delivery(cursor, imported_record)
                            summary["updated"] += 1
                        else:
                            self._insert_delivery(cursor, imported_record)
                            summary["inserted"] += 1

                    self._set_metadata(cursor, "source_excel", str(excel_path))
                    self._set_metadata(cursor, "imported_at", datetime.now().isoformat(timespec="seconds"))
                    write_import_log("repo_commit_start", backend="sqlserver", summary=json.dumps(summary, ensure_ascii=False))
                    connection.commit()
                    write_import_log("repo_commit_done", backend="sqlserver")
                except Exception:
                    write_import_log("repo_exception", backend="sqlserver")
                    connection.rollback()
                    write_import_log("repo_rollback_done", backend="sqlserver")
                    raise

        write_import_log("repo_import_done", backend="sqlserver", summary=json.dumps(summary, ensure_ascii=False))
        return summary

    def import_records(self, records: list[dict[str, Any]]) -> dict[str, int]:
        summary = {"inserted": 0, "updated": 0, "skipped": 0}

        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    for raw_record in records:
                        record = normalize_delivery_record(raw_record)
                        invoice_no = record.get("invoice_no")
                        existing = self._fetch_by_invoice(cursor, invoice_no) if invoice_no else None
                        if not existing:
                            existing = self._fetch_by_id(cursor, record["id"])

                        if existing:
                            if same_delivery_values(existing, record):
                                summary["skipped"] += 1
                                continue
                            self._replace_delivery(cursor, record, existing["id"])
                            summary["updated"] += 1
                        else:
                            self._insert_delivery(cursor, record)
                            summary["inserted"] += 1

                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise

        return summary

    def list_for_vehicle(
        self,
        vehicle_no: str,
        include_delivered: bool = False,
        delivery_date: str | None = None,
    ) -> list[dict[str, Any]]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        sql = f"""
SELECT {DELIVERY_SELECT}
FROM dbo.deliveries
WHERE vehicle_no_normalized = ?
  AND deleted_at IS NULL
"""
        params: list[Any] = [vehicle_key]
        if delivery_date:
            sql += "  AND (delivery_date = ? OR date_folder = ?)\n"
            params.extend([normalize_delivery_date(delivery_date), delivery_date])
        if not include_delivered:
            sql += "  AND status IS NULL\n"
        sql += "ORDER BY customer, company, invoice_no"

        return [public_delivery(row_to_delivery(row)) for row in self._fetch_rows(sql, params)]

    def counts_for_vehicle(self, vehicle_no: str, delivery_date: str | None = None) -> dict[str, int]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        sql = """
SELECT
    COUNT(*) AS total_count,
    SUM(CASE WHEN status IS NULL THEN 0 ELSE 1 END) AS done_count
FROM dbo.deliveries
WHERE vehicle_no_normalized = ?
  AND deleted_at IS NULL
"""
        params: list[Any] = [vehicle_key]
        if delivery_date:
            sql += "  AND (delivery_date = ? OR date_folder = ?)\n"
            params.extend([normalize_delivery_date(delivery_date), delivery_date])

        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute(sql, params)
            row = cursor.fetchone()
        total = int(row[0] or 0) if row else 0
        done = int(row[1] or 0) if row else 0
        return {"open": total - done, "done": done, "total": total}

    def dates_for_vehicle(self, vehicle_no: str) -> list[dict[str, str]]:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        rows = self._fetch_rows(
            """
SELECT DISTINCT CONVERT(char(10), delivery_date, 23) AS delivery_date, date_folder
FROM dbo.deliveries
WHERE vehicle_no_normalized = ?
  AND deleted_at IS NULL
ORDER BY delivery_date DESC
""",
            [vehicle_key],
        )
        return [{"delivery_date": str(row[0]), "date_folder": str(row[1])} for row in rows]

    def vehicle_meta(self, vehicle_no: str, delivery_date: str | None = None) -> dict[str, Any] | None:
        vehicle_key = normalize_vehicle_no(vehicle_no)
        selected_date = delivery_date or self.latest_date_for_vehicle(vehicle_no)
        sql = """
SELECT TOP (1)
    vehicle_no,
    driver,
    CONVERT(char(10), delivery_date, 23) AS delivery_date,
    date_folder
FROM dbo.deliveries
WHERE vehicle_no_normalized = ?
  AND deleted_at IS NULL
"""
        params: list[Any] = [vehicle_key]
        if selected_date:
            sql += "  AND (delivery_date = ? OR date_folder = ?)\n"
            params.extend([normalize_delivery_date(selected_date), selected_date])
        sql += "ORDER BY delivery_date DESC, invoice_no"

        rows = self._fetch_rows(sql, params)
        if not rows:
            return None
        row = rows[0]
        return {
            "vehicle_no": row[0],
            "driver": row[1],
            "delivery_date": row[2],
            "date_folder": row[3],
        }

    def latest_date_for_vehicle(self, vehicle_no: str) -> str | None:
        dates = self.dates_for_vehicle(vehicle_no)
        return dates[0]["delivery_date"] if dates else None

    def vehicles_for_latest_date(self) -> dict[str, Any]:
        rows = self._fetch_rows(
            """
SELECT
    vehicle_no,
    MAX(driver) AS driver,
    CONVERT(char(10), delivery_date, 23) AS delivery_date
FROM dbo.deliveries
WHERE deleted_at IS NULL
  AND delivery_date = (
      SELECT MAX(delivery_date)
      FROM dbo.deliveries
      WHERE deleted_at IS NULL
  )
GROUP BY vehicle_no, delivery_date
ORDER BY vehicle_no
""",
            [],
        )
        latest_date = str(rows[0][2]) if rows else ""
        return {
            "delivery_date": latest_date,
            "vehicles": [str(row[0]) for row in rows if row[0]],
            "vehicle_options": [
                {"vehicle_no": str(row[0]), "driver": str(row[1] or "")}
                for row in rows
                if row[0]
            ],
        }

    def get_public_record(self, delivery_id: str) -> dict[str, Any] | None:
        record = self._fetch_by_id(delivery_id)
        return public_delivery(record) if record else None

    def update_photo(self, delivery_id: str, status: str, photo_data_url: str, captured_at: str | None = None) -> dict[str, Any]:
        if status not in STATUS_LABELS:
            raise ValueError("Invalid delivery status")

        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    record = self._fetch_by_id(cursor, delivery_id)
                    if not record:
                        raise KeyError("Delivery not found")
                    if record.get("deleted_at"):
                        raise ValueError("Deleted deliveries cannot be updated")

                    old_photo_path = record.get("photo_path")
                    new_photo_path = self._save_photo(record, status, photo_data_url)
                    photo_time = to_datetime(photo_timestamp(captured_at)) or datetime.now().replace(microsecond=0)
                    now = datetime.now().replace(microsecond=0)
                    cursor.execute(
                        """
UPDATE dbo.deliveries
SET status = ?,
    photo_path = ?,
    photo_updated_at = ?,
    updated_at = ?
WHERE id = ?
""",
                        status,
                        str(new_photo_path),
                        photo_time,
                        now,
                        delivery_id,
                    )
                    connection.commit()
                    self._remove_old_photo(old_photo_path, str(new_photo_path))
                except Exception:
                    connection.rollback()
                    raise

        record = self._fetch_by_id(delivery_id)
        if not record:
            raise KeyError("Delivery not found")
        return public_delivery(record)

    def list_admin_deliveries(
        self,
        delivery_date: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        company: str | None = None,
        driver: str | None = None,
        deleted: bool = False,
    ) -> list[dict[str, Any]]:
        deleted_clause = "deleted_at IS NOT NULL" if deleted else "deleted_at IS NULL"
        sql = f"""
SELECT {DELIVERY_SELECT}
FROM dbo.deliveries
WHERE {deleted_clause}
"""
        params: list[Any] = []
        if delivery_date:
            sql += "  AND (delivery_date = ? OR date_folder = ?)\n"
            params.extend([normalize_delivery_date(delivery_date), delivery_date])
        else:
            normalized_start = normalize_delivery_date(start_date or "")
            normalized_end = normalize_delivery_date(end_date or "")
            if normalized_start:
                sql += "  AND delivery_date >= ?\n"
                params.append(normalized_start)
            if normalized_end:
                sql += "  AND delivery_date <= ?\n"
                params.append(normalized_end)
        if company:
            sql += "  AND company = ?\n"
            params.append(company)
        if driver:
            sql += "  AND driver = ?\n"
            params.append(driver)
        sql += "ORDER BY delivery_date, company, driver, invoice_no"

        return [public_delivery(row_to_delivery(row)) for row in self._fetch_rows(sql, params)]

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
                    archive.write(photo, arcname=unique_archive_name(photo.name, used_names))

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
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    cursor.execute(
                        """
DELETE FROM dbo.deliveries
WHERE delivery_date >= ?
  AND delivery_date <= ?
""",
                        start.isoformat(),
                        end.isoformat(),
                    )
                    deleted_records = max(int(cursor.rowcount or 0), 0)
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise

        file_summary = cleanup_history_files(self.photo_root, self.archive_root, start, end)
        return {"deleted_records": deleted_records, **file_summary}

    def filter_options(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        deleted: bool = False,
    ) -> dict[str, list[str]]:
        deleted_clause = "deleted_at IS NOT NULL" if deleted else "deleted_at IS NULL"
        params: list[Any] = []
        sql = f"""
SELECT
    CONVERT(char(10), delivery_date, 23) AS delivery_date,
    company,
    driver
FROM dbo.deliveries
WHERE {deleted_clause}
"""
        normalized_start = normalize_delivery_date(start_date or "")
        normalized_end = normalize_delivery_date(end_date or "")
        if normalized_start:
            sql += "  AND delivery_date >= ?\n"
            params.append(normalized_start)
        if normalized_end:
            sql += "  AND delivery_date <= ?\n"
            params.append(normalized_end)
        rows = self._fetch_rows(sql, params)
        return {
            "dates": sorted({str(row[0]) for row in rows if row[0]}, reverse=True),
            "companies": sorted({str(row[1]) for row in rows if row[1]}),
            "drivers": sorted({str(row[2]) for row in rows if row[2]}),
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
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    cursor.execute(
                        """
SELECT id, address
FROM dbo.deliveries
WHERE geocode_status = ?
  AND deleted_at IS NULL
ORDER BY delivery_date, invoice_no
""",
                        GEOCODE_PENDING,
                    )
                    pending_rows = list(cursor.fetchall())

                    for row in pending_rows:
                        delivery_id = str(row[0])
                        address = str(row[1] or "")
                        normalized = normalize_address(address)
                        if not normalized:
                            result = GeocodeResult(status=GEOCODE_EMPTY, normalized_address="")
                        else:
                            result = self._fetch_geocode_cache(cursor, normalized)
                            if result:
                                summary["cached"] += 1
                            else:
                                result = self.geocoder.geocode(address)
                                if result.status != GEOCODE_FAILED:
                                    self._upsert_geocode_cache(cursor, address, result)

                        self._update_delivery_geocode(cursor, delivery_id, result)
                        summary[result.status] = summary.get(result.status, 0) + 1

                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise

        return summary

    def delete_delivery(self, delivery_id: str, username: str) -> dict[str, Any]:
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    record = self._fetch_by_id(cursor, delivery_id)
                    if not record:
                        raise KeyError("Delivery not found")

                    now = datetime.now().replace(microsecond=0)
                    cursor.execute(
                        """
UPDATE dbo.deliveries
SET deleted_at = ?,
    deleted_by = ?,
    updated_at = ?
WHERE id = ?
""",
                        now,
                        username,
                        now,
                        delivery_id,
                    )
                    connection.commit()
                    archived = self._fetch_by_id(delivery_id)
                    return {"mode": "archived", "delivery": public_delivery(archived)}
                except Exception:
                    connection.rollback()
                    raise

    def delete_deliveries(self, delivery_ids: list[str], username: str) -> dict[str, int]:
        target_ids = normalize_delivery_ids(delivery_ids)
        if not target_ids:
            return {"deleted_records": 0}

        placeholders = ", ".join("?" for _ in target_ids)
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    now = datetime.now().replace(microsecond=0)
                    cursor.execute(
                        f"""
UPDATE dbo.deliveries
SET deleted_at = ?,
    deleted_by = ?,
    updated_at = ?
WHERE deleted_at IS NULL
  AND id IN ({placeholders})
""",
                        now,
                        username,
                        now,
                        *target_ids,
                    )
                    deleted_records = max(int(cursor.rowcount or 0), 0)
                    connection.commit()
                    return {"deleted_records": deleted_records}
                except Exception:
                    connection.rollback()
                    raise

    def permanently_delete_delivery(self, delivery_id: str) -> None:
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    record = self._fetch_by_id(cursor, delivery_id)
                    if not record:
                        raise KeyError("Delivery not found")
                    if not record.get("deleted_at"):
                        raise ValueError("Only deleted deliveries can be permanently deleted")

                    photo_path = record.get("photo_path")
                    cursor.execute("DELETE FROM dbo.deliveries WHERE id = ?", delivery_id)
                    connection.commit()
                    self._remove_old_photo(photo_path, "")
                except Exception:
                    connection.rollback()
                    raise

    def permanently_delete_deliveries(self, delivery_ids: list[str]) -> dict[str, int]:
        target_ids = normalize_delivery_ids(delivery_ids)
        if not target_ids:
            return {"deleted_records": 0}

        placeholders = ", ".join("?" for _ in target_ids)
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    cursor.execute(
                        f"SELECT {DELIVERY_SELECT} FROM dbo.deliveries WHERE id IN ({placeholders})",
                        *target_ids,
                    )
                    records = [row_to_delivery(row) for row in cursor.fetchall()]
                    if any(not record.get("deleted_at") for record in records):
                        raise ValueError("Only deleted deliveries can be permanently deleted")

                    photo_paths = [record.get("photo_path") for record in records]
                    cursor.execute(
                        f"DELETE FROM dbo.deliveries WHERE deleted_at IS NOT NULL AND id IN ({placeholders})",
                        *target_ids,
                    )
                    deleted_records = max(int(cursor.rowcount or 0), 0)
                    connection.commit()
                    for photo_path in photo_paths:
                        self._remove_old_photo(photo_path, "")
                    return {"deleted_records": deleted_records}
                except Exception:
                    connection.rollback()
                    raise

    def restore_delivery(self, delivery_id: str) -> dict[str, Any]:
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    record = self._fetch_by_id(cursor, delivery_id)
                    if not record:
                        raise KeyError("Delivery not found")
                    if not record.get("deleted_at"):
                        raise ValueError("Only deleted deliveries can be restored")

                    now = datetime.now().replace(microsecond=0)
                    cursor.execute(
                        """
UPDATE dbo.deliveries
SET deleted_at = NULL,
    deleted_by = NULL,
    updated_at = ?
WHERE id = ?
""",
                        now,
                        delivery_id,
                    )
                    connection.commit()
                    restored = self._fetch_by_id(delivery_id)
                    return public_delivery(restored)
                except Exception:
                    connection.rollback()
                    raise

    def photo_path_for(self, delivery_id: str) -> Path | None:
        record = self._fetch_by_id(delivery_id)
        if not record or not record.get("photo_path"):
            return None
        path = Path(record["photo_path"])
        return path if path.exists() else None

    def _count_deliveries(self) -> int:
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT COUNT(*) FROM dbo.deliveries")
            row = cursor.fetchone()
        return int(row[0] or 0) if row else 0

    def _fetch_rows(self, sql: str, params: list[Any]):
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute(sql, params)
            return cursor.fetchall()

    def _fetch_by_id(self, cursor_or_id, delivery_id: str | None = None) -> dict[str, Any] | None:
        if delivery_id is None:
            with self._connect() as connection:
                cursor = connection.cursor()
                return self._fetch_by_id(cursor, str(cursor_or_id))

        cursor = cursor_or_id
        cursor.execute(f"SELECT {DELIVERY_SELECT} FROM dbo.deliveries WHERE id = ?", delivery_id)
        row = cursor.fetchone()
        return row_to_delivery(row) if row else None

    def _fetch_by_invoice(self, cursor, invoice_no: str) -> dict[str, Any] | None:
        cursor.execute(f"SELECT {DELIVERY_SELECT} FROM dbo.deliveries WHERE invoice_no = ?", invoice_no)
        row = cursor.fetchone()
        return row_to_delivery(row) if row else None

    def _fetch_geocode_cache(self, cursor, normalized_address: str) -> GeocodeResult | None:
        cursor.execute(
            """
SELECT status, normalized_address, lat, lng, provider, place_id, error_message
FROM dbo.address_geocode_cache
WHERE cache_key = ?
""",
            geocode_cache_key(normalized_address),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return GeocodeResult(
            status=str(row[0] or GEOCODE_PENDING),
            normalized_address=str(row[1] or normalized_address),
            lat=optional_float(row[2]),
            lng=optional_float(row[3]),
            provider=row[4],
            place_id=row[5],
            error_message=row[6],
        )

    def _upsert_geocode_cache(self, cursor, address: str, result: GeocodeResult) -> None:
        normalized = result.normalized_address or normalize_address(address)
        cursor.execute(
            """
MERGE dbo.address_geocode_cache AS target
USING (
    SELECT ? AS cache_key
) AS source
ON target.cache_key = source.cache_key
WHEN MATCHED THEN
    UPDATE SET normalized_address = ?,
               original_address = ?,
               provider = ?,
               place_id = ?,
               lat = ?,
               lng = ?,
               status = ?,
               error_message = ?,
               updated_at = SYSDATETIME()
WHEN NOT MATCHED THEN
    INSERT (cache_key, normalized_address, original_address, provider, place_id, lat, lng, status, error_message, updated_at)
    VALUES (source.cache_key, ?, ?, ?, ?, ?, ?, ?, ?, SYSDATETIME());
""",
            geocode_cache_key(normalized),
            normalized,
            address,
            result.provider,
            result.place_id,
            result.lat,
            result.lng,
            result.status,
            result.error_message,
            normalized,
            address,
            result.provider,
            result.place_id,
            result.lat,
            result.lng,
            result.status,
            result.error_message,
        )

    def _update_delivery_geocode(self, cursor, delivery_id: str, result: GeocodeResult) -> None:
        cursor.execute(
            """
UPDATE dbo.deliveries
SET normalized_address = ?,
    geocode_lat = ?,
    geocode_lng = ?,
    geocode_status = ?,
    geocode_provider = ?,
    geocode_place_id = ?,
    geocode_updated_at = ?,
    geocode_error = ?
WHERE id = ?
""",
            result.normalized_address,
            result.lat,
            result.lng,
            result.status,
            result.provider,
            result.place_id,
            datetime.now().replace(microsecond=0),
            result.error_message,
            delivery_id,
        )

    def _insert_delivery(self, cursor, record: dict[str, Any]) -> None:
        record = normalize_delivery_record(record)
        cursor.execute(
            """
INSERT INTO dbo.deliveries (
    id, sheet, excel_row, seq, vehicle_no, vehicle_no_normalized, driver,
    delivery_date, date_folder, customer, address, normalized_address,
    geocode_lat, geocode_lng, geocode_status, geocode_provider,
    geocode_place_id, geocode_updated_at, geocode_error,
    company, invoice_no, status,
    photo_path, photo_updated_at, updated_at, deleted_at, deleted_by
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
            record["id"],
            record.get("sheet") or "",
            int(record.get("row") or 0),
            int(record.get("seq") or 0),
            record.get("vehicle_no") or "",
            record.get("vehicle_no_normalized") or "",
            record.get("driver") or "",
            record.get("delivery_date"),
            record.get("date_folder") or "",
            record.get("customer") or "",
            record.get("address") or "",
            record.get("normalized_address"),
            record.get("geocode_lat"),
            record.get("geocode_lng"),
            record.get("geocode_status") or GEOCODE_PENDING,
            record.get("geocode_provider"),
            record.get("geocode_place_id"),
            to_datetime(record.get("geocode_updated_at")),
            record.get("geocode_error"),
            record.get("company") or "",
            record.get("invoice_no") or "",
            record.get("status"),
            record.get("photo_path"),
            to_datetime(record.get("photo_updated_at")),
            to_datetime(record.get("updated_at")),
            to_datetime(record.get("deleted_at")),
            record.get("deleted_by"),
        )

    def _replace_delivery(self, cursor, record: dict[str, Any], current_id: str) -> None:
        record = normalize_delivery_record(record)
        cursor.execute(
            """
UPDATE dbo.deliveries
SET id = ?,
    sheet = ?,
    excel_row = ?,
    seq = ?,
    vehicle_no = ?,
    vehicle_no_normalized = ?,
    driver = ?,
    delivery_date = ?,
    date_folder = ?,
    customer = ?,
    address = ?,
    normalized_address = ?,
    geocode_lat = ?,
    geocode_lng = ?,
    geocode_status = ?,
    geocode_provider = ?,
    geocode_place_id = ?,
    geocode_updated_at = ?,
    geocode_error = ?,
    company = ?,
    invoice_no = ?,
    status = ?,
    photo_path = ?,
    photo_updated_at = ?,
    updated_at = ?,
    deleted_at = ?,
    deleted_by = ?
WHERE id = ?
""",
            record["id"],
            record.get("sheet") or "",
            int(record.get("row") or 0),
            int(record.get("seq") or 0),
            record.get("vehicle_no") or "",
            record.get("vehicle_no_normalized") or "",
            record.get("driver") or "",
            record.get("delivery_date"),
            record.get("date_folder") or "",
            record.get("customer") or "",
            record.get("address") or "",
            record.get("normalized_address"),
            record.get("geocode_lat"),
            record.get("geocode_lng"),
            record.get("geocode_status") or GEOCODE_PENDING,
            record.get("geocode_provider"),
            record.get("geocode_place_id"),
            to_datetime(record.get("geocode_updated_at")),
            record.get("geocode_error"),
            record.get("company") or "",
            record.get("invoice_no") or "",
            record.get("status"),
            record.get("photo_path"),
            to_datetime(record.get("photo_updated_at")),
            to_datetime(record.get("updated_at")),
            to_datetime(record.get("deleted_at")),
            record.get("deleted_by"),
            current_id,
        )

    def _update_imported_delivery(self, cursor, record: dict[str, Any]) -> None:
        record = normalize_delivery_record(record)
        cursor.execute(
            """
UPDATE dbo.deliveries
SET id = ?,
    sheet = ?,
    excel_row = ?,
    seq = ?,
    vehicle_no = ?,
    vehicle_no_normalized = ?,
    driver = ?,
    delivery_date = ?,
    date_folder = ?,
    customer = ?,
    address = ?,
    normalized_address = ?,
    geocode_lat = ?,
    geocode_lng = ?,
    geocode_status = ?,
    geocode_provider = ?,
    geocode_place_id = ?,
    geocode_updated_at = ?,
    geocode_error = ?,
    company = ?,
    updated_at = ?
WHERE invoice_no = ?
  AND status IS NULL
""",
            record["id"],
            record.get("sheet") or "",
            int(record.get("row") or 0),
            int(record.get("seq") or 0),
            record.get("vehicle_no") or "",
            record.get("vehicle_no_normalized") or "",
            record.get("driver") or "",
            record.get("delivery_date"),
            record.get("date_folder") or "",
            record.get("customer") or "",
            record.get("address") or "",
            record.get("normalized_address"),
            record.get("geocode_lat"),
            record.get("geocode_lng"),
            record.get("geocode_status") or GEOCODE_PENDING,
            record.get("geocode_provider"),
            record.get("geocode_place_id"),
            to_datetime(record.get("geocode_updated_at")),
            record.get("geocode_error"),
            record.get("company") or "",
            datetime.now().replace(microsecond=0),
            record.get("invoice_no") or "",
        )

    def _save_photo(self, record: dict[str, Any], status: str, photo_data_url: str) -> Path:
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

    def _remove_old_photo(self, old_path: str | None, new_path: str) -> None:
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


class SqlServerUserStore(SqlServerBase):
    def __init__(self, database_config: dict[str, Any], seed_users: list[dict[str, Any]] | None = None) -> None:
        self._lock = threading.Lock()
        super().__init__(database_config)
        self._permissions_column_available = self._user_permissions_column_exists()
        self._display_name_column_available = self._user_display_name_column_exists()
        self._ensure_users(seed_users or [])

    def authenticate(self, username: str, password: str) -> tuple[bool, dict[str, Any] | None, str]:
        username = username.strip()
        now = datetime.now().replace(microsecond=0)

        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    user = self._fetch_user(cursor, username)
                    if not user or not user.get("active", True):
                        return False, None, "帳號或密碼錯誤"

                    locked_until = parse_time(user.get("locked_until"))
                    if locked_until and locked_until > now:
                        minutes = max(1, int((locked_until - now).total_seconds() // 60) + 1)
                        return False, None, f"登入失敗已達 5 次，請等 {minutes} 分鐘後再試"

                    if not verify_password(password, user.get("password_hash", "")):
                        failures = int(user.get("failed_attempts", 0)) + 1
                        locked_value = None
                        if failures >= LOCK_AFTER_FAILURES:
                            locked_value = now + timedelta(minutes=LOCK_MINUTES)
                            message = "登入失敗已達 5 次，帳號鎖定 10 分鐘"
                        else:
                            remaining = LOCK_AFTER_FAILURES - failures
                            message = f"帳號或密碼錯誤，已失敗 {failures} 次，剩餘 {remaining} 次將鎖定 10 分鐘"
                        cursor.execute(
                            """
UPDATE dbo.users
SET failed_attempts = ?,
    locked_until = ?,
    updated_at = ?
WHERE username = ?
""",
                            failures,
                            locked_value,
                            now,
                            username,
                        )
                        connection.commit()
                        return False, None, message

                    cursor.execute(
                        """
UPDATE dbo.users
SET failed_attempts = 0,
    locked_until = NULL,
    last_login_at = ?,
    updated_at = ?
WHERE username = ?
""",
                        now,
                        now,
                        username,
                    )
                    connection.commit()
                    refreshed = self._fetch_user(username)
                    return True, public_user(refreshed), ""
                except Exception:
                    connection.rollback()
                    raise

    def list_users(self) -> list[dict[str, Any]]:
        rows = self._fetch_rows(
            f"""
SELECT username, role, active, failed_attempts,
       CONVERT(varchar(19), locked_until, 126) AS locked_until,
       CONVERT(varchar(19), last_login_at, 126) AS last_login_at,
       {self._permissions_select()} AS permissions_json,
       {self._display_name_select()} AS display_name
FROM dbo.users
ORDER BY username
""",
            [],
        )
        return [
            public_user({
                "username": row[0],
                "role": row[1],
                "active": bool(row[2]),
                "failed_attempts": int(row[3] or 0),
                "locked_until": row[4],
                "last_login_at": row[5],
                "permissions": parse_permissions_json(row[6], row[1]),
                "display_name": row[7],
            })
            for row in rows
        ]

    def upsert_user(
        self,
        username: str,
        role: str,
        password: str | None = None,
        active: bool = True,
        permissions: dict[str, Any] | None = None,
        display_name: str | None = None,
    ) -> dict[str, Any]:
        username = username.strip()
        role = role.strip()
        if not username:
            raise ValueError("請輸入使用者名稱")
        if role not in ROLES:
            raise ValueError("角色必須是 driver 或 admin")
        if permissions is not None and not self._permissions_column_available:
            raise ValueError("SQL Server 尚未加入帳號權限欄位，請先執行 docs/sql/2026-06-30-add-user-permissions.sql")
        if display_name is not None and not self._display_name_column_available:
            raise ValueError("SQL Server 尚未加入使用者名稱欄位，請先執行 docs/sql/2026-06-30-add-user-display-name.sql")

        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                try:
                    user = self._fetch_user(cursor, username)
                    now = datetime.now().replace(microsecond=0)
                    normalized_permissions = normalize_permissions(
                        permissions if permissions is not None else (user or {}).get("permissions"),
                        role,
                    )
                    permissions_json = json.dumps(normalized_permissions, ensure_ascii=False)
                    display_name_value = str(display_name if display_name is not None else (user or {}).get("display_name", "")).strip()
                    if not user:
                        if not password:
                            raise ValueError("新增使用者需要密碼")
                        if self._permissions_column_available and self._display_name_column_available:
                            cursor.execute(
                                """
INSERT INTO dbo.users (
    username, display_name, role, password_hash, active, permissions_json, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
""",
                                username,
                                display_name_value,
                                role,
                                hash_password(password),
                                1 if active else 0,
                                permissions_json,
                                now,
                                now,
                            )
                        elif self._permissions_column_available:
                            cursor.execute(
                                """
INSERT INTO dbo.users (
    username, role, password_hash, active, permissions_json, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
""",
                                username,
                                role,
                                hash_password(password),
                                1 if active else 0,
                                permissions_json,
                                now,
                                now,
                            )
                        else:
                            cursor.execute(
                                """
INSERT INTO dbo.users (
    username, role, password_hash, active, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, 0, NULL, NULL, ?, ?)
""",
                            username,
                            role,
                            hash_password(password),
                            1 if active else 0,
                            now,
                            now,
                            )
                    elif password:
                        if self._permissions_column_available and self._display_name_column_available:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    display_name = ?,
    password_hash = ?,
    active = ?,
    permissions_json = ?,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = ?
WHERE username = ?
""",
                                role,
                                display_name_value,
                                hash_password(password),
                                1 if active else 0,
                                permissions_json,
                                now,
                                username,
                            )
                        elif self._permissions_column_available:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    password_hash = ?,
    active = ?,
    permissions_json = ?,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = ?
WHERE username = ?
""",
                                role,
                                hash_password(password),
                                1 if active else 0,
                                permissions_json,
                                now,
                                username,
                            )
                        else:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    password_hash = ?,
    active = ?,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = ?
WHERE username = ?
""",
                            role,
                            hash_password(password),
                            1 if active else 0,
                            now,
                            username,
                            )
                    else:
                        if self._permissions_column_available and self._display_name_column_available:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    display_name = ?,
    active = ?,
    permissions_json = ?,
    updated_at = ?
WHERE username = ?
""",
                                role,
                                display_name_value,
                                1 if active else 0,
                                permissions_json,
                                now,
                                username,
                            )
                        elif self._permissions_column_available:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    active = ?,
    permissions_json = ?,
    updated_at = ?
WHERE username = ?
""",
                                role,
                                1 if active else 0,
                                permissions_json,
                                now,
                                username,
                            )
                        else:
                            cursor.execute(
                                """
UPDATE dbo.users
SET role = ?,
    active = ?,
    updated_at = ?
WHERE username = ?
""",
                            role,
                            1 if active else 0,
                            now,
                            username,
                            )
                    connection.commit()
                    return public_user(self._fetch_user(username))
                except Exception:
                    connection.rollback()
                    raise

    def delete_user(self, username: str) -> None:
        username = username.strip()
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                cursor.execute("DELETE FROM dbo.users WHERE username = ?", username)
                connection.commit()

    def _ensure_users(self, seed_users: list[dict[str, Any]]) -> None:
        with self._lock:
            with self._connect() as connection:
                cursor = connection.cursor()
                for seed in normalized_seed_users(seed_users):
                    username = str(seed.get("username", "")).strip()
                    if not username:
                        continue
                    cursor.execute("SELECT 1 FROM dbo.users WHERE username = ?", username)
                    if cursor.fetchone():
                        continue
                    user = make_seed_user(
                        username,
                        seed.get("password", ""),
                        seed.get("role", "driver"),
                        seed.get("permissions"),
                        seed.get("display_name"),
                    )
                    if self._permissions_column_available and self._display_name_column_available:
                        cursor.execute(
                            """
INSERT INTO dbo.users (
    username, display_name, role, password_hash, active, permissions_json, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                            user["username"],
                            user.get("display_name", ""),
                            user["role"],
                            user["password_hash"],
                            1 if user.get("active", True) else 0,
                            json.dumps(user["permissions"], ensure_ascii=False),
                            int(user.get("failed_attempts", 0)),
                            to_datetime(user.get("locked_until")),
                            to_datetime(user.get("last_login_at")),
                            to_datetime(user.get("created_at")),
                            to_datetime(user.get("updated_at")),
                        )
                    elif self._permissions_column_available:
                        cursor.execute(
                            """
INSERT INTO dbo.users (
    username, role, password_hash, active, permissions_json, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                            user["username"],
                            user["role"],
                            user["password_hash"],
                            1 if user.get("active", True) else 0,
                            json.dumps(user["permissions"], ensure_ascii=False),
                            int(user.get("failed_attempts", 0)),
                            to_datetime(user.get("locked_until")),
                            to_datetime(user.get("last_login_at")),
                            to_datetime(user.get("created_at")),
                            to_datetime(user.get("updated_at")),
                        )
                    else:
                        cursor.execute(
                            """
INSERT INTO dbo.users (
    username, role, password_hash, active, failed_attempts,
    locked_until, last_login_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                        user["username"],
                        user["role"],
                        user["password_hash"],
                        1 if user.get("active", True) else 0,
                        int(user.get("failed_attempts", 0)),
                        to_datetime(user.get("locked_until")),
                        to_datetime(user.get("last_login_at")),
                        to_datetime(user.get("created_at")),
                        to_datetime(user.get("updated_at")),
                        )
                connection.commit()

    def _fetch_rows(self, sql: str, params: list[Any]):
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute(sql, params)
            return cursor.fetchall()

    def _fetch_user(self, cursor_or_username, username: str | None = None) -> dict[str, Any] | None:
        if username is None:
            with self._connect() as connection:
                cursor = connection.cursor()
                return self._fetch_user(cursor, str(cursor_or_username))

        cursor = cursor_or_username
        cursor.execute(
            f"""
SELECT username, role, password_hash, active, failed_attempts,
       CONVERT(varchar(19), locked_until, 126) AS locked_until,
       CONVERT(varchar(19), last_login_at, 126) AS last_login_at,
       {self._permissions_select()} AS permissions_json,
       {self._display_name_select()} AS display_name
FROM dbo.users
WHERE username = ?
""",
            username,
        )
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "username": row[0],
            "role": row[1],
            "password_hash": row[2],
            "active": bool(row[3]),
            "failed_attempts": int(row[4] or 0),
            "locked_until": row[5],
            "last_login_at": row[6],
            "permissions": parse_permissions_json(row[7], row[1]),
            "display_name": row[8],
        }

    def _permissions_select(self) -> str:
        if self._permissions_column_available:
            return "permissions_json"
        return "CAST(NULL AS nvarchar(max))"

    def _display_name_select(self) -> str:
        if self._display_name_column_available:
            return "display_name"
        return "CAST(N'' AS nvarchar(255))"

    def _user_permissions_column_exists(self) -> bool:
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT COL_LENGTH(N'dbo.users', N'permissions_json')")
            row = cursor.fetchone()
            return bool(row and row[0] is not None)

    def _user_display_name_column_exists(self) -> bool:
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT COL_LENGTH(N'dbo.users', N'display_name')")
            row = cursor.fetchone()
            return bool(row and row[0] is not None)


def load_pyodbc():
    try:
        return importlib.import_module("pyodbc")
    except ImportError as exc:
        raise RuntimeError(
            "SQL Server backend requires pyodbc. Install it with: python -m pip install pyodbc"
        ) from exc


def require_config(config: dict[str, Any], key: str) -> str:
    value = str(config.get(key) or "").strip()
    if not value:
        raise ValueError(f"SQL Server config missing: database.{key}")
    return value


def odbc_value(value: Any) -> str:
    text = str(value)
    if ";" in text or text.startswith("{") or text.endswith("}"):
        return "{" + text.replace("}", "}}") + "}"
    return text


def yes_no(value: Any) -> str:
    return "yes" if bool(value) else "no"


def row_to_delivery(row) -> dict[str, Any]:
    record = dict(zip(DELIVERY_FIELDS, row))
    record["row"] = int(record.get("row") or 0)
    record["seq"] = int(record.get("seq") or 0)
    record["geocode_lat"] = optional_float(record.get("geocode_lat"))
    record["geocode_lng"] = optional_float(record.get("geocode_lng"))
    return record


def public_delivery(record: dict[str, Any]) -> dict[str, Any]:
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


def same_imported_values(existing: dict[str, Any], imported: dict[str, Any]) -> bool:
    return all(existing.get(field) == imported.get(field) for field in IMPORTED_FIELDS)


def same_delivery_values(existing: dict[str, Any], incoming: dict[str, Any]) -> bool:
    return all(existing.get(field) == incoming.get(field) for field in DELIVERY_FIELDS)


def normalize_delivery_record(record: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(record)
    delivery_date = normalize_delivery_date(normalized.get("delivery_date", ""))
    if not delivery_date and normalized.get("date_folder"):
        delivery_date = normalize_delivery_date(normalized["date_folder"])
    normalized["delivery_date"] = delivery_date
    normalized["date_folder"] = normalized.get("date_folder") or date_to_folder(delivery_date)
    normalized["row"] = int(normalized.get("row") or 0)
    normalized["seq"] = int(normalized.get("seq") or 0)
    normalized["vehicle_no"] = str(normalized.get("vehicle_no") or "")
    normalized["vehicle_no_normalized"] = str(
        normalized.get("vehicle_no_normalized") or normalize_vehicle_no(normalized["vehicle_no"])
    )
    normalized["driver"] = str(normalized.get("driver") or "")
    normalized["customer"] = str(normalized.get("customer") or "")
    normalized["address"] = str(normalized.get("address") or "")
    geocode_defaults = default_geocode_fields(normalized["address"])
    for field, value in geocode_defaults.items():
        if normalized.get(field) is None:
            normalized[field] = value
    normalized["geocode_lat"] = optional_float(normalized.get("geocode_lat"))
    normalized["geocode_lng"] = optional_float(normalized.get("geocode_lng"))
    normalized["company"] = str(normalized.get("company") or "")
    normalized["invoice_no"] = str(normalized.get("invoice_no") or "")
    normalized["sheet"] = str(normalized.get("sheet") or "")
    return normalized


def optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def geocode_cache_key(normalized_address: str) -> str:
    return hashlib.sha256(normalized_address.encode("utf-8")).hexdigest()


def to_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.replace(microsecond=0)
    try:
        return datetime.fromisoformat(str(value)).replace(microsecond=0)
    except ValueError:
        return None


def normalized_seed_users(seed_users: list[dict[str, Any]]) -> list[dict[str, Any]]:
    users = list(seed_users)
    names = {str(user.get("username", "")).strip() for user in users}
    if "admin" not in names:
        users.append({"username": "admin", "password": "admin123", "role": "admin"})
    if "driver" not in names:
        users.append({"username": "driver", "password": "1234", "role": "driver"})
    return users


def parse_permissions_json(value: Any, role: str) -> dict[str, bool]:
    if not value:
        return normalize_permissions(None, role)
    try:
        return normalize_permissions(json.loads(str(value)), role)
    except (TypeError, ValueError):
        return normalize_permissions(None, role)
