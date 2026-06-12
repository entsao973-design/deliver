from __future__ import annotations

import json
import mimetypes
import re
import secrets
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .auth import UserStore
from .repository import DeliveryRepository


ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"


def create_repository(config: dict):
    if is_sqlserver_backend(config):
        from .sqlserver_store import SqlServerRepository

        return SqlServerRepository(
            config.get("database", {}),
            config.get("excel_path"),
            config.get("photo_root", "storage/photos"),
            config.get("archive_root", "data/archives"),
        )

    return DeliveryRepository(
        config.get("excel_path"),
        config.get("data_file", "data/deliveries.json"),
        config.get("photo_root", "storage/photos"),
        config.get("archive_root", "data/archives"),
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
        self.upload_dir = Path(config.get("upload_dir", "data/uploads"))
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.sessions: dict[str, dict] = {}

    def handler_class(self):
        app = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "DeliveryPhotoServer/0.1"

            def do_GET(self) -> None:
                parsed = urlparse(self.path)
                if parsed.path == "/":
                    self._serve_file(STATIC_DIR / "index.html")
                elif parsed.path == "/admin":
                    self._serve_file(STATIC_DIR / "admin.html")
                elif parsed.path.startswith("/static/"):
                    relative = unquote(parsed.path.removeprefix("/static/"))
                    self._serve_file(STATIC_DIR / relative)
                elif parsed.path == "/api/deliveries":
                    self._handle_deliveries(parsed)
                elif parsed.path.startswith("/api/deliveries/") and parsed.path.endswith("/photo"):
                    delivery_id = parsed.path.split("/")[3]
                    self._handle_photo(parsed, delivery_id)
                elif parsed.path == "/api/admin/deliveries":
                    self._handle_admin_deliveries(parsed)
                elif parsed.path == "/api/admin/options":
                    self._handle_admin_options(parsed)
                elif parsed.path == "/api/admin/users":
                    self._handle_admin_users(parsed)
                elif parsed.path.startswith("/api/admin/archives/"):
                    filename = unquote(parsed.path.removeprefix("/api/admin/archives/"))
                    self._handle_admin_archive_download(parsed, filename)
                else:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到頁面")

            def do_POST(self) -> None:
                parsed = urlparse(self.path)
                if parsed.path == "/api/login":
                    self._handle_login()
                elif parsed.path.startswith("/api/deliveries/") and parsed.path.endswith("/photo"):
                    delivery_id = parsed.path.split("/")[3]
                    self._handle_photo_upload(delivery_id)
                elif parsed.path == "/api/reload":
                    self._handle_reload()
                elif parsed.path == "/api/admin/import":
                    self._handle_admin_import()
                elif parsed.path == "/api/admin/users":
                    self._handle_admin_user_save()
                elif parsed.path == "/api/admin/users/delete":
                    self._handle_admin_user_delete()
                elif parsed.path == "/api/admin/archive":
                    self._handle_admin_archive()
                elif parsed.path.startswith("/api/admin/deliveries/") and parsed.path.endswith("/permanent-delete"):
                    delivery_id = parsed.path.split("/")[4]
                    self._handle_admin_permanent_delete(delivery_id)
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
                requested_date = str(body.get("delivery_date", "")).strip() or None

                ok, user, message = app.users.authenticate(username, password)
                if not ok or not user:
                    self._json_error(HTTPStatus.UNAUTHORIZED, message)
                    return
                if user["role"] == "admin":
                    token = secrets.token_urlsafe(32)
                    app.sessions[token] = {"username": username, "role": "admin", "vehicle_no": None}
                    self._send_json({"token": token, "role": "admin", "user": user})
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
                app.sessions[token] = {"username": username, "role": "driver", "vehicle_no": vehicle_no}
                deliveries = app.repo.list_for_vehicle(vehicle_no, include_delivered=False, delivery_date=selected_date)
                counts = app.repo.counts_for_vehicle(vehicle_no, selected_date)
                self._send_json({
                    "token": token,
                    "role": "driver",
                    "user": user,
                    "profile": meta,
                    "dates": dates,
                    "selected_date": selected_date,
                    "deliveries": deliveries,
                    "counts": counts,
                })

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
                self._send_json({"ok": True})

            def _handle_admin_import(self) -> None:
                body = self._read_json(max_bytes=32 * 1024 * 1024)
                if not self._admin_from_body(body):
                    return

                filename = safe_upload_name(str(body.get("filename", "")))
                file_data = str(body.get("file_data", ""))
                if not filename.lower().endswith((".xlsm", ".xlsx")):
                    self._json_error(HTTPStatus.BAD_REQUEST, "只能上傳 Excel 檔案")
                    return

                upload_path = app.upload_dir / filename
                try:
                    upload_path.write_bytes(decode_file_data(file_data))
                    summary = app.repo.import_excel_file(upload_path)
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                except Exception as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, f"Excel 匯入失敗: {exc}")
                    return
                finally:
                    upload_path.unlink(missing_ok=True)

                self._send_json({"ok": True, "summary": summary})

            def _handle_admin_deliveries(self, parsed) -> None:
                if not self._admin_from_request(parsed):
                    return
                query = parse_qs(parsed.query)
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
                if not self._admin_from_request(parsed):
                    return
                self._send_json(app.repo.filter_options())

            def _handle_admin_delete(self, delivery_id: str) -> None:
                body = self._read_json()
                session = self._admin_from_body(body)
                if not session:
                    return
                try:
                    result = app.repo.delete_delivery(delivery_id, session["username"])
                except KeyError as exc:
                    self._json_error(HTTPStatus.NOT_FOUND, str(exc))
                    return
                self._send_json(result)

            def _handle_admin_permanent_delete(self, delivery_id: str) -> None:
                body = self._read_json()
                if not self._admin_from_body(body):
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

            def _handle_admin_archive(self) -> None:
                body = self._read_json()
                if not self._admin_from_body(body):
                    return
                try:
                    archives = app.repo.archive_photos(str(body.get("delivery_date", "")))
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"archives": archives})

            def _handle_admin_archive_download(self, parsed, filename: str) -> None:
                if not self._admin_from_request(parsed):
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
                if not self._admin_from_request(parsed):
                    return
                self._send_json({"users": app.users.list_users()})

            def _handle_admin_user_save(self) -> None:
                body = self._read_json()
                if not self._admin_from_body(body):
                    return
                try:
                    user = app.users.upsert_user(
                        str(body.get("username", "")),
                        str(body.get("role", "")),
                        str(body.get("password", "")) or None,
                        bool(body.get("active", True)),
                    )
                except ValueError as exc:
                    self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
                    return
                self._send_json({"user": user})

            def _handle_admin_user_delete(self) -> None:
                body = self._read_json()
                session = self._admin_from_body(body)
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

            def _require_admin(self, session: dict | None) -> dict | None:
                if not session:
                    return None
                if session.get("role") != "admin":
                    self._json_error(HTTPStatus.FORBIDDEN, "需要管理人員權限")
                    return None
                return session

            def _session_for_token(self, token: str) -> dict | None:
                session = app.sessions.get(token)
                if not session:
                    self._json_error(HTTPStatus.UNAUTHORIZED, "請重新登入")
                    return None
                return session

            def _read_json(self, max_bytes: int = 1024 * 1024) -> dict:
                length = int(self.headers.get("Content-Length", "0"))
                if length > max_bytes:
                    self._json_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "資料太大")
                    return {}
                raw = self.rfile.read(length)
                return json.loads(raw.decode("utf-8") or "{}")

            def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
                content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def _json_error(self, status: HTTPStatus, message: str) -> None:
                self._send_json({"error": message}, status)

            def _serve_file(self, path: Path) -> None:
                try:
                    resolved = path.resolve()
                    static_root = STATIC_DIR.resolve()
                    if static_root != resolved and static_root not in resolved.parents:
                        raise FileNotFoundError
                    content = resolved.read_bytes()
                except FileNotFoundError:
                    self._json_error(HTTPStatus.NOT_FOUND, "找不到檔案")
                    return

                mime_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
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
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def main() -> None:
    DeliveryServer(load_config(ROOT_DIR / "config.json")).run()


def safe_upload_name(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    if not name:
        raise ValueError("檔名不正確")
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
