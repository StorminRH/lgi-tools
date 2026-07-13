#!/usr/bin/env python3
"""Verify LGI.tools social cards against a running local Next dev server.

The script fetches page metadata plus the default and three representative
image routes, then prints their status, content type, and PNG dimensions. It
does not write files.

    python3 scripts/verify-og-cards.py
    python3 scripts/verify-og-cards.py --base-url http://localhost:3000
"""

from __future__ import annotations

import argparse
import struct
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import urlopen


EXPECTED_SIZE = (1200, 630)
SITE_IDS = (100, 121, 130)  # combat, gas, ore in the local catalogue


class OpenGraphParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.images: list[dict[str, str]] = []
        self.twitter_images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "meta":
            return
        values = {key: value or "" for key, value in attrs}
        if values.get("property", "").startswith("og:image"):
            self.images.append(values)
        if values.get("name") == "twitter:image":
            self.twitter_images.append(values)


def fetch(url: str) -> tuple[int, str, bytes]:
    with urlopen(url, timeout=30) as response:
        return response.status, response.headers.get_content_type(), response.read()


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("response is not a PNG")
    return struct.unpack(">II", data[16:24])


def metadata_image_paths(html: bytes) -> tuple[str, str, dict[str, str]]:
    parser = OpenGraphParser()
    parser.feed(html.decode("utf-8"))
    image = next((meta for meta in parser.images if meta.get("property") == "og:image"), None)
    if image is None:
        raise ValueError("page has no og:image metadata")
    twitter_image = parser.twitter_images[0] if parser.twitter_images else None
    if twitter_image is None:
        raise ValueError("page has no twitter:image metadata")
    return urlparse(image["content"]).path, urlparse(twitter_image["content"]).path, {
        meta.get("property", ""): meta.get("content", "") for meta in parser.images
    }


def verify_page(base_url: str, page_path: str, expected_image_path: str) -> None:
    status, content_type, body = fetch(f"{base_url}{page_path}")
    image_path, twitter_image_path, metadata = metadata_image_paths(body)
    width = metadata.get("og:image:width")
    height = metadata.get("og:image:height")
    if status != 200 or content_type != "text/html":
        raise ValueError(f"{page_path}: expected 200 text/html, got {status} {content_type}")
    if image_path != expected_image_path:
        raise ValueError(f"{page_path}: expected {expected_image_path}, got {image_path}")
    if twitter_image_path != expected_image_path:
        raise ValueError(
            f"{page_path}: expected Twitter fallback {expected_image_path}, got {twitter_image_path}"
        )
    if (width, height) != (str(EXPECTED_SIZE[0]), str(EXPECTED_SIZE[1])):
        raise ValueError(f"{page_path}: unexpected metadata dimensions {width}x{height}")
    print(f"page {page_path}: 200 text/html -> {image_path} ({width}x{height})")


def verify_image(base_url: str, image_path: str) -> None:
    status, content_type, body = fetch(f"{base_url}{image_path}")
    dimensions = png_size(body)
    if status != 200 or content_type != "image/png" or dimensions != EXPECTED_SIZE:
        raise ValueError(
            f"{image_path}: expected 200 image/png {EXPECTED_SIZE}, "
            f"got {status} {content_type} {dimensions}"
        )
    print(f"image {image_path}: 200 image/png {dimensions[0]}x{dimensions[1]}")


def verify_not_found(base_url: str, image_path: str) -> None:
    try:
        fetch(f"{base_url}{image_path}")
    except HTTPError as error:
        if error.code == 404:
            print(f"image {image_path}: 404 for unknown site")
            return
        raise
    raise ValueError(f"{image_path}: expected 404 for unknown site")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3000")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    verify_page(base_url, "/", "/opengraph-image")
    verify_image(base_url, "/opengraph-image")
    for site_id in SITE_IDS:
        page_path = f"/sites/{site_id}"
        image_path = f"{page_path}/opengraph-image"
        verify_page(base_url, page_path, image_path)
        verify_image(base_url, image_path)
    verify_not_found(base_url, "/sites/999999/opengraph-image")


if __name__ == "__main__":
    main()
