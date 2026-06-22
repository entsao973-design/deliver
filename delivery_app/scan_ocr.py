from __future__ import annotations

import base64
import os
import re
from typing import Any

from .geocoding import read_environment_variable


class ScanOcrError(Exception):
    pass


class DisabledScanOcr:
    enabled = False
    provider = "disabled"

    def recognize_text(self, image_bytes: bytes) -> str:
        raise ScanOcrError("雲端掃號尚未啟用")


class FailedConfigScanOcr:
    enabled = True
    provider = "failed_config"

    def __init__(self, message: str) -> None:
        self.message = message

    def recognize_text(self, image_bytes: bytes) -> str:
        raise ScanOcrError(self.message)


class GoogleVisionScanOcr:
    enabled = True
    provider = "google_vision"

    def __init__(
        self,
        client=None,
        vision_module=None,
        feature_type: str = "TEXT_DETECTION",
        timeout_seconds: int = 10,
    ) -> None:
        self.client = client
        self.vision_module = vision_module
        self.feature_type = normalize_feature_type(feature_type)
        self.timeout_seconds = timeout_seconds

    def recognize_text(self, image_bytes: bytes) -> str:
        vision = self._vision_module()
        client = self._client(vision)
        image = vision.Image(content=image_bytes)
        feature_type = getattr(vision.Feature.Type, self.feature_type)
        feature = vision.Feature(type_=feature_type)
        response = client.annotate_image({
            "image": image,
            "features": [feature],
        }, timeout=self.timeout_seconds)

        error_message = getattr(getattr(response, "error", None), "message", "")
        if error_message:
            raise ScanOcrError(f"Google Vision OCR 失敗：{error_message}")

        annotations = getattr(response, "text_annotations", None) or []
        if annotations:
            return str(getattr(annotations[0], "description", "") or "").strip()

        full_text = getattr(getattr(response, "full_text_annotation", None), "text", "")
        return str(full_text or "").strip()

    def _vision_module(self):
        if self.vision_module is not None:
            return self.vision_module
        try:
            from google.cloud import vision
        except ImportError as exc:
            raise ScanOcrError("Google Cloud Vision 套件尚未安裝，請安裝 google-cloud-vision") from exc
        self.vision_module = vision
        return vision

    def _client(self, vision):
        if self.client is None:
            self.client = vision.ImageAnnotatorClient()
        return self.client


def make_scan_ocr(config: dict[str, Any] | None):
    config = config or {}
    if not config.get("enabled", False):
        return DisabledScanOcr()

    provider = str(config.get("provider") or "").lower()
    if provider != "google_vision":
        return FailedConfigScanOcr(f"不支援的雲端掃號服務：{provider or '(empty)'}")

    credentials_file = str(config.get("credentials_file") or "").strip()
    credentials_file_env = str(config.get("credentials_file_env") or "GOOGLE_APPLICATION_CREDENTIALS").strip()
    if not credentials_file and credentials_file_env:
        credentials_file = read_environment_variable(credentials_file_env).strip()
    if credentials_file:
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", credentials_file)

    try:
        feature_type = normalize_feature_type(str(config.get("feature_type") or "TEXT_DETECTION"))
    except ValueError as exc:
        return FailedConfigScanOcr(str(exc))

    return GoogleVisionScanOcr(
        feature_type=feature_type,
        timeout_seconds=int(config.get("timeout_seconds") or 10),
    )


def normalize_feature_type(value: str) -> str:
    feature_type = str(value or "").strip().upper()
    if feature_type in {"TEXT_DETECTION", "DOCUMENT_TEXT_DETECTION"}:
        return feature_type
    raise ValueError("Google Vision feature_type 必須是 TEXT_DETECTION 或 DOCUMENT_TEXT_DETECTION")


def decode_scan_image_data_url(image_data: str) -> bytes:
    match = re.match(r"^data:image/(?:jpeg|jpg|png|webp);base64,(.+)$", str(image_data or ""), re.IGNORECASE | re.DOTALL)
    if not match:
        raise ValueError("掃號圖片格式必須是 base64 圖片")
    try:
        return base64.b64decode(match.group(1), validate=True)
    except Exception as exc:
        raise ValueError("掃號圖片格式必須是 base64 圖片") from exc
