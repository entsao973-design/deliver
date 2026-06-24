import tempfile
import threading
import unittest
from pathlib import Path

from delivery_app.sqlserver_store import SqlServerRepository


class FakeCursor:
    def __init__(self, rowcount=0, error=None):
        self.rowcount = rowcount
        self.error = error
        self.executions = []

    def execute(self, sql, *params):
        self.executions.append((sql, params))
        if self.error:
            raise self.error


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


if __name__ == "__main__":
    unittest.main()
