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
                "delivery_actions": True,
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
                "delivery_actions": False,
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
                    "delivery_actions": False,
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
                "delivery_actions": False,
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

    def test_legacy_delivery_permission_defaults_to_full_actions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = UserStore(str(Path(temp_dir) / "users.json"), [])
            user = store.upsert_user(
                "legacy",
                "admin",
                "pass123",
                True,
                {"deliveries": True},
            )

        self.assertTrue(user["permissions"]["deliveries"])
        self.assertTrue(user["permissions"]["delivery_actions"])

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

    def test_admin_account_api_updates_own_display_name_and_password(self):
        with running_permission_server(
            [
                {
                    "username": "limited",
                    "password": "oldpass1",
                    "role": "admin",
                    "display_name": "舊名稱",
                    "permissions": {"deliveries": True, "users": False},
                }
            ]
        ) as address:
            status, login_content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "limited", "password": "oldpass1", "login_context": "admin"},
            )
            token = json.loads(login_content)["token"]

            profile_status, profile_content = request_json(
                address,
                "GET",
                f"/api/admin/account?token={token}",
            )
            save_status, save_content = request_json(
                address,
                "POST",
                "/api/admin/account",
                {
                    "token": token,
                    "display_name": "新名稱",
                    "old_password": "oldpass1",
                    "new_password": "newpass1",
                    "confirm_password": "newpass1",
                },
            )
            old_login_status, _ = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "limited", "password": "oldpass1", "login_context": "admin"},
            )
            new_login_status, new_login_content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "limited", "password": "newpass1", "login_context": "admin"},
            )

        profile = json.loads(profile_content)["user"]
        saved = json.loads(save_content)["user"]
        new_login = json.loads(new_login_content)
        self.assertEqual(status, 200)
        self.assertEqual(profile_status, 200)
        self.assertEqual(profile["username"], "limited")
        self.assertEqual(profile["display_name"], "舊名稱")
        self.assertFalse(profile["permissions"]["users"])
        self.assertEqual(save_status, 200)
        self.assertEqual(saved["display_name"], "新名稱")
        self.assertEqual(old_login_status, 401)
        self.assertEqual(new_login_status, 200)
        self.assertEqual(new_login["user"]["display_name"], "新名稱")

    def test_admin_account_api_rejects_weak_or_mismatched_password(self):
        with running_permission_server(
            [
                {
                    "username": "admin-a",
                    "password": "oldpass1",
                    "role": "admin",
                    "permissions": {"deliveries": True},
                }
            ]
        ) as address:
            _, login_content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "admin-a", "password": "oldpass1", "login_context": "admin"},
            )
            token = json.loads(login_content)["token"]

            weak_status, weak_content = request_json(
                address,
                "POST",
                "/api/admin/account",
                {
                    "token": token,
                    "display_name": "名稱",
                    "old_password": "oldpass1",
                    "new_password": "password",
                    "confirm_password": "password",
                },
            )
            mismatch_status, mismatch_content = request_json(
                address,
                "POST",
                "/api/admin/account",
                {
                    "token": token,
                    "display_name": "名稱",
                    "old_password": "oldpass1",
                    "new_password": "newpass1",
                    "confirm_password": "newpass2",
                },
            )

        self.assertEqual(weak_status, 400)
        self.assertIn("設定密碼必須有英文、數字組合，至少8碼", weak_content)
        self.assertEqual(mismatch_status, 400)
        self.assertIn("新密碼與確認密碼不一致", mismatch_content)

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

    def test_delivery_readonly_permission_can_view_but_cannot_mutate_records(self):
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
                "status": "normal",
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
                    "username": "readonly",
                    "password": "pass123",
                    "role": "admin",
                    "permissions": {
                        "deliveries": True,
                        "delivery_actions": False,
                        "deleted": False,
                        "upload": False,
                        "archive": False,
                        "users": False,
                        "driver": False,
                    },
                }
            ],
            deliveries,
        ) as address:
            _, login_content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "readonly", "password": "pass123", "login_context": "admin"},
            )
            token = json.loads(login_content)["token"]

            list_status, list_content = request_json(
                address,
                "GET",
                f"/api/admin/deliveries?token={token}&deleted=0",
            )
            delete_status, delete_content = request_json(
                address,
                "POST",
                "/api/admin/deliveries/delivery-1/delete",
                {"token": token},
            )
            bulk_delete_status, bulk_delete_content = request_json(
                address,
                "POST",
                "/api/admin/deliveries/bulk-delete",
                {"token": token, "delivery_ids": ["delivery-1"]},
            )
            rotate_status, rotate_content = request_json(
                address,
                "POST",
                "/api/admin/deliveries/delivery-1/photo",
                {"token": token, "status": "normal", "photo_data": "not-an-image"},
            )

        self.assertEqual(list_status, 200)
        self.assertEqual(len(json.loads(list_content)["deliveries"]), 1)
        self.assertEqual(delete_status, 403)
        self.assertEqual(bulk_delete_status, 403)
        self.assertEqual(rotate_status, 403)
        self.assertIn("此帳號未啟用配送狀態完整功能", delete_content)
        self.assertIn("此帳號未啟用配送狀態完整功能", bulk_delete_content)
        self.assertIn("此帳號未啟用配送狀態完整功能", rotate_content)

    def test_admin_login_context_rejects_driver_without_vehicle_prompt(self):
        with running_permission_server(
            [
                {
                    "username": "driver",
                    "password": "pass123",
                    "role": "driver",
                    "permissions": {"driver": True},
                }
            ]
        ) as address:
            status, content = request_json(
                address,
                "POST",
                "/api/login",
                {
                    "username": "driver",
                    "password": "pass123",
                    "login_context": "admin",
                },
            )

        self.assertEqual(status, 403)
        self.assertIn("使用帳號非管理員，無法登入", content)
        self.assertNotIn("請輸入車號", content)

    def test_driver_login_without_vehicle_still_requires_vehicle(self):
        with running_permission_server(
            [
                {
                    "username": "driver",
                    "password": "pass123",
                    "role": "driver",
                    "permissions": {"driver": True},
                }
            ]
        ) as address:
            status, content = request_json(
                address,
                "POST",
                "/api/login",
                {"username": "driver", "password": "pass123"},
            )

        self.assertEqual(status, 400)
        self.assertIn("請輸入車號", content)

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
