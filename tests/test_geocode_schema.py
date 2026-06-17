import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class GeocodeSchemaTest(unittest.TestCase):
    def test_sqlserver_store_declares_delivery_geocode_columns_and_cache_table(self):
        sqlserver_store = (ROOT / "delivery_app" / "sqlserver_store.py").read_text(encoding="utf-8")

        for snippet in (
            "address nvarchar(1000)",
            "normalized_address nvarchar(1000)",
            "geocode_lat decimal(9,6)",
            "geocode_lng decimal(9,6)",
            "geocode_status nvarchar(20)",
            "geocode_provider nvarchar(50)",
            "geocode_place_id nvarchar(255)",
            "geocode_updated_at datetime2(0)",
            "geocode_error nvarchar(500)",
            "dbo.address_geocode_cache",
        ):
            self.assertIn(snippet, sqlserver_store)

    def test_migration_script_adds_delivery_geocode_columns_and_cache_table(self):
        migration = (ROOT / "docs" / "sql" / "2026-06-17-add-delivery-geocode-fields.sql").read_text(encoding="utf-8")

        for snippet in (
            "ALTER TABLE dbo.deliveries ADD address nvarchar(1000)",
            "ALTER TABLE dbo.deliveries ADD normalized_address nvarchar(1000)",
            "ALTER TABLE dbo.deliveries ADD geocode_lat decimal(9,6)",
            "ALTER TABLE dbo.deliveries ADD geocode_lng decimal(9,6)",
            "ALTER TABLE dbo.deliveries ADD geocode_status nvarchar(20)",
            "CREATE TABLE dbo.address_geocode_cache",
        ):
            self.assertIn(snippet, migration)


if __name__ == "__main__":
    unittest.main()
