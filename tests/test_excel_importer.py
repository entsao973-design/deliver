import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

import openpyxl

from delivery_app.excel_importer import import_deliveries
from delivery_app.auth import UserStore
from delivery_app.repository import DeliveryRepository


SAMPLE_EXCEL = Path(
    os.environ.get(
        "SAMPLE_EXCEL",
        r"C:\Users\duncan.DUNCAN-PC\Desktop\溫控車配送紀錄 - 2026.06.10北區.中一.xlsm",
    )
)


def build_delivery_workbook(path: Path) -> None:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "測試車"
    sheet["A3"] = "車號：TEST-001"
    sheet["C3"] = "物流士：測試司機"
    sheet["H3"] = "配送日期:2026/6/11"
    headers = ["序號", "客戶名稱", "地址", "電話及備註", "收貨時間", "產品簡稱", "數量", "件數", "公司", "類別", "出貨單號"]
    for column, value in enumerate(headers, 1):
        sheet.cell(4, column).value = value

    sheet.merge_cells("A5:A6")
    sheet["A5"] = 1
    sheet["B5"] = "合併客戶"
    sheet["I5"] = "公司甲"
    sheet["K5"] = "INV-MERGED-1"
    sheet["I6"] = "公司乙"
    sheet["K6"] = "INV-MERGED-2"
    sheet["A7"] = "備註"
    sheet["K7"] = "IGNORED"
    sheet["A8"] = 2
    sheet["B8"] = "第二客戶"
    sheet["I8"] = "公司丙"
    sheet["K8"] = "INV-2"
    sheet["A9"] = None
    sheet["K9"] = "IGNORED-BLANK"
    sheet["A10"] = 3
    sheet["B10"] = "第三客戶"
    sheet["I10"] = "公司丁"
    sheet["K10"] = "INV-3"
    workbook.save(path)
    workbook.close()


@unittest.skipUnless(SAMPLE_EXCEL.exists(), "sample Excel file not found")
class ExcelImporterTest(unittest.TestCase):
    def test_imports_delivery_sheets(self):
        result = import_deliveries(SAMPLE_EXCEL)
        deliveries = result["deliveries"]

        self.assertEqual(len(deliveries), 16)
        self.assertEqual(deliveries[0]["date_folder"], "20260610")

        vehicles = {record["vehicle_no"] for record in deliveries}
        self.assertIn("RFC-7983", vehicles)
        self.assertIn("RFW-9372", vehicles)
        self.assertIn("RFW-3960", vehicles)

    def test_stops_when_sequence_is_blank(self):
        result = import_deliveries(SAMPLE_EXCEL)
        by_vehicle = {}
        for record in result["deliveries"]:
            by_vehicle.setdefault(record["vehicle_no"], 0)
            by_vehicle[record["vehicle_no"]] += 1

        self.assertEqual(by_vehicle["RFC-7983"], 6)
        self.assertEqual(by_vehicle["RFW-9372"], 6)
        self.assertEqual(by_vehicle["RFW-3960"], 4)

    def test_filters_by_delivery_date(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = DeliveryRepository(
                str(SAMPLE_EXCEL),
                str(Path(temp_dir) / "deliveries.json"),
                str(Path(temp_dir) / "photos"),
            )

            self.assertEqual(
                repo.dates_for_vehicle("RFW-3960"),
                [{"delivery_date": "2026-06-10", "date_folder": "20260610"}],
            )
            self.assertEqual(repo.counts_for_vehicle("RFW-3960", "2026-06-10")["total"], 4)
            self.assertEqual(repo.list_for_vehicle("RFW-3960", include_delivered=True, delivery_date="20260610")[0]["delivery_date"], "2026-06-10")

    def test_reload_preserves_other_dates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_file = Path(temp_dir) / "deliveries.json"
            repo = DeliveryRepository(str(SAMPLE_EXCEL), str(data_file), str(Path(temp_dir) / "photos"))

            data = json.loads(data_file.read_text(encoding="utf-8"))
            old_record = dict(data["deliveries"][0])
            old_record["id"] = "old-date-record"
            old_record["invoice_no"] = "OLD-DATE-001"
            old_record["delivery_date"] = "2026-06-09"
            old_record["date_folder"] = "20260609"
            data["deliveries"].append(old_record)
            data_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            repo.reload_from_excel()

            dates = repo.dates_for_vehicle(old_record["vehicle_no"])
            self.assertIn({"delivery_date": "2026-06-09", "date_folder": "20260609"}, dates)
            self.assertIn({"delivery_date": "2026-06-10", "date_folder": "20260610"}, dates)

    def test_reimport_updates_undelivered_invoice_and_locks_delivered(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_file = Path(temp_dir) / "deliveries.json"
            repo = DeliveryRepository(str(SAMPLE_EXCEL), str(data_file), str(Path(temp_dir) / "photos"))

            data = json.loads(data_file.read_text(encoding="utf-8"))
            first = data["deliveries"][0]
            first["vehicle_no"] = "OLD-CAR"
            first["vehicle_no_normalized"] = "OLD-CAR"
            data_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            summary = repo.import_excel_file(SAMPLE_EXCEL)
            self.assertGreaterEqual(summary["updated"], 1)
            refreshed = json.loads(data_file.read_text(encoding="utf-8"))
            self.assertEqual(refreshed["deliveries"][0]["vehicle_no"], "RFC-7983")

            refreshed["deliveries"][0]["status"] = "normal"
            refreshed["deliveries"][0]["vehicle_no"] = "LOCKED-CAR"
            data_file.write_text(json.dumps(refreshed, ensure_ascii=False), encoding="utf-8")

            summary = repo.import_excel_file(SAMPLE_EXCEL)
            self.assertGreaterEqual(summary["locked_delivered"], 1)
            locked = json.loads(data_file.read_text(encoding="utf-8"))
            self.assertEqual(locked["deliveries"][0]["vehicle_no"], "LOCKED-CAR")


class ImporterRulesTest(unittest.TestCase):
    def test_repository_allows_missing_default_excel(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_file = Path(temp_dir) / "deliveries.json"
            repo = DeliveryRepository(None, str(data_file), str(Path(temp_dir) / "photos"))

            self.assertEqual(repo.counts_for_vehicle("TEST-001")["total"], 0)

            excel_path = Path(temp_dir) / "uploaded.xlsx"
            build_delivery_workbook(excel_path)
            summary = repo.import_excel_file(excel_path)

            self.assertEqual(summary["inserted"], 4)
            self.assertEqual(repo.counts_for_vehicle("TEST-001", "2026-06-11")["total"], 4)

    def test_imports_merged_sequence_rows_and_ignores_non_numeric_rows(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "merged.xlsx"
            build_delivery_workbook(excel_path)

            result = import_deliveries(excel_path)
            invoices = {record["invoice_no"]: record for record in result["deliveries"]}

            self.assertEqual(set(invoices), {"INV-MERGED-1", "INV-MERGED-2", "INV-2", "INV-3"})
            self.assertEqual(invoices["INV-MERGED-2"]["customer"], "合併客戶")
            self.assertEqual(invoices["INV-MERGED-2"]["company"], "公司乙")
            self.assertEqual(invoices["INV-3"]["seq"], 3)

    def test_vehicle_options_use_latest_delivery_date(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "merged.xlsx"
            data_file = Path(temp_dir) / "deliveries.json"
            build_delivery_workbook(excel_path)
            DeliveryRepository(str(excel_path), str(data_file), str(Path(temp_dir) / "photos"))

            data = json.loads(data_file.read_text(encoding="utf-8"))
            older_record = dict(data["deliveries"][0])
            older_record["id"] = "older-vehicle"
            older_record["vehicle_no"] = "OLD-CAR"
            older_record["vehicle_no_normalized"] = "OLD-CAR"
            older_record["delivery_date"] = "2026-06-10"
            older_record["date_folder"] = "20260610"
            data["deliveries"].append(older_record)
            data_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

            repo = DeliveryRepository(None, str(data_file), str(Path(temp_dir) / "photos"))

            self.assertEqual(
                repo.vehicles_for_latest_date(),
                {
                    "delivery_date": "2026-06-11",
                    "vehicles": ["TEST-001"],
                    "vehicle_options": [{"vehicle_no": "TEST-001", "driver": "測試司機"}],
                },
            )

    def test_filter_options_use_date_range_and_deleted_state(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_file = Path(temp_dir) / "deliveries.json"
            data_file.write_text(
                json.dumps(
                    {
                        "deliveries": [
                            make_delivery_record("old", "2026-06-10", "OldCo", "OldDriver"),
                            make_delivery_record("in-range", "2026-06-12", "RangeCo", "RangeDriver"),
                            make_delivery_record("new", "2026-06-14", "NewCo", "NewDriver"),
                            make_delivery_record(
                                "deleted",
                                "2026-06-12",
                                "DeletedCo",
                                "DeletedDriver",
                                deleted_at="2026-06-13T10:00:00",
                            ),
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            repo = DeliveryRepository(None, str(data_file), str(Path(temp_dir) / "photos"))

            self.assertEqual(
                repo.filter_options(start_date="2026-06-11", end_date="2026-06-13"),
                {
                    "dates": ["2026-06-12"],
                    "companies": ["RangeCo"],
                    "drivers": ["RangeDriver"],
                },
            )
            self.assertEqual(
                repo.filter_options(start_date="2026-06-11", end_date="2026-06-13", deleted=True),
                {
                    "dates": ["2026-06-12"],
                    "companies": ["DeletedCo"],
                    "drivers": ["DeletedDriver"],
                },
            )

    def test_photo_path_uses_company_folder_and_status_suffix(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "merged.xlsx"
            build_delivery_workbook(excel_path)
            repo = DeliveryRepository(str(excel_path), str(Path(temp_dir) / "deliveries.json"), str(Path(temp_dir) / "photos"))
            delivery = repo.list_for_vehicle("TEST-001", include_delivered=True, delivery_date="2026-06-11")[0]

            repo.update_photo(delivery["id"], "abnormal", "data:image/jpeg;base64,dGVzdA==")
            path = repo.photo_path_for(delivery["id"])

            self.assertIsNotNone(path)
            self.assertEqual(path.name, f"{delivery['invoice_no']}_異常.JPG")
            self.assertEqual(path.parent.name, delivery["company"])
            self.assertEqual(path.parent.parent.name, "20260611")

    def test_update_photo_uses_captured_at_for_photo_time(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "merged.xlsx"
            build_delivery_workbook(excel_path)
            repo = DeliveryRepository(str(excel_path), str(Path(temp_dir) / "deliveries.json"), str(Path(temp_dir) / "photos"))
            delivery = repo.list_for_vehicle("TEST-001", include_delivered=True, delivery_date="2026-06-11")[0]

            updated = repo.update_photo(
                delivery["id"],
                "normal",
                "data:image/jpeg;base64,dGVzdA==",
                captured_at="2026-06-14T09:30:00",
            )

            self.assertEqual(updated["photo_updated_at"], "2026-06-14T09:30:00")

    def test_archive_photos_creates_company_zip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            excel_path = Path(temp_dir) / "merged.xlsx"
            build_delivery_workbook(excel_path)
            repo = DeliveryRepository(str(excel_path), str(Path(temp_dir) / "deliveries.json"), str(Path(temp_dir) / "photos"))
            delivery = repo.list_for_vehicle("TEST-001", include_delivered=True, delivery_date="2026-06-11")[0]
            repo.update_photo(delivery["id"], "normal", "data:image/jpeg;base64,dGVzdA==")

            archives = repo.archive_photos("2026-06-11")
            archive = next(item for item in archives if item["company"] == delivery["company"])
            archive_path = repo.archive_path_for(archive["name"])

            self.assertIsNotNone(archive_path)
            with zipfile.ZipFile(archive_path) as zip_file:
                self.assertIn(f"{delivery['invoice_no']}.JPG", zip_file.namelist())


class UserStoreTest(unittest.TestCase):
    def test_locks_after_five_failed_logins(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = UserStore(str(Path(temp_dir) / "users.json"), [{"username": "driver", "password": "1234"}])

            for index in range(4):
                ok, user, message = store.authenticate("driver", "wrong")
                self.assertFalse(ok)
                self.assertIn(f"已失敗 {index + 1} 次", message)

            ok, user, message = store.authenticate("driver", "wrong")
            self.assertFalse(ok)
            self.assertIn("鎖定 10 分鐘", message)

            ok, user, message = store.authenticate("driver", "1234")
            self.assertFalse(ok)
            self.assertIn("分鐘後再試", message)


def make_delivery_record(
    record_id: str,
    delivery_date: str,
    company: str,
    driver: str,
    deleted_at: str | None = None,
) -> dict[str, object]:
    return {
        "id": record_id,
        "seq": 1,
        "vehicle_no": "TEST-001",
        "vehicle_no_normalized": "TEST-001",
        "driver": driver,
        "delivery_date": delivery_date,
        "date_folder": delivery_date.replace("-", ""),
        "customer": f"Customer {record_id}",
        "company": company,
        "invoice_no": f"INV-{record_id}",
        "status": None,
        "photo_path": None,
        "photo_updated_at": None,
        "updated_at": None,
        "deleted_at": deleted_at,
        "deleted_by": "admin" if deleted_at else None,
    }


if __name__ == "__main__":
    unittest.main()
