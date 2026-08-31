from __future__ import annotations

import io
import re
import unicodedata
import warnings
from dataclasses import dataclass
from pathlib import Path


MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
MAX_DIMENSION_PX = 16_384
MIN_DIMENSION_PX = 64


class InvalidImage(ValueError):
    pass


@dataclass(frozen=True)
class ImageInfo:
    content_type: str
    extension: str
    width: int
    height: int


def safe_display_filename(filename: str | None, extension: str) -> str:
    """Sanitize a user-controlled name for display; it is never used as a path."""

    raw = unicodedata.normalize("NFKC", filename or "factory-photo")
    raw = raw.replace("\\", "/").rsplit("/", 1)[-1]
    stem = Path(raw).stem
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "-", stem).strip(" ._-")
    stem = re.sub(r"\s+", " ", stem)[:96] or "factory-photo"
    return f"{stem}.{extension}"


def inspect_image(data: bytes) -> ImageInfo:
    """Validate signature and dimensions without trusting MIME type or extension."""

    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        info = _inspect_png(data)
    elif data.startswith(b"\xff\xd8"):
        info = _inspect_jpeg(data)
    elif len(data) >= 30 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        info = _inspect_webp(data)
    else:
        raise InvalidImage("unsupported image data; upload a JPEG, PNG, or WebP photo")

    if info.width < MIN_DIMENSION_PX or info.height < MIN_DIMENSION_PX:
        raise InvalidImage(
            f"image must be at least {MIN_DIMENSION_PX}x{MIN_DIMENSION_PX} pixels"
        )
    if info.width > MAX_DIMENSION_PX or info.height > MAX_DIMENSION_PX:
        raise InvalidImage(f"image dimensions may not exceed {MAX_DIMENSION_PX}px")
    if info.width * info.height > MAX_IMAGE_PIXELS:
        raise InvalidImage("image has too many pixels")

    _verify_decodable_if_pillow_available(data, info)
    return info


def _inspect_png(data: bytes) -> ImageInfo:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise InvalidImage("invalid PNG header")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return ImageInfo("image/png", "png", width, height)


def _inspect_jpeg(data: bytes) -> ImageInfo:
    # Walk JPEG segments until a Start Of Frame marker supplies the dimensions.
    index = 2
    sof_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while index + 4 <= len(data):
        while index < len(data) and data[index] != 0xFF:
            index += 1
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if index + 2 > len(data):
            break
        length = int.from_bytes(data[index : index + 2], "big")
        if length < 2 or index + length > len(data):
            raise InvalidImage("invalid JPEG segment")
        if marker in sof_markers:
            if length < 7:
                raise InvalidImage("invalid JPEG frame header")
            height = int.from_bytes(data[index + 3 : index + 5], "big")
            width = int.from_bytes(data[index + 5 : index + 7], "big")
            return ImageInfo("image/jpeg", "jpg", width, height)
        index += length
    raise InvalidImage("JPEG dimensions could not be read")


def _inspect_webp(data: bytes) -> ImageInfo:
    kind = data[12:16]
    if kind == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
    elif kind == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        b0, b1, b2, b3 = data[21:25]
        width = 1 + b0 + ((b1 & 0x3F) << 8)
        height = 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0F) << 10)
    elif kind == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
    else:
        raise InvalidImage("unsupported or invalid WebP header")
    return ImageInfo("image/webp", "webp", width, height)


def _verify_decodable_if_pillow_available(data: bytes, info: ImageInfo) -> None:
    try:
        from PIL import Image
    except ImportError:
        return

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.width != info.width or image.height != info.height:
                    raise InvalidImage("image dimensions are inconsistent")
                image.verify()
    except InvalidImage:
        raise
    except Exception as exc:
        raise InvalidImage("image data is corrupt or cannot be decoded") from exc

