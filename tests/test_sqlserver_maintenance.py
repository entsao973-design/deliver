import tempfile
import threading
import unittest
from pathlib import Path

from delivery_app.sqlserver_store import DELIVERY_FIELDS, SqlServerRepository


class FakeCursor:
    def __init__(self, rowcount=0, error=None, fetchone_rows=None, fetchall_rows=None):
        self.rowcount = rowcount
        self.error = error
        self.executions = []
        self.fetchone_rows = list(fetchone_rows or [])
        self.fetchall_rows = list(fetchall_rows or [])

    def execute(self, sql, *params):
        self.executions.append((sql, params))
        if self.error:
            raise self.error

    def fetchone(self):
        return self.fetchone_rows.pop(0) if self.fetchone_rows else None

    def fetchall(self):
        return self.fetchall_rows


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class SqlServerMaintenanceTest(unittest.TestCase):
    def test_cleanup_delivery_history_deletes_inclusive_range_and_commits(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            cursor = FakeCursor(rowcount=7)
            connection = FakeConnection(cursor)
            repo = make_repository(root, connection)
            (repo.photo_root / "20260610").mkdir()
            (repo.photo_root / "20260610" / "photo.jpg").write_bytes(b"photo")
            (repo.archive_root / "20260612_Company.zip").write_bytes(b"zip")

            summary = repo.cleanup_delivery_history("2026-06-10", "2026-06-12")

            sql, params = cursor.executions[0]
            self.assertIn("DELETE FROM dbo.deliveries", sql)
            self.assertIn("delivery_date >= ?", sql)
            self.assertIn("delivery_date <= ?", sql)
            self.assertNotIn("status", sql.lower())
            self.assertNotIn("deleted_at", sql.lower())
            self.assertEqual(params, ("2026-06-10", "2026-06-12"))
            self.assertTrue(connection.committed)
            self.assertFalse(connection.rolled_back)
            self.assertEqual(
                summary,
                {
                    "deleted_records": 7,
                    "deleted_photo_date_folders": 1,
                    "deleted_archives": 1,
                },
            )

    def test_cleanup_delivery_history_rolls_back_before_file_cleanup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            cursor = FakeCursor(error=RuntimeError("database unavailable"))
            connection = FakeConnection(cursor)
            repo = make_repository(root, connection)
            photo_folder = repo.photo_root / "20260610"
            photo_folder.mkdir()
            (photo_folder / "photo.jpg").write_bytes(b"photo")
            archive_path = repo.archive_root / "20260610_Company.zip"
            archive_path.write_bytes(b"zip")

            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                repo.cleanup_delivery_history("2026-06-10", "2026-06-12")

            self.assertFalse(connection.committed)
            self.assertTrue(connection.rolled_back)
            self.assertTrue(photo_folder.exists())
            self.assertTrue(archive_path.exists())

    def test_cleanup_delivery_history_rejects_invalid_date_range_before_connecting(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            connection_calls = []
            repo = make_repository(root, FakeConnection(FakeCursor()), connection_calls)

            with self.assertRaisesRegex(ValueError, "日期格式"):
                repo.cleanup_delivery_history("2026-02-30", "2026-03-01")
            with self.assertRaisesRegex(ValueError, "開始日期"):
                repo.cleanup_delivery_history("2026-03-02", "2026-03-01")

            self.assertEqual(connection_calls, [])

    def test_permanent_delete_delivery_removes_matching_archive_zip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            row = make_sql_delivery_row(
                record_id="selected",
                delivery_date="2026-06-10",
                company="SelectedCo",
                deleted_at="2026-06-11T10:00:00",
            )
            cursor = FakeCursor(fetchone_rows=[row])
            connection = FakeConnection(cursor)
            repo = make_repository(root, connection)
            selected_archive = repo.archive_root / "20260610_SelectedCo.zip"
            kept_archive = repo.archive_root / "20260610_KeptCo.zip"
            selected_archive.write_bytes(b"selected zip")
            kept_archive.write_bytes(b"kept zip")

            repo.permanently_delete_delivery("selected")

            self.assertTrue(connection.committed)
            self.assertFalse(selected_archive.exists())
            self.assertTrue(kept_archive.exists())

    def test_permanently_delete_deliveries_removes_matching_archive_zips(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            selected_row = make_sql_delivery_row(
                record_id="selected",
                delivery_date="2026-06-10",
                company="SelectedCo",
                deleted_at="2026-06-11T10:00:00",
            )
            cursor = FakeCursor(rowcount=1, fetchall_rows=[selected_row])
            connection = FakeConnection(cursor)
            repo = make_repository(root, connection)
            selected_archive = repo.archive_root / "20260610_SelectedCo.zip"
            kept_archive = repo.archive_root / "20260610_KeptCo.zip"
            selected_archive.write_bytes(b"selected zip")
            kept_archive.write_bytes(b"kept zip")

            summary = repo.permanently_delete_deliveries(["selected"])

            self.assertEqual(summary, {"deleted_records": 1})
            self.assertTrue(connection.committed)
            self.assertFalse(selected_archive.exists())
            self.assertTrue(kept_archive.exists())


def make_repository(root, connection, connection_calls=None):
    repo = object.__new__(SqlServerRepository)
    repo._lock = threading.Lock()
    repo.photo_root = root / "photos"
    repo.archive_root = root / "archives"
    repo.photo_root.mkdir()
    repo.archive_root.mkdir()

    def connect():
        if connection_calls is not None:
            connection_calls.append(True)
        return connection

    repo._connect = connect
    return repo


def make_sql_delivery_row(
    record_id: str,
    delivery_date: str,
    company: str,
    deleted_at: str | None,
):
    record = {
        "id": record_id,
        "sheet": "Sheet1",
        "row": 1,
        "seq": 1,
        "vehicle_no": "TEST-001",
        "vehicle_no_normalized": "TEST-001",
        "driver": "Driver",
        "delivery_date": delivery_date,
        "date_folder": delivery_date.replace("-", ""),
        "customer": f"Customer {record_id}",
        "address": "Address",
        "normalized_address": "Address",
        "geocode_lat": None,
        "geocode_lng": None,
        "geocode_status": "empty",
        "geocode_provider": None,
        "geocode_place_id": None,
        "geocode_updated_at": None,
        "geocode_error": None,
        "company": company,
        "invoice_no": f"INV-{record_id}",
        "status": "normal",
        "photo_path": None,
        "photo_updated_at": None,
        "updated_at": None,
        "deleted_at": deleted_at,
        "deleted_by": "admin" if deleted_at else None,
    }
    return tuple(record[field] for field in DELIVERY_FIELDS)


if __name__ == "__main__":
    unittest.main()
