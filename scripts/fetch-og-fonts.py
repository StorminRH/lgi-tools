#!/usr/bin/env python3
"""Download the two bundled fonts used by LGI.tools Open Graph cards.

Outputs tracked TTF files and their OFL licenses under assets/fonts/. Run with:

    python3 scripts/fetch-og-fonts.py

The script uses only the Python standard library and validates that downloaded
font files have an SFNT header before replacing any existing output.
"""

from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile
from hashlib import sha256
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "fonts"

SOURCES = {
    "BarlowCondensed-Bold.ttf": (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf",
        "e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65",
    ),
    "BarlowCondensed-OFL.txt": (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt",
        "186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f",
    ),
    "JetBrainsMono-Regular.ttf": (
        "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf",
        "e6fd0d7e91550b3ed2b735d4312474362c4716edc4fc0577a0f61ed782d5aed1",
    ),
    "JetBrainsMono-OFL.txt": (
        "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt",
        "a76abf002c49097d146e86740a3105a5d00450b1592e820a1109a8c5680cd697",
    ),
}

SFNT_HEADERS = (b"\x00\x01\x00\x00", b"OTTO", b"true", b"typ1")


def download(url: str) -> bytes:
    with urlopen(url, timeout=30) as response:
        return response.read()


def validate(name: str, data: bytes, expected_sha256: str) -> None:
    if not data:
        raise ValueError(f"{name}: empty download")
    if name.endswith(".ttf") and not data.startswith(SFNT_HEADERS):
        raise ValueError(f"{name}: download is not a supported SFNT font")
    actual_sha256 = sha256(data).hexdigest()
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"{name}: SHA-256 mismatch (expected {expected_sha256}, got {actual_sha256})"
        )


def normalize_text(name: str, data: bytes) -> bytes:
    if not name.endswith(".txt"):
        return data
    return b"\n".join(line.rstrip() for line in data.splitlines()) + b"\n"


def write_atomically(path: Path, data: bytes) -> None:
    with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(data)
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (url, expected_sha256) in SOURCES.items():
        data = download(url)
        validate(name, data, expected_sha256)
        data = normalize_text(name, data)
        destination = OUTPUT_DIR / name
        write_atomically(destination, data)
        print(f"wrote {destination.relative_to(ROOT)} ({len(data):,} bytes)")


if __name__ == "__main__":
    main()
