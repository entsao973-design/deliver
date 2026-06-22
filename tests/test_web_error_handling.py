import http.client
import json
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path

from delivery_app.web import DeliveryServer, load_config


@contextmanager
def running_server():
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        app = DeliveryServer(
            {
                "storage_backend": "json",
                "excel_path": None,
                "data_file": str(root / "deliveries.json"),
                "photo_root": str(root / "photos"),
                "archive_root": str(root / "archives"),
                "upload_dir": str(root / "uploads"),
                "users": [],
            }
        )
        app.sessions["admin-token"] = {
            "username": "admin",
            "role": "admin",
            "vehicle_no": None,
        }
        server = ThreadingHTTPServer(("127.0.0.1", 0), app.handler_class())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def request_json(address, method, path, body=None, headers=None):
    connection = http.client.HTTPConnection(address[0], address[1], timeout=5)
    try:
        payload = body
        if isinstance(body, dict):
            payload = json.dumps(body).encode("utf-8")
        connection.request(method, path, body=payload, headers=headers or {})
        response = connection.getresponse()
        content = response.read().decode("utf-8")
        return response.status, response.getheader("Content-Type"), content
    finally:
        connection.close()


@contextmanager
def running_server_with_deliveries(deliveries):
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        data_file = root / "deliveries.json"
        data_file.write_text(json.dumps({"deliveries": deliveries}, ensure_ascii=False), encoding="utf-8")
        app = DeliveryServer(
            {
                "storage_backend": "json",
                "excel_path": None,
                "data_file": str(data_file),
                "photo_root": str(root / "photos"),
                "archive_root": str(root / "archives"),
                "upload_dir": str(root / "uploads"),
                "users": [],
            }
        )
        app.sessions["admin-token"] = {
            "username": "admin",
            "role": "admin",
            "vehicle_no": None,
        }
        server = ThreadingHTTPServer(("127.0.0.1", 0), app.handler_class())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address, data_file
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


class WebErrorHandlingTest(unittest.TestCase):
    def test_load_config_accepts_utf8_bom(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text('\ufeff{"port": 8000}', encoding="utf-8")

            self.assertEqual(load_config(config_path)["port"], 8000)

    def test_invalid_json_returns_json_error(self):
        with running_server() as address:
            status, content_type, content = request_json(
                address,
                "POST",
                "/api/admin/import",
                body="{",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 400)
        self.assertIn("application/json", content_type)
        self.assertIn("請求內容不是有效 JSON", content)

    def test_empty_import_filename_returns_json_error(self):
        with running_server() as address:
            status, content_type, content = request_json(
                address,
                "POST",
                "/api/admin/import",
                body={"token": "admin-token", "filename": "", "file_data": ""},
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 400)
        self.assertIn("application/json", content_type)
        self.assertIn("Excel 檔名不可空白", content)

    def test_oversized_import_returns_json_error_and_server_survives(self):
        with running_server() as address:
            connection = http.client.HTTPConnection(address[0], address[1], timeout=5)
            try:
                connection.putrequest("POST", "/api/admin/import")
                connection.putheader("Content-Type", "application/json")
                connection.putheader("Content-Length", str((32 * 1024 * 1024) + 1))
                connection.endheaders()
                response = connection.getresponse()
                content = response.read().decode("utf-8")
            finally:
                connection.close()

            status, content_type, _ = request_json(address, "GET", "/api/vehicles")

        self.assertEqual(response.status, 413)
        self.assertIn("application/json", response.getheader("Content-Type"))
        self.assertIn("Excel 檔案太大", content)
        self.assertEqual(status, 200)
        self.assertIn("application/json", content_type)

    def test_admin_photo_save_replaces_photo_and_returns_delivery(self):
        delivery = {
            "id": "delivery-1",
            "sheet": "S",
            "row": 1,
            "seq": "1",
            "vehicle_no": "CAR-1",
            "vehicle_no_normalized": "CAR-1",
            "driver": "Driver",
            "delivery_date": "2026-06-18",
            "date_folder": "20260618",
            "customer": "Customer",
            "address": "Address",
            "company": "Company",
            "invoice_no": "INV-1",
            "status": "normal",
            "photo_path": None,
            "photo_updated_at": None,
            "updated_at": None,
            "deleted_at": None,
            "deleted_by": None,
        }
        with running_server_with_deliveries([delivery]) as (address, data_file):
            status, content_type, content = request_json(
                address,
                "POST",
                "/api/admin/deliveries/delivery-1/photo",
                body={
                    "token": "admin-token",
                    "status": "normal",
                    "photo_data": "data:image/jpeg;base64,dGVzdA==",
                },
                headers={"Content-Type": "application/json"},
            )

            saved = json.loads(data_file.read_text(encoding="utf-8"))["deliveries"][0]
            photo_bytes = Path(saved["photo_path"]).read_bytes()

        payload = json.loads(content)
        self.assertEqual(status, 200)
        self.assertIn("application/json", content_type)
        self.assertTrue(payload["delivery"]["has_photo"])
        self.assertEqual(photo_bytes, b"test")

    def test_admin_restore_delivery_clears_deleted_fields(self):
        delivery = {
            "id": "delivery-1",
            "sheet": "S",
            "row": 1,
            "seq": "1",
            "vehicle_no": "CAR-1",
            "vehicle_no_normalized": "CAR-1",
            "driver": "Driver",
            "delivery_date": "2026-06-18",
            "date_folder": "20260618",
            "customer": "Customer",
            "address": "Address",
            "company": "Company",
            "invoice_no": "INV-1",
            "status": "normal",
            "photo_path": None,
            "photo_updated_at": None,
            "updated_at": "2026-06-18T10:00:00",
            "deleted_at": "2026-06-18T11:00:00",
            "deleted_by": "admin",
        }
        with running_server_with_deliveries([delivery]) as (address, data_file):
            status, content_type, content = request_json(
                address,
                "POST",
                "/api/admin/deliveries/delivery-1/restore",
                body={"token": "admin-token"},
                headers={"Content-Type": "application/json"},
            )

            saved = json.loads(data_file.read_text(encoding="utf-8"))["deliveries"][0]

        payload = json.loads(content)
        self.assertEqual(status, 200)
        self.assertIn("application/json", content_type)
        self.assertIsNone(saved["deleted_at"])
        self.assertIsNone(saved["deleted_by"])
        self.assertIsNone(payload["delivery"]["deleted_at"])
        self.assertIsNone(payload["delivery"]["deleted_by"])


if __name__ == "__main__":
    unittest.main()
