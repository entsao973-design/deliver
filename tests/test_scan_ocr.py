import base64
import http.client
import json
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from delivery_app.scan_ocr import GoogleVisionScanOcr, decode_scan_image_data_url, make_scan_ocr
from delivery_app.web import DeliveryServer


class FakeFeature:
    class Type:
        TEXT_DETECTION = "TEXT_DETECTION"
        DOCUMENT_TEXT_DETECTION = "DOCUMENT_TEXT_DETECTION"

    def __init__(self, type_):
        self.type_ = type_


class FakeImage:
    def __init__(self, content):
        self.content = content


class FakeVision:
    Feature = FakeFeature
    Image = FakeImage


class FakeVisionClient:
    def __init__(self, text="M1156646", error_message=""):
        self.text = text
        self.error_message = error_message
        self.requests = []
        self.timeouts = []

    def annotate_image(self, request, timeout=None):
        self.requests.append(request)
        self.timeouts.append(timeout)
        return SimpleNamespace(
            error=SimpleNamespace(message=self.error_message),
            text_annotations=[SimpleNamespace(description=self.text)] if self.text else [],
            full_text_annotation=SimpleNamespace(text=self.text),
        )


class FakeScanOcr:
    enabled = True
    provider = "google_vision"

    def __init__(self):
        self.images = []

    def recognize_text(self, image_bytes):
        self.images.append(image_bytes)
        return "M1156646"


@contextmanager
def running_server_with_scan_ocr(scan_ocr):
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
        app.scan_ocr = scan_ocr
        app.sessions["driver-token"] = {
            "username": "driver",
            "role": "driver",
            "vehicle_no": "RFW-3960",
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


def request_json(address, method, path, body):
    connection = http.client.HTTPConnection(address[0], address[1], timeout=5)
    try:
        payload = json.dumps(body).encode("utf-8")
        connection.request(method, path, body=payload, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        content = response.read().decode("utf-8")
        return response.status, response.getheader("Content-Type"), json.loads(content)
    finally:
        connection.close()


class ScanOcrTest(unittest.TestCase):
    def test_config_example_and_requirements_include_google_vision_ocr(self):
        root = Path(__file__).resolve().parent.parent
        config = json.loads((root / "config.example.json").read_text(encoding="utf-8"))
        requirements = (root / "requirements.txt").read_text(encoding="utf-8")

        self.assertEqual(config["scan_ocr"]["provider"], "google_vision")
        self.assertEqual(config["scan_ocr"]["credentials_file_env"], "GOOGLE_APPLICATION_CREDENTIALS")
        self.assertIn("google-cloud-vision", requirements)

    def test_decode_scan_image_data_url_accepts_jpeg(self):
        encoded = base64.b64encode(b"image-bytes").decode("ascii")

        self.assertEqual(decode_scan_image_data_url(f"data:image/jpeg;base64,{encoded}"), b"image-bytes")

    def test_google_vision_scan_ocr_returns_first_text_annotation(self):
        client = FakeVisionClient()
        ocr = GoogleVisionScanOcr(
            client=client,
            vision_module=FakeVision,
            feature_type="TEXT_DETECTION",
            timeout_seconds=7,
        )

        text = ocr.recognize_text(b"image-bytes")

        self.assertEqual(text, "M1156646")
        request = client.requests[0]
        self.assertEqual(request["image"].content, b"image-bytes")
        self.assertEqual(request["features"][0].type_, "TEXT_DETECTION")
        self.assertEqual(client.timeouts, [7])

    def test_make_scan_ocr_uses_google_vision_provider(self):
        ocr = make_scan_ocr({
            "enabled": True,
            "provider": "google_vision",
            "feature_type": "DOCUMENT_TEXT_DETECTION",
        })

        self.assertTrue(ocr.enabled)
        self.assertEqual(ocr.feature_type, "DOCUMENT_TEXT_DETECTION")

    def test_driver_scan_ocr_endpoint_requires_driver_token_and_returns_text(self):
        scan_ocr = FakeScanOcr()
        image_data = "data:image/jpeg;base64,dGVzdA=="

        with running_server_with_scan_ocr(scan_ocr) as address:
            status, content_type, payload = request_json(
                address,
                "POST",
                "/api/driver/scan-invoice-ocr",
                {"token": "driver-token", "image_data": image_data},
            )

        self.assertEqual(status, 200)
        self.assertIn("application/json", content_type)
        self.assertEqual(payload, {"provider": "google_vision", "text": "M1156646"})
        self.assertEqual(scan_ocr.images, [b"test"])


if __name__ == "__main__":
    unittest.main()
