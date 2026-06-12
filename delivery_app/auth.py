from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


LOCK_AFTER_FAILURES = 5
LOCK_MINUTES = 10
ROLES = {"driver", "admin"}


class UserStore:
    def __init__(self, user_file: str, seed_users: list[dict[str, Any]] | None = None) -> None:
        self.user_file = Path(user_file)
        self.user_file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._ensure_users(seed_users or [])

    def authenticate(self, username: str, password: str) -> tuple[bool, dict[str, Any] | None, str]:
        username = username.strip()
        now = datetime.now()

        with self._lock:
            data = self._read_unlocked()
            user = self._find_unlocked(data, username)
            if not user or not user.get("active", True):
                return False, None, "帳號或密碼錯誤"

            locked_until = parse_time(user.get("locked_until"))
            if locked_until and locked_until > now:
                minutes = max(1, int((locked_until - now).total_seconds() // 60) + 1)
                return False, None, f"登入失敗已達 5 次，請 {minutes} 分鐘後再試"

            if not verify_password(password, user.get("password_hash", "")):
                failures = int(user.get("failed_attempts", 0)) + 1
                user["failed_attempts"] = failures
                if failures >= LOCK_AFTER_FAILURES:
                    user["locked_until"] = (now + timedelta(minutes=LOCK_MINUTES)).isoformat(timespec="seconds")
                    message = "登入失敗已達 5 次，帳號鎖定 10 分鐘"
                else:
                    remaining = LOCK_AFTER_FAILURES - failures
                    message = f"帳號或密碼錯誤，已失敗 {failures} 次，再錯 {remaining} 次將鎖定 10 分鐘"
                self._write_unlocked(data)
                return False, None, message

            user["failed_attempts"] = 0
            user["locked_until"] = None
            user["last_login_at"] = now.isoformat(timespec="seconds")
            self._write_unlocked(data)
            return True, public_user(user), ""

    def list_users(self) -> list[dict[str, Any]]:
        with self._lock:
            users = self._read_unlocked().get("users", [])
            return [public_user(user) for user in sorted(users, key=lambda item: item["username"])]

    def upsert_user(
        self,
        username: str,
        role: str,
        password: str | None = None,
        active: bool = True,
    ) -> dict[str, Any]:
        username = username.strip()
        role = role.strip()
        if not username:
            raise ValueError("請輸入使用者名稱")
        if role not in ROLES:
            raise ValueError("角色必須是 driver 或 admin")

        with self._lock:
            data = self._read_unlocked()
            user = self._find_unlocked(data, username)
            now = datetime.now().isoformat(timespec="seconds")
            if not user:
                if not password:
                    raise ValueError("新增使用者必須設定密碼")
                user = {
                    "username": username,
                    "created_at": now,
                    "failed_attempts": 0,
                    "locked_until": None,
                    "last_login_at": None,
                }
                data.setdefault("users", []).append(user)

            user["role"] = role
            user["active"] = bool(active)
            user["updated_at"] = now
            if password:
                user["password_hash"] = hash_password(password)
                user["failed_attempts"] = 0
                user["locked_until"] = None

            self._write_unlocked(data)
            return public_user(user)

    def delete_user(self, username: str) -> None:
        username = username.strip()
        with self._lock:
            data = self._read_unlocked()
            users = data.get("users", [])
            data["users"] = [user for user in users if user.get("username") != username]
            self._write_unlocked(data)

    def _ensure_users(self, seed_users: list[dict[str, Any]]) -> None:
        with self._lock:
            data = self._read_unlocked()
            users = data.setdefault("users", [])
            by_name = {user["username"]: user for user in users}

            for seed in seed_users:
                username = str(seed.get("username", "")).strip()
                if username and username not in by_name:
                    users.append(make_seed_user(username, seed.get("password", ""), seed.get("role", "driver")))

            if "admin" not in {user["username"] for user in users}:
                users.append(make_seed_user("admin", "admin123", "admin"))
            if "driver" not in {user["username"] for user in users}:
                users.append(make_seed_user("driver", "1234", "driver"))

            self._write_unlocked(data)

    def _find_unlocked(self, data: dict[str, Any], username: str) -> dict[str, Any] | None:
        for user in data.get("users", []):
            if user.get("username") == username:
                return user
        return None

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.user_file.exists():
            return {"users": []}
        with self.user_file.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write_unlocked(self, data: dict[str, Any]) -> None:
        temp_path = self.user_file.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        temp_path.replace(self.user_file)


def make_seed_user(username: str, password: str, role: str) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    return {
        "username": username,
        "role": role if role in ROLES else "driver",
        "password_hash": hash_password(password),
        "active": True,
        "failed_attempts": 0,
        "locked_until": None,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
    }


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return "pbkdf2_sha256$200000$" + b64(salt) + "$" + b64(digest)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_text, digest_text = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_text.encode("ascii"))
        expected = base64.b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "username": user["username"],
        "role": user.get("role", "driver"),
        "active": bool(user.get("active", True)),
        "failed_attempts": int(user.get("failed_attempts", 0)),
        "locked_until": user.get("locked_until"),
        "last_login_at": user.get("last_login_at"),
    }


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")

