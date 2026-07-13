#!/usr/bin/env python3
"""Verify LGI.tools page metadata and conservative JSON-LD on a local server.

The script performs read-only HTTP requests and prints one complete rendered
head block for the session record. It uses only the Python standard library.

    python3 scripts/verify-seo-metadata.py
    python3 scripts/verify-seo-metadata.py --base-url http://localhost:3000
"""

from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import urlopen


PAGE_TITLES = {
    "/": "Eve Online Wormhole Site Database & Live Jita Loot Prices — LGI.tools",
    "/changelog": "Changelog",
    "/legal": "Privacy",
    "/contact": "Contact",
    "/devlog": "Under the Hood",
    "/sites": "Wormhole Sites — Live Jita Loot & Resource Values",
}


class MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.metadata: dict[str, str] = {}
        self.json_ld: list[dict[str, object]] = []
        self._in_json_ld = False
        self._json_ld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key:
                self.metadata[key] = values.get("content", "")
        if tag == "script" and values.get("type") == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._json_ld_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "script" or not self._in_json_ld:
            return
        self._in_json_ld = False
        value = json.loads("".join(self._json_ld_parts))
        if isinstance(value, dict):
            self.json_ld.append(value)


def fetch_html(base_url: str, path: str) -> str:
    with urlopen(f"{base_url}{path}", timeout=60) as response:
        content_type = response.headers.get_content_type()
        if response.status != 200 or content_type != "text/html":
            raise ValueError(f"{path}: expected 200 text/html, got {response.status} {content_type}")
        return response.read().decode("utf-8")


def parse_page(base_url: str, path: str) -> tuple[str, MetadataParser]:
    body = fetch_html(base_url, path)
    parser = MetadataParser()
    parser.feed(body)
    return body, parser


def verify_page_metadata(path: str, parser: MetadataParser, expected_title: str | None) -> None:
    og_title = parser.metadata.get("og:title")
    twitter_title = parser.metadata.get("twitter:title")
    description = parser.metadata.get("description")
    og_description = parser.metadata.get("og:description")
    twitter_description = parser.metadata.get("twitter:description")

    if expected_title is not None and og_title != expected_title:
        raise ValueError(f"{path}: expected og:title {expected_title!r}, got {og_title!r}")
    if path != "/" and og_title == "LGI.tools":
        raise ValueError(f"{path}: inherited the generic root og:title")
    if not og_title or twitter_title != og_title:
        raise ValueError(f"{path}: Open Graph and Twitter titles differ")
    if not description or og_description != description or twitter_description != description:
        raise ValueError(f"{path}: document, Open Graph, and Twitter descriptions differ")
    image_path = urlparse(parser.metadata.get("og:image", "")).path
    twitter_image_path = urlparse(parser.metadata.get("twitter:image", "")).path
    if image_path != "/opengraph-image" or twitter_image_path != image_path:
        raise ValueError(f"{path}: expected the default social image, got {image_path!r}")
    if parser.metadata.get("og:image:width") != "1200" or parser.metadata.get("og:image:height") != "630":
        raise ValueError(f"{path}: default social image dimensions are missing or incorrect")
    print(f"page {path}: og:title={og_title!r}; copy aligned; default card 1200x630")


def schemas_of_type(parser: MetadataParser, schema_type: str) -> list[dict[str, object]]:
    return [value for value in parser.json_ld if value.get("@type") == schema_type]


def verify_article(path: str, parser: MetadataParser) -> None:
    articles = schemas_of_type(parser, "Article")
    if len(articles) != 1:
        raise ValueError(f"{path}: expected one Article, got {len(articles)}")
    article = articles[0]
    published = article.get("datePublished")
    modified = article.get("dateModified")
    if not isinstance(published, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", published):
        raise ValueError(f"{path}: invalid datePublished {published!r}")
    if modified != published:
        raise ValueError(f"{path}: dateModified does not match the authoritative document date")
    print(f"schema {path}: Article dated {published}")


def verify_breadcrumb(path: str, parser: MetadataParser) -> None:
    breadcrumbs = schemas_of_type(parser, "BreadcrumbList")
    if len(breadcrumbs) != 1:
        raise ValueError(f"{path}: expected one BreadcrumbList, got {len(breadcrumbs)}")
    items = breadcrumbs[0].get("itemListElement")
    if not isinstance(items, list) or [item.get("position") for item in items] != [1, 2, 3]:
        raise ValueError(f"{path}: breadcrumb positions are not [1, 2, 3]")
    print(f"schema {path}: BreadcrumbList with three ordered items")


def print_head(path: str, body: str) -> None:
    match = re.search(r"<head>(.*?)</head>", body, flags=re.DOTALL)
    if match is None:
        raise ValueError(f"{path}: no rendered head block")
    rendered = html.unescape(match.group(0))
    print(f"\n--- rendered head for {path} ---\n{rendered}\n--- end rendered head ---")


def main() -> None:
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("--base-url", default="http://localhost:3000")
    args = argument_parser.parse_args()
    base_url = args.base_url.rstrip("/")

    for path, expected_title in PAGE_TITLES.items():
        _body, parser = parse_page(base_url, path)
        verify_page_metadata(path, parser, expected_title)

    for path in ("/changelog/v3.7", "/devlog/neon"):
        body, parser = parse_page(base_url, path)
        verify_page_metadata(path, parser, None)
        if path.startswith("/devlog/"):
            verify_article(path, parser)
            print_head(path, body)

    _body, devlog_parser = parse_page(base_url, "/devlog")
    verify_article("/devlog", devlog_parser)

    for path in ("/sites/100", "/industry/691"):
        _body, parser = parse_page(base_url, path)
        verify_breadcrumb(path, parser)


if __name__ == "__main__":
    main()
