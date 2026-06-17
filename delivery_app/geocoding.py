from __future__ import annotations

import re
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen as default_urlopen


GEOCODE_PENDING = "pending"
GEOCODE_SUCCESS = "success"
GEOCODE_EMPTY = "empty"
GEOCODE_NO_RESULT = "no_result"
GEOCODE_AMBIGUOUS = "ambiguous"
GEOCODE_FAILED = "failed"
GEOCODE_MANUAL = "manual"


@dataclass(frozen=True)
class GeocodeResult:
    status: str
    normalized_address: str
    lat: float | None = None
    lng: float | None = None
    provider: str | None = None
    place_id: str | None = None
    error_message: str | None = None

    @classmethod
    def success(
        cls,
        lat: float,
        lng: float,
        provider: str,
        place_id: str | None = None,
        normalized_address: str = "",
    ) -> "GeocodeResult":
        return cls(
            status=GEOCODE_SUCCESS,
            normalized_address=normalize_address(normalized_address),
            lat=lat,
            lng=lng,
            provider=provider,
            place_id=place_id,
        )


def normalize_address(address: Any) -> str:
    return re.sub(r"\s+", " ", str(address or "").strip())


def google_query_address(address: Any) -> str:
    normalized = normalize_address(address)
    match = re.search(r"^(.+?號(?:之\d+)?)", normalized)
    if match:
        return match.group(1)
    return normalized


def has_taiwan_street_number(address: Any) -> bool:
    return bool(re.search(r"號(?:之\d+)?", normalize_address(address)))


def default_geocode_fields(address: Any) -> dict[str, Any]:
    normalized = normalize_address(address)
    return {
        "normalized_address": normalized,
        "geocode_lat": None,
        "geocode_lng": None,
        "geocode_status": GEOCODE_PENDING if normalized else GEOCODE_EMPTY,
        "geocode_provider": None,
        "geocode_place_id": None,
        "geocode_updated_at": None,
        "geocode_error": None,
    }


def apply_geocode_result(record: dict[str, Any], result: GeocodeResult) -> None:
    normalized = result.normalized_address or normalize_address(record.get("address"))
    record["normalized_address"] = normalized
    record["geocode_lat"] = result.lat
    record["geocode_lng"] = result.lng
    record["geocode_status"] = result.status
    record["geocode_provider"] = result.provider
    record["geocode_place_id"] = result.place_id
    record["geocode_updated_at"] = datetime.now().isoformat(timespec="seconds")
    record["geocode_error"] = result.error_message


class DisabledGeocoder:
    enabled = False

    def geocode(self, address: Any) -> GeocodeResult:
        normalized = normalize_address(address)
        return GeocodeResult(
            status=GEOCODE_PENDING if normalized else GEOCODE_EMPTY,
            normalized_address=normalized,
        )


class StaticGeocoder:
    enabled = True

    def __init__(self, results: dict[str, GeocodeResult]) -> None:
        self.results = {
            normalize_address(address): result
            for address, result in results.items()
        }

    def geocode(self, address: Any) -> GeocodeResult:
        normalized = normalize_address(address)
        if not normalized:
            return GeocodeResult(status=GEOCODE_EMPTY, normalized_address="")
        result = self.results.get(normalized)
        if result:
            if not result.normalized_address:
                return GeocodeResult(
                    status=result.status,
                    normalized_address=normalized,
                    lat=result.lat,
                    lng=result.lng,
                    provider=result.provider,
                    place_id=result.place_id,
                    error_message=result.error_message,
                )
            return result
        return GeocodeResult(status=GEOCODE_NO_RESULT, normalized_address=normalized)


class FailedConfigGeocoder:
    enabled = True

    def __init__(self, message: str) -> None:
        self.message = message

    def geocode(self, address: Any) -> GeocodeResult:
        return GeocodeResult(
            status=GEOCODE_FAILED,
            normalized_address=normalize_address(address),
            error_message=self.message,
        )


class GoogleGeocoder:
    enabled = True
    endpoint = "https://maps.googleapis.com/maps/api/geocode/json"

    def __init__(
        self,
        api_key: str,
        country_hint: str = "",
        country_code: str = "TW",
        timeout_seconds: int = 5,
        urlopen=default_urlopen,
    ) -> None:
        self.api_key = api_key
        self.country_hint = country_hint
        self.country_code = country_code
        self.timeout_seconds = timeout_seconds
        self.urlopen = urlopen

    def geocode(self, address: Any) -> GeocodeResult:
        normalized = normalize_address(address)
        if not normalized:
            return GeocodeResult(status=GEOCODE_EMPTY, normalized_address="")

        query_address = normalize_address(f"{google_query_address(normalized)} {self.country_hint}")
        query_params = {"address": query_address, "key": self.api_key}
        if self.country_code:
            query_params["components"] = f"country:{self.country_code}"
        query = urlencode(query_params)
        request = Request(f"{self.endpoint}?{query}", headers={"User-Agent": "DeliveryPhotoServer/0.1"})
        try:
            with self.urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            return GeocodeResult(
                status=GEOCODE_FAILED,
                normalized_address=normalized,
                provider="google",
                error_message=str(exc),
            )

        status = payload.get("status")
        results = payload.get("results") or []
        if status == "ZERO_RESULTS":
            return GeocodeResult(status=GEOCODE_NO_RESULT, normalized_address=normalized, provider="google")
        if status != "OK":
            return GeocodeResult(
                status=GEOCODE_FAILED,
                normalized_address=normalized,
                provider="google",
                error_message=str(payload.get("error_message") or status or "Google geocoding failed"),
            )
        if not results:
            return GeocodeResult(
                status=GEOCODE_FAILED,
                normalized_address=normalized,
                provider="google",
                error_message="Google geocoding returned OK without results",
            )
        if len(results) > 1 and not has_taiwan_street_number(normalized):
            return GeocodeResult(status=GEOCODE_AMBIGUOUS, normalized_address=normalized, provider="google")

        first = results[0]
        location = ((first.get("geometry") or {}).get("location") or {})
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            return GeocodeResult(
                status=GEOCODE_FAILED,
                normalized_address=normalized,
                provider="google",
                error_message="Google result missing latitude or longitude",
            )

        return GeocodeResult.success(
            lat=float(lat),
            lng=float(lng),
            provider="google",
            place_id=first.get("place_id"),
            normalized_address=normalized,
        )


def make_geocoder(config: dict[str, Any] | None):
    config = config or {}
    if not config.get("enabled", False):
        return DisabledGeocoder()

    provider = str(config.get("provider") or "").lower()
    if provider == "google":
        api_key = str(config.get("api_key") or "")
        api_key_env = str(config.get("api_key_env") or "")
        if not api_key and api_key_env:
            api_key = read_environment_variable(api_key_env)
        if not api_key:
            return FailedConfigGeocoder("Google geocoding API key is not configured")
        return GoogleGeocoder(
            api_key=api_key,
            country_hint=str(config.get("country_hint") or ""),
            country_code=str(config.get("country_code") or "TW"),
            timeout_seconds=int(config.get("timeout_seconds") or 5),
        )

    return FailedConfigGeocoder(f"Unsupported geocoding provider: {provider or '(empty)'}")


def read_environment_variable(name: str) -> str:
    value = os.environ.get(name, "")
    if value:
        return value
    return read_windows_environment_variable(name)


def read_windows_environment_variable(name: str) -> str:
    if os.name != "nt":
        return ""

    try:
        import winreg
    except ImportError:
        return ""

    locations = (
        (winreg.HKEY_CURRENT_USER, "Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    )
    for root, subkey in locations:
        try:
            with winreg.OpenKey(root, subkey) as key:
                value, _ = winreg.QueryValueEx(key, name)
        except OSError:
            continue
        if value:
            return str(value)
    return ""
