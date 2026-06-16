import tempfile
import unittest
from pathlib import Path

from delivery_app import sqlserver_store


class SqlServerStartupTest(unittest.TestCase):
    def test_does_not_auto_import_excel_on_empty_database_by_default(self):
        calls = []

        with patched_sqlserver_repository(calls), tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "default.xlsx"
            excel_path.write_bytes(b"placeholder")

            sqlserver_store.SqlServerRepository(
                {
                    "server": "test",
                    "username": "test",
                    "password": "test",
                    "initialize_schema": False,
                },
                str(excel_path),
                str(Path(temp_dir) / "photos"),
                str(Path(temp_dir) / "archives"),
            )

        self.assertEqual(calls, [])

    def test_can_auto_import_excel_when_explicitly_enabled(self):
        calls = []

        with patched_sqlserver_repository(calls), tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "default.xlsx"
            excel_path.write_bytes(b"placeholder")

            sqlserver_store.SqlServerRepository(
                {
                    "server": "test",
                    "username": "test",
                    "password": "test",
                    "initialize_schema": False,
                    "auto_import_on_empty": True,
                },
                str(excel_path),
                str(Path(temp_dir) / "photos"),
                str(Path(temp_dir) / "archives"),
            )

        self.assertEqual(calls, ["reload"])


class patched_sqlserver_repository:
    def __init__(self, calls):
        self.calls = calls
        self.original_base_init = sqlserver_store.SqlServerBase.__init__
        self.original_count = sqlserver_store.SqlServerRepository._count_deliveries
        self.original_reload = sqlserver_store.SqlServerRepository.reload_from_excel

    def __enter__(self):
        calls = self.calls
        sqlserver_store.SqlServerBase.__init__ = lambda instance, config: setattr(instance, "database_config", config)
        sqlserver_store.SqlServerRepository._count_deliveries = lambda instance: 0
        sqlserver_store.SqlServerRepository.reload_from_excel = lambda instance: calls.append("reload")
        return self

    def __exit__(self, exc_type, exc, traceback):
        sqlserver_store.SqlServerBase.__init__ = self.original_base_init
        sqlserver_store.SqlServerRepository._count_deliveries = self.original_count
        sqlserver_store.SqlServerRepository.reload_from_excel = self.original_reload


if __name__ == "__main__":
    unittest.main()
