import http.client
import json
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path

from delivery_app.auth import UserStore
from delivery_app.web import DeliveryServer


@contextmanager
def running_permission_server(users, deliveries=None):
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        data_file = root / "deliveries.json"
        data_file.write_text(
            json.dumps({"deliveries": deliveries or []}, ensure_ascii=False),
            encoding="utf-8",
        )
        app = DeliveryServer(
            {
                "storage_backend": "json",
                "excel_path": None,
                "data_file": str(data_file),
                "photo_root": str(root / "photos"),
                "archive_root": str(root / "archives"),
                "upload_dir": str(root / "uploads"),
                "user_file": str(root / "users.json"),
                "users": users,
            }
        )
        server = ThreadingHTTPServer(("127.0.0.1", 0), app.handler_class())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def request_json(address, method, path, body=None):
    connection = http.client.HTTPConnection(address[0], address[1], timeout=5)
    try:
        payload = body
        headers = {}
        if isinstance(body, dict):
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        content = response.read().decode("utf-8")
        return response.status, content
    finally:
        connection.close()


class UserPermissionTest(unittest.TestCase):
    def test_default_permissions_keep_admin_full_access_and_driver_delivery_access(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = UserStore(str(Path(temp_dir) / "users.json"), [])

            users = {user["username"]: user for user in store.list_users()}

        self.assertEqual(
            users["admin"]["permissions"],
            {
                "deliveries": True,
                "deleted": True,
                "upload": True,
                "archive": True,
                "users": True,
                "driver": True,
            },
        )
        self.assertEqual(
            users["driver"]["permissions"],
            {
                "deliveries": False,
                "deleted": False,
                "upload": False,
                "archive": False,
                "users": False,
                "driver": True,
            },
        )

    def test_user_permissions_are_saved_and_returned_after_login(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = UserStore(str(Path(temp_dir) / "users.json"), [])
            store.upsert_user(
                "limited",
                "admin",
                "pass123",
                True,
                {
                    "deliveries": True,
                    "deleted": False,
                    "upload": False,
                    "archive": False,
                    "users": True,
                    "driver": False,
                },
            )

            ok, user, message = store.authenticate("limited", "pass123")

        self.assertTrue(ok, message)
        self.assertEqual(
            user["permissions"],
            {
                "deliveries": True,
                "deleted": False,
                "upload": False,
                "archive": False,
                "users": True,
                "driver": False,
            },
        )

    def test_user_display_name_is_saved_and_returned(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = UserStore(str(Path(temp_dir) / "users.json"), [])
            saved = store.upsert_user(
                "driver-a",
                "driver",
                "pass123",
                True,
                {"driver": True},
                "王小明",
            )

            listed = {user["username"]: user for user in store.list_users()}
            ok, user, message = store.authenticate("driver-a", "pass123")

        self.assertEqual(saved["display_name"], "王小明")
        self.assertEqual(listed["driver-a"]["display_name"], "王小明")
        self.assertTrue(ok, message)
        self.assertEqual(user["display_name"], "王小明")

    def test_admin_user_api_saves_display_name(self):
        with running_permission_server([]) as address:
            status, login_content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "admin", "password": "admin123"},
            )
            token = json.loads(login_content)["token"]

            save_status, _ = request_json(
                address,
                "POST",
                "/api/admin/users",
                {
                    "token": token,
                    "username": "driver-a",
                    "display_name": "王小明",
                    "role": "driver",
                    "password": "pass123",
                    "active": True,
                    "permissions": {"driver": True},
                },
            )
            list_status, list_content = request_json(
                address,
                "GET",
                f"/api/admin/users?token={token}",
            )

        users = {user["username"]: user for user in json.loads(list_content)["users"]}
        self.assertEqual(status, 200)
        self.assertEqual(save_status, 200)
        self.assertEqual(list_status, 200)
        self.assertEqual(users["driver-a"]["display_name"], "王小明")

    def test_login_response_includes_permissions(self):
        with running_permission_server(
            [
                {
                    "username": "limited",
                    "password": "pass123",
                    "role": "admin",
                    "permissions": {"deliveries": True, "users": False},
                }
            ]
        ) as address:
            status, content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "limited", "password": "pass123"},
            )

        payload = json.loads(content)
        self.assertEqual(status, 200)
        self.assertEqual(payload["role"], "admin")
        self.assertTrue(payload["permissions"]["deliveries"])
        self.assertFalse(payload["permissions"]["users"])

    def test_driver_login_is_blocked_when_driver_permission_is_disabled(self):
        deliveries = [
            {
                "id": "delivery-1",
                "sheet": "S",
                "row": 1,
                "seq": 1,
                "vehicle_no": "RFW-3960",
                "vehicle_no_normalized": "RFW-3960",
                "driver": "Driver",
                "delivery_date": "2026-06-30",
                "date_folder": "20260630",
                "customer": "Customer",
                "address": "Address",
                "company": "Company",
                "invoice_no": "INV-1",
                "status": None,
                "photo_path": None,
                "photo_updated_at": None,
                "updated_at": None,
                "deleted_at": None,
                "deleted_by": None,
            }
        ]
        with running_permission_server(
            [
                {
                    "username": "driver",
                    "password": "pass123",
                    "role": "driver",
                    "permissions": {"driver": False},
                }
            ],
            deliveries,
        ) as address:
            status, content = request_json(
                address,
                "POST",
                "/api/login",
                {
                    "username": "driver",
                    "password": "pass123",
                    "vehicle_no": "RFW-3960",
                },
            )

        self.assertEqual(status, 403)
        self.assertIn("此帳號未啟用物流士配送作業", content)


if __name__ == "__main__":
    unittest.main()
