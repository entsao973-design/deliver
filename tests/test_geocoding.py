import unittest
from urllib.parse import unquote
from unittest.mock import patch

from delivery_app.geocoding import (
    GEOCODE_EMPTY,
    GEOCODE_PENDING,
    GEOCODE_SUCCESS,
    GoogleGeocoder,
    GeocodeResult,
    StaticGeocoder,
    apply_geocode_result,
    default_geocode_fields,
    make_geocoder,
    normalize_address,
)


class GeocodingTest(unittest.TestCase):
    def test_normalizes_address_spacing(self):
        self.assertEqual(normalize_address("  台北市  中山區\t測試路1號  "), "台北市 中山區 測試路1號")

    def test_default_geocode_fields_mark_empty_and_pending_addresses(self):
        self.assertEqual(
            default_geocode_fields(""),
            {
                "normalized_address": "",
                "geocode_lat": None,
                "geocode_lng": None,
                "geocode_status": GEOCODE_EMPTY,
                "geocode_provider": None,
                "geocode_place_id": None,
                "geocode_updated_at": None,
                "geocode_error": None,
            },
        )
        self.assertEqual(default_geocode_fields("台北市中山區測試路1號")["geocode_status"], GEOCODE_PENDING)

    def test_static_geocoder_applies_success_result_to_record(self):
        geocoder = StaticGeocoder({
            "台北市中山區測試路1號": GeocodeResult.success(
                lat=25.0478,
                lng=121.5319,
                provider="static",
                place_id="place-1",
            ),
        })
        record = {"address": " 台北市中山區測試路1號 "}

        result = geocoder.geocode(record["address"])
        apply_geocode_result(record, result)

        self.assertEqual(record["geocode_status"], GEOCODE_SUCCESS)
        self.assertEqual(record["geocode_lat"], 25.0478)
        self.assertEqual(record["geocode_lng"], 121.5319)
        self.assertEqual(record["geocode_provider"], "static")
        self.assertEqual(record["geocode_place_id"], "place-1")
        self.assertEqual(record["normalized_address"], "台北市中山區測試路1號")

    def test_make_geocoder_keeps_provider_disabled_by_default(self):
        geocoder = make_geocoder({})

        self.assertFalse(geocoder.enabled)

    def test_google_geocoder_parses_success_response(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append((request.full_url, timeout))
            return FakeResponse(
                b'{"status":"OK","results":[{"place_id":"abc123","geometry":{"location":{"lat":25.0478,"lng":121.5319}}}]}'
            )

        geocoder = GoogleGeocoder(api_key="key-1", country_hint="台灣", urlopen=fake_urlopen, timeout_seconds=7)
        result = geocoder.geocode("台北市中山區測試路1號")

        self.assertEqual(result.status, GEOCODE_SUCCESS)
        self.assertEqual(result.lat, 25.0478)
        self.assertEqual(result.lng, 121.5319)
        self.assertEqual(result.provider, "google")
        self.assertEqual(result.place_id, "abc123")
        self.assertIn("address=", requests[0][0])
        self.assertIn("components=country%3ATW", requests[0][0])
        self.assertEqual(requests[0][1], 7)

    def test_google_geocoder_reports_api_errors_even_without_results(self):
        def fake_urlopen(request, timeout):
            return FakeResponse(
                b'{"status":"REQUEST_DENIED","error_message":"API key is restricted","results":[]}'
            )

        geocoder = GoogleGeocoder(api_key="key-1", urlopen=fake_urlopen)
        result = geocoder.geocode("Taipei 101")

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.provider, "google")
        self.assertEqual(result.error_message, "API key is restricted")

    def test_google_geocoder_strips_delivery_notes_from_taiwan_address_query(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append(unquote(request.full_url))
            return FakeResponse(
                b'{"status":"OK","results":[{"place_id":"abc123","geometry":{"location":{"lat":25.0478,"lng":121.5319}}}]}'
            )

        geocoder = GoogleGeocoder(api_key="key-1", country_hint="Taiwan", urlopen=fake_urlopen)
        result = geocoder.geocode("台北市內湖區成功路二段325號B1 中央庫房")

        self.assertEqual(result.status, GEOCODE_SUCCESS)
        self.assertIn("address=台北市內湖區成功路二段325號+Taiwan", requests[0])
        self.assertNotIn("中央庫房", requests[0])

    def test_google_geocoder_uses_first_result_for_exact_taiwan_street_number(self):
        def fake_urlopen(request, timeout):
            return FakeResponse(
                b'{"status":"OK","results":['
                b'{"place_id":"first","geometry":{"location":{"lat":25.0478,"lng":121.5319}}},'
                b'{"place_id":"second","geometry":{"location":{"lat":25.1,"lng":121.6}}}'
                b']}'
            )

        geocoder = GoogleGeocoder(api_key="key-1", urlopen=fake_urlopen)
        result = geocoder.geocode("新北市三重區光復路1段47號1樓")

        self.assertEqual(result.status, GEOCODE_SUCCESS)
        self.assertEqual(result.lat, 25.0478)
        self.assertEqual(result.lng, 121.5319)
        self.assertEqual(result.place_id, "first")

    def test_make_geocoder_reads_google_api_key_from_environment(self):
        with patch.dict("os.environ", {"GOOGLE_GEOCODING_API_KEY": "env-key"}):
            geocoder = make_geocoder({
                "enabled": True,
                "provider": "google",
                "api_key_env": "GOOGLE_GEOCODING_API_KEY",
            })

        self.assertIsInstance(geocoder, GoogleGeocoder)

    def test_make_geocoder_reads_google_api_key_from_windows_environment_fallback(self):
        with patch.dict("os.environ", {}, clear=True), patch(
            "delivery_app.geocoding.read_windows_environment_variable",
            return_value="machine-key",
        ):
            geocoder = make_geocoder({
                "enabled": True,
                "provider": "google",
                "api_key_env": "GOOGLE_GEOCODING_API_KEY",
            })

        self.assertIsInstance(geocoder, GoogleGeocoder)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self) -> bytes:
        return self.body


if __name__ == "__main__":
    unittest.main()
