from __future__ import annotations

import json
import mimetypes
import re
import secrets
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .auth import UserStore
from .geocoding import make_geocoder
from .import_diagnostics import write_import_log
from .repository import DeliveryRepository, HistoryCleanupError
from .scan_ocr import ScanOcrError, decode_scan_image_data_url, make_scan_ocr


ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"


class RequestError(Exception):
    def __init__(self, status: HTTPStatus, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def create_repository(config: dict):
    geocoder = make_geocoder(config.get("geocoding", {}))
    if is_sqlserver_backend(config):
        from .sqlserver_store import SqlServerRepository

        return SqlServerRepository(
            config.get("database", {}),
            config.get("excel_path"),
            config.get("photo_root", "storage/photos"),
            config.get("archive_root", "data/archives"),
            geocoder=geocoder,
        )

    return DeliveryRepository(
        config.get("excel_path"),
        config.get("data_file", "data/deliveries.json"),
        config.get("photo_root", "storage/photos"),
        config.get("archive_root", "data/archives"),
        geocoder=geocoder,
    )


def create_user_store(config: dict):
    if is_sqlserver_backend(config):
        from .sqlserver_store import SqlServerUserStore

        return SqlServerUserStore(config.get("database", {}), config.get("users", []))

    return UserStore(config.get("user_file", "data/users.json"), config.get("users", []))


def is_sqlserver_backend(config: dict) -> bool:
    backend = str(config.get("storage_backend") or config.get("database", {}).get("type") or "json").lower()
    return backend in {"sqlserver", "mssql"}


class DeliveryServer:
    def __init__(self, config: dict) -> None:
        self.config = config
        self.repo = create_repository(config)
        self.users = create_user_store(config)
        self.scan_ocr = make_scan_ocr(config.get("scan_ocr", {}))
        self.upload_dir = Path(config.get("upload_dir", "data/uploads"))
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.sessions: dict[str, dict] = {}
        self._geocode_thread: threading.Thread | None = None
        self._start_geocoding_job()

    def _start_geocoding_job(self) -> None:
        if not hasattr(self.repo, "geocode_pending"):
            return
        if not getattr(getattr(self.repo, "geocoder", None), "enabled", False):
            return
        if self._geocode_thread and self._geocode_thread.is_alive():
            return

        def run() -> None:
            try:
                self.repo.geocode_pending()
            except Exception as exc:
                print(f"Geocoding job failed: {exc}")

        self._geocode_thread = threading.Thread(target=run, daemon=True)
        self._geocode_thread.start()

    def handler_class(self):
        app = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "DeliveryPhotoServer/0.1"

            def do_GET(self) -> None:
                parsed = urlparse(self.path)
                if parsed.path in {"/", "/driver"}:
                    self._serve_file(STATIC_DIR / "index.html")
                elif parsed.path == "/admin":
                    self._serve_file(STATIC_DIR / "admin.html")
                elif parsed.path == "/manifest.webmanifest":
                    self._serve_static_file(STATIC_DIR / "manifest.json", "application/manifest+json; charset=utf-8")
                elif parsed.path == "/service-worker.js":
                    self._serve_static_file(STATIC_DIR / "service-worker.js", "application/javascript; charset=utf-8")
                elif parsed.path.startswith("/static/"):
                    relative = unquote(parsed.path.removeprefix("/static/"))
                    self._serve_file(STATIC_DIR / relative)
                elif parsed.path == "/api/vehicles":
                    self._handle_vehicles()
                elif parsed.path == "/api/deliveries":
                    self._handle_deliveries(parsed)
                elif parsed.path.startswith("/api/deliveries/") and parsed.path.endswith("/photo"):
                    delivery_id = parsed.path.split("/")[3]
                    self._handle_photo(parsed, delivery_id)
                elif parsed.path == "/api/admin/deliveries":
                    self._handle_admin_deliveries(parsed)
                elif parsed.path == "/api/admin/options":
                    self._handle_admin_options(parsed)
                elif parsed.path == "/api/admin/account":
                    self._handle_admin_account(parsed)
                elif parsed.path == "/api/admin/users":
                    self._handle_admin_users(parsed)
                elif parsed.path == "/api/admin/archives":
                    self._handle_admin_archives(parsed)
                elif parsed.path.startswith("/api/admin/archives/"):
                    filename = unquote(parsed.path.removeprefix("/api/admin/archives/"))
                    self._handle_admin_archive_download(parsed, filename)
                else:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到頁面")

            def do_POST(self) -> None:
                try:
                    self._route_post()
                except RequestError as exc:
                    self._safe_json_error(exc.status, exc.message)
                except ValueError as exc:
                    self._safe_json_error(HTTPStatus.BAD_REQUEST, str(exc))
                except (BrokenPipeError, ConnectionResetError):
                    return
                except Exception:
                    self._safe_json_error(HTTPStatus.INTERNAL_SERVER_ERROR, "伺服器處理失敗，請稍後再試")

            def _route_post(self) -> None:
                parsed = urlparse(self.path)
                if parsed.path == "/api/login":
                    self._handle_login()
                elif parsed.path == "/api/driver/scan-invoice-ocr":
                    self._handle_driver_scan_invoice_ocr()
                elif parsed.path.startswith("/api/deliveries/") and parsed.path.endswith("/photo"):
                    delivery_id = parsed.path.split("/")[3]
                    self._handle_photo_upload(delivery_id)
                elif parsed.path == "/api/reload":
                    self._handle_reload()
                elif parsed.path == "/api/admin/import":
                    self._handle_admin_import()
                elif parsed.path == "/api/admin/account":
                    self._handle_admin_account_save()
                elif parsed.path == "/api/admin/users":
                    self._handle_admin_user_save()
                elif parsed.path == "/api/admin/users/delete":
                    self._handle_admin_user_delete()
                elif parsed.path == "/api/admin/archive":
                    self._handle_admin_archive()
                elif parsed.path == "/api/admin/maintenance/cleanup":
                    self._handle_admin_maintenance_cleanup()
                elif parsed.path == "/api/admin/deliveries/bulk-delete":
                    self._handle_admin_bulk_delete()
                elif parsed.path == "/api/admin/deliveries/bulk-permanent-delete":
                    self._handle_admin_bulk_permanent_delete()
                elif parsed.path.startswith("/api/admin/deliveries/") and parsed.path.endswith("/photo"):
                    delivery_id = parsed.path.split("/")[4]
                    self._handle_admin_photo_save(delivery_id)
                elif parsed.path.startswith("/api/admin/deliveries/") and parsed.path.endswith("/permanent-delete"):
                    delivery_id = parsed.path.split("/")[4]
                    self._handle_admin_permanent_delete(delivery_id)
                elif parsed.path.startswith("/api/admin/deliveries/") and parsed.path.endswith("/restore"):
                    delivery_id = parsed.path.split("/")[4]
                    self._handle_admin_restore(delivery_id)
                elif parsed.path.startswith("/api/admin/deliveries/") and parsed.path.endswith("/delete"):
                    delivery_id = parsed.path.split("/")[4]
                    self._handle_admin_delete(delivery_id)
                else:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到 API")

            def log_message(self, format: str, *args) -> None:
                return

            def _handle_login(self) -> None:
                body = self._read_json()
                username = str(body.get("username", "")).strip()
                password = str(body.get("password", ""))
                vehicle_no = str(body.get("vehicle_no", "")).strip()
                login_context = str(body.get("login_context", "")).strip()
                requested_date = str(body.get("delivery_date", "")).strip() or None

                ok, user, message = app.users.authenticate(username, password)
                if not ok or not user:
                    self._json_error(HTTPStatus.UNAUTHORIZED, message)
                    return
                permissions = user.get("permissions", {})
                if user["role"] == "admin":
                    token = secrets.token_urlsafe(32)
                    app.sessions[token] = {
                        "username": username,
                        "role": "admin",
                        "vehicle_no": None,
                        "permissions": permissions,
                    }
                    self._send_json({"token": token, "role": "admin", "user": user, "permissions": permissions})
                    return

                if login_context == "admin":
                    self._json_error(HTTPStatus.FORBIDDEN, "使用帳號非管理員，無法登入")
                    return

                if not permissions.get("driver", False):
                    self._json_error(HTTPStatus.FORBIDDEN, "此帳號未啟用物流士配送作業")
                    return

                if not vehicle_no:
                    self._json_error(HTTPStatus.BAD_REQUEST, "請輸入車號")
                    return

                dates = app.repo.dates_for_vehicle(vehicle_no)
                selected_date = requested_date or (dates[0]["delivery_date"] if dates else None)
                meta = app.repo.vehicle_meta(vehicle_no, selected_date)
                if not meta:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到此車號的配送資料")
                    return

                token = secrets.token_urlsafe(32)
                app.sessions[token] = {
                    "username": username,
                    "role": "driver",
                    "vehicle_no": vehicle_no,
                    "permissions": permissions,
                }
                deliveries = app.repo.list_for_vehicle(vehicle_no, include_delivered=False, delivery_date=selected_date)
                counts = app.repo.counts_for_vehicle(vehicle_no, selected_date)
                self._send_json({
                    "token": token,
                    "role": "driver",
                    "user": user,
                    "permissions": permissions,
                    "profile": meta,
                    "dates": dates,
                    "selected_date": selected_date,
                    "deliveries": deliveries,
                    "counts": counts,
                })

            def _handle_vehicles(self) -> None:
                self._send_json(app.repo.vehicles_for_latest_date())

            def _handle_deliveries(self, parsed) -> None:
                session = self._session_from_request(parsed)
                if not session:
                    return

                query = parse_qs(parsed.query)
                include_delivered = query.get("include", ["active"])[0] == "all"
                requested_date = query.get("date", [""])[0] or app.repo.latest_date_for_vehicle(session["vehicle_no"])
                deliveries = app.repo.list_for_vehicle(session["vehicle_no"], include_delivered, requested_date)
                counts = app.repo.counts_for_vehicle(session["vehicle_no"], requested_date)
                profile = app.repo.vehicle_meta(session["vehicle_no"], requested_date)
                dates = app.repo.dates_for_vehicle(session["vehicle_no"])
                self._send_json({
                    "profile": profile,
                    "dates": dates,
                    "selected_date": requested_date,
                    "deliveries": deliveries,
                    "counts": counts,
                })

            def _handle_photo_upload(self, delivery_id: str) -> None:
                body = self._read_json(max_bytes=16 * 1024 * 1024)
                session = self._session_from_body(body)
                if not session:
                    return

                try:
                    record = app.repo.update_photo(
                        delivery_id,
                        str(body.get("status", "")),
                        str(body.get("photo_data", "")),
                        captured_at=str(body.get("captured_at", "")).strip() or None,
                    )
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return

                requested_date = str(body.get("delivery_date", "")).strip() or record.get("delivery_date")
                counts = app.repo.counts_for_vehicle(session["vehicle_no"], requested_date)
                self._send_json({"delivery": record, "counts": counts})

            def _handle_admin_photo_save(self, delivery_id: str) -> None:
                body = self._read_json(max_bytes=16 * 1024 * 1024)
                if not self._admin_with_permission_from_body(body, "delivery_actions"):
                    return

                try:
                    record = app.repo.update_photo(
                        delivery_id,
                        str(body.get("status", "")),
                        str(body.get("photo_data", "")),
                        captured_at=str(body.get("captured_at", "")).strip() or None,
                    )
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return

                self._send_json({"delivery": record})

            def _handle_photo(self, parsed, delivery_id: str) -> None:
                if not self._session_from_request(parsed):
                    return

                path = app.repo.photo_path_for(delivery_id)
                if not path:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到照片")
                    return

                content = path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def _handle_reload(self) -> None:
                body = self._read_json()
                if not self._admin_from_body(body):
                    return
                app.config = load_config(ROOT_DIR / "config.json")
                app.repo = create_repository(app.config)
                app.users = create_user_store(app.config)
                app.upload_dir = Path(app.config.get("upload_dir", "data/uploads"))
                app.upload_dir.mkdir(parents=True, exist_ok=True)
                try:
                    app.repo.reload_from_excel()
                except (OSError, ValueError) as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                app._start_geocoding_job()
                self._send_json({"ok": True})

            def _handle_admin_import(self) -> None:
                write_import_log(
                    "request_start",
                    content_length=self.headers.get("Content-Length", ""),
                    client=self.client_address[0] if self.client_address else "",
                )
                try:
                    body = self._read_json(
                        max_bytes=32 * 1024 * 1024,
                        too_large_message="Excel 檔案太大，上傳失敗，請縮小檔案後再試",
                    )
                except RequestError as exc:
                    write_import_log("read_json_error", status=exc.status.value, message=exc.message)
                    raise
                write_import_log("json_loaded", keys=",".join(sorted(body.keys())))
                if not self._admin_with_permission_from_body(body, "upload"):
                    write_import_log("auth_failed")
                    return

                filename = safe_upload_name(str(body.get("filename", "")))
                file_data = str(body.get("file_data", ""))
                write_import_log("payload_ready", filename=filename, file_data_chars=len(file_data))
                if not filename.lower().endswith((".xlsm", ".xlsx")):
                    write_import_log("invalid_extension", filename=filename)
                    self._json_error(HTTPStatus.BAD_REQUEST, "只能上傳 Excel 檔案")
                    return

                upload_path = app.upload_dir / filename
                try:
                    write_import_log("decode_start", filename=filename)
                    decoded = decode_file_data(file_data)
                    write_import_log("decode_done", filename=filename, bytes=len(decoded))
                    upload_path.write_bytes(decoded)
                    write_import_log("temp_written", filename=filename, path=upload_path)
                    write_import_log("import_excel_start", filename=filename)
                    summary = app.repo.import_excel_file(upload_path)
                    write_import_log("import_excel_done", filename=filename, summary=json.dumps(summary, ensure_ascii=False))
                except ValueError as exc:
                    write_import_log("value_error", filename=filename, message=str(exc))
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                except Exception as exc:
                    write_import_log("exception", filename=filename, error_type=type(exc).__name__, message=str(exc))
                    self._json_error(HTTPStatus.BAD_REQUEST, f"Excel 匯入失敗: {exc}")
                    return
                finally:
                    upload_path.unlink(missing_ok=True)
                    write_import_log("temp_cleanup", filename=filename)

                write_import_log("geocode_job_start", filename=filename)
                app._start_geocoding_job()
                write_import_log("response_success", filename=filename)
                self._send_json({"ok": True, "summary": summary})

            def _handle_driver_scan_invoice_ocr(self) -> None:
                body = self._read_json(
                    max_bytes=6 * 1024 * 1024,
                    too_large_message="掃號圖片太大",
                )
                session = self._session_from_body(body)
                if not session:
                    return
                if session.get("role") != "driver":
                    self._json_error(HTTPStatus.FORBIDDEN, "只有物流士可以使用掃號達交")
                    return

                try:
                    image_bytes = decode_scan_image_data_url(str(body.get("image_data", "")))
                    text = app.scan_ocr.recognize_text(image_bytes)
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                except ScanOcrError as exc:
                    self._json_error(HTTPStatus.SERVICE_UNAVAILABLE, str(exc))
                    return

                self._send_json({
                    "provider": getattr(app.scan_ocr, "provider", ""),
                    "text": text,
                })

            def _handle_admin_deliveries(self, parsed) -> None:
                query = parse_qs(parsed.query)
                permission = "deleted" if query.get("deleted", ["0"])[0] == "1" else "deliveries"
                if not self._admin_with_permission_from_request(parsed, permission):
                    return
                deliveries = app.repo.list_admin_deliveries(
                    delivery_date=query.get("date", [""])[0] or None,
                    start_date=query.get("start_date", [""])[0] or None,
                    end_date=query.get("end_date", [""])[0] or None,
                    company=query.get("company", [""])[0] or None,
                    driver=query.get("driver", [""])[0] or None,
                    deleted=query.get("deleted", ["0"])[0] == "1",
                )
                self._send_json({"deliveries": deliveries})

            def _handle_admin_options(self, parsed) -> None:
                query = parse_qs(parsed.query)
                permission = "deleted" if query.get("deleted", ["0"])[0] == "1" else "deliveries"
                if not self._admin_with_permission_from_request(parsed, permission):
                    return
                self._send_json(app.repo.filter_options(
                    start_date=query.get("start_date", [""])[0] or None,
                    end_date=query.get("end_date", [""])[0] or None,
                    deleted=query.get("deleted", ["0"])[0] == "1",
                ))

            def _handle_admin_delete(self, delivery_id: str) -> None:
                body = self._read_json()
                session = self._admin_with_permission_from_body(body, "delivery_actions")
                if not session:
                    return
                try:
                    result = app.repo.delete_delivery(delivery_id, session["username"])
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                self._send_json(result)

            def _handle_admin_bulk_delete(self) -> None:
                body = self._read_json()
                session = self._admin_with_permission_from_body(body, "delivery_actions")
                if not session:
                    return
                delivery_ids = body.get("delivery_ids", [])
                if not isinstance(delivery_ids, list):
                    self._json_error(HTTPStatus.BAD_REQUEST, "刪除清單格式不正確")
                    return
                summary = app.repo.delete_deliveries(delivery_ids, session["username"])
                self._send_json({"summary": summary})

            def _handle_admin_restore(self, delivery_id: str) -> None:
                body = self._read_json()
                if not self._admin_with_permission_from_body(body, "deleted"):
                    return
                try:
                    delivery = app.repo.restore_delivery(delivery_id)
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"delivery": delivery})

            def _handle_admin_permanent_delete(self, delivery_id: str) -> None:
                body = self._read_json()
                if not self._admin_with_permission_from_body(body, "deleted"):
                    return
                try:
                    app.repo.permanently_delete_delivery(delivery_id)
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"ok": True})

            def _handle_admin_bulk_permanent_delete(self) -> None:
                body = self._read_json()
                if not self._admin_with_permission_from_body(body, "deleted"):
                    return
                delivery_ids = body.get("delivery_ids", [])
                if not isinstance(delivery_ids, list):
                    self._json_error(HTTPStatus.BAD_REQUEST, "刪除清單格式不正確")
                    return
                try:
                    summary = app.repo.permanently_delete_deliveries(delivery_ids)
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"summary": summary})

            def _handle_admin_archive(self) -> None:
                body = self._read_json()
                if not self._admin_with_permission_from_body(body, "archive"):
                    return
                try:
                    archives = app.repo.archive_photos(str(body.get("delivery_date", "")))
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"archives": archives})

            def _handle_admin_archives(self, parsed) -> None:
                if not self._admin_with_permission_from_request(parsed, "archive"):
                    return
                query = parse_qs(parsed.query)
                try:
                    archives = app.repo.list_archives(query.get("delivery_date", [""])[0])
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"archives": archives})

            def _handle_admin_maintenance_cleanup(self) -> None:
                body = self._read_json()
                if not self._admin_from_body(body):
                    return
                try:
                    summary = app.repo.cleanup_delivery_history(
                        str(body.get("start_date", "")),
                        str(body.get("end_date", "")),
                    )
                except HistoryCleanupError as exc:
                    self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                    return
                self._send_json({"ok": True, "summary": summary})

            def _handle_admin_archive_download(self, parsed, filename: str) -> None:
                if not self._admin_with_permission_from_request(parsed, "archive"):
                    return
                path = app.repo.archive_path_for(filename)
                if not path:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到封存檔")
                    return

                content = path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote_filename(path.name)}")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def _handle_admin_users(self, parsed) -> None:
                if not self._admin_with_permission_from_request(parsed, "users"):
                    return
                self._send_json({"users": app.users.list_users()})

            def _handle_admin_account(self, parsed) -> None:
                session = self._admin_from_request(parsed)
                if not session:
                    return
                try:
                    user = app.users.get_user(session["username"])
                except KeyError:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到使用者")
                    return
                self._send_json({"user": user})

            def _handle_admin_account_save(self) -> None:
                body = self._read_json()
                session = self._admin_from_body(body)
                if not session:
                    return
                try:
                    user = app.users.update_own_account(
                        session["username"],
                        str(body.get("display_name", "")).strip(),
                        str(body.get("old_password", "")),
                        str(body.get("new_password", "")),
                        str(body.get("confirm_password", "")),
                    )
                except KeyError:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到使用者")
                    return
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"user": user})

            def _handle_admin_user_save(self) -> None:
                body = self._read_json()
                if not self._admin_with_permission_from_body(body, "users"):
                    return
                try:
                    user = app.users.upsert_user(
                        username=str(body.get("username", "")),
                        role=str(body.get("role", "")),
                        password=str(body.get("password", "")) or None,
                        active=bool(body.get("active", True)),
                        permissions=body.get("permissions"),
                        display_name=str(body.get("display_name", "")).strip(),
                    )
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"user": user})

            def _handle_admin_user_delete(self) -> None:
                body = self._read_json()
                session = self._admin_with_permission_from_body(body, "users")
                if not session:
                    return
                username = str(body.get("username", "")).strip()
                if username == session["username"]:
                    self._json_error(HTTPStatus.BAD_REQUEST, "不可刪除目前登入的帳號")
                    return
                app.users.delete_user(username)
                self._send_json({"ok": True})

            def _session_from_request(self, parsed) -> dict | None:
                query = parse_qs(parsed.query)
                token = query.get("token", [""])[0]
                if not token:
                    auth = self.headers.get("Authorization", "")
                    if auth.startswith("Bearer "):
                        token = auth.removeprefix("Bearer ").strip()
                return self._session_for_token(token)

            def _session_from_body(self, body: dict) -> dict | None:
                return self._session_for_token(str(body.get("token", "")))

            def _admin_from_request(self, parsed) -> dict | None:
                session = self._session_from_request(parsed)
                return self._require_admin(session)

            def _admin_from_body(self, body: dict) -> dict | None:
                session = self._session_from_body(body)
                return self._require_admin(session)

            def _admin_with_permission_from_request(self, parsed, permission: str) -> dict | None:
                session = self._session_from_request(parsed)
                return self._require_admin_permission(session, permission)

            def _admin_with_permission_from_body(self, body: dict, permission: str) -> dict | None:
                session = self._session_from_body(body)
                return self._require_admin_permission(session, permission)

            def _require_admin(self, session: dict | None) -> dict | None:
                if not session:
                    return None
                if session.get("role") != "admin":
                    self._json_error(HTTPStatus.FORBIDDEN, "需要管理人員權限")
                    return None
                return session

            def _require_admin_permission(self, session: dict | None, permission: str) -> dict | None:
                session = self._require_admin(session)
                if not session:
                    return None
                permissions = session.get("permissions")
                if permissions is None:
                    return session
                if not permissions.get(permission, False):
                    if permission == "delivery_actions":
                        self._json_error(HTTPStatus.FORBIDDEN, "此帳號未啟用配送狀態完整功能")
                        return None
                    self._json_error(HTTPStatus.FORBIDDEN, "此帳號未啟用此功能權限")
                    return None
                return session

            def _session_for_token(self, token: str) -> dict | None:
                session = app.sessions.get(token)
                if not session:
                    self._json_error(HTTPStatus.UNAUTHORIZED, "請重新登入")
                    return None
                return session

            def _read_json(
                self,
                max_bytes: int = 1024 * 1024,
                too_large_message: str = "資料太大",
            ) -> dict:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError as exc:
                    raise RequestError(HTTPStatus.BAD_REQUEST, "請求內容長度不正確") from exc
                if length > max_bytes:
                    self.close_connection = True
                    raise RequestError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, too_large_message)
                raw = self.rfile.read(length)
                try:
                    return json.loads(raw.decode("utf-8") or "{}")
                except json.JSONDecodeError as exc:
                    raise RequestError(HTTPStatus.BAD_REQUEST, "請求內容不是有效 JSON") from exc

            def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
                content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def _json_error(self, status: HTTPStatus, message: str) -> None:
                self._send_json({"error": message}, status)

            def _safe_json_error(self, status: HTTPStatus, message: str) -> None:
                try:
                    self._json_error(status, message)
                except (BrokenPipeError, ConnectionResetError):
                    return

            def _serve_file(self, path: Path) -> None:
                mime_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                self._serve_static_file(path, mime_type)

            def _serve_static_file(self, path: Path, mime_type: str) -> None:
                try:
                    resolved = path.resolve()
                    static_root = STATIC_DIR.resolve()
                    if static_root != resolved and static_root not in resolved.parents:
                        raise FileNotFoundError
                    content = resolved.read_bytes()
                except FileNotFoundError:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到檔案")
                    return

                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", mime_type)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

        return Handler

    def run(self) -> None:
        host = self.config.get("host", "0.0.0.0")
        port = int(self.config.get("port", 8000))
        server = ThreadingHTTPServer((host, port), self.handler_class())
        print(f"Delivery photo server running at http://{host}:{port}")
        server.serve_forever()


def load_config(path: str | Path) -> dict:
    with Path(path).open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def main() -> None:
    DeliveryServer(load_config(ROOT_DIR / "config.json")).run()


def safe_upload_name(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if not name:
        raise ValueError("Excel 檔名不可空白")
    return name


def decode_file_data(file_data: str) -> bytes:
    match = re.match(r"^data:.*?;base64,(.+)$", file_data, re.DOTALL)
    payload = match.group(1) if match else file_data
    try:
        return base64_decode(payload)
    except Exception as exc:
        raise ValueError("檔案內容不正確") from exc


def base64_decode(value: str) -> bytes:
    import base64

    return base64.b64decode(value, validate=True)


def quote_filename(filename: str) -> str:
    from urllib.parse import quote

    return quote(filename)
