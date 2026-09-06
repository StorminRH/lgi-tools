"""Read lifecycle markers consistently from filesystem text and git blobs."""

from __future__ import annotations

import re


def marker(text: str, label: str) -> str | None:
    match = re.search(
        rf"\*\*{re.escape(label)}:\*\*[ \t]+([^\r\n]+?)[ \t]*$",
        text,
        re.I | re.M,
    )
    return match.group(1).strip().strip("`") if match else None


def status_is(text: str, label: str, expected: str) -> bool:
    value = marker(text, f"{label} status")
    return value is not None and value.casefold() == expected.casefold()


def execution_complete(text: str) -> bool:
    return status_is(text, "Execution", "Complete")
