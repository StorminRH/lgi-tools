"""Check whether completed session plans have reached staging."""

from __future__ import annotations

from pathlib import Path, PurePosixPath
from collections.abc import Callable
import re
import subprocess
import tempfile
from typing import Literal


ArchiveDeliveryStatus = Literal["delivered", "pending", "unknown"]
_COMPLETE = re.compile(
    r"^\*\*Execution status:\*\*[ \t]+`?Complete`?[ \t\r]*$", re.MULTILINE | re.IGNORECASE
)


def _git(root: Path, *args: str) -> bytes:
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, check=True
    ).stdout


def _blobs(root: Path, commit: str, version: str) -> dict[str, str]:
    entries = _git(
        root, "ls-tree", "-r", "-z", commit, "--",
        f"docs/session-plans/{version}/",
        f"docs/session-as-built/{version}/",
        f"docs/session-contracts/{version}/",
        "docs/workflows/schema/session-as-built.md",
    )
    blobs: dict[str, str] = {}
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        metadata, path = entry.split(b"\t", 1)
        _, kind, oid = metadata.split()
        if kind == b"blob":
            blobs[path.decode("utf-8")] = oid.decode("ascii")
    return blobs


def _valid_record(
    root: Path,
    destination: dict[str, str],
    source: dict[str, str],
    plan: PurePosixPath,
    version: str,
    validate_record: Callable[[Path, Path, Path, Path], list[str]],
) -> bool:
    record = PurePosixPath("docs/session-as-built") / version / plan.name
    contract = PurePosixPath("docs/session-contracts") / version / plan.name
    schema = PurePosixPath("docs/workflows/schema/session-as-built.md")
    paths = (record, contract, plan, schema)
    if any(str(path) not in destination for path in paths):
        return False
    if destination[str(contract)] != source.get(str(contract)):
        return False
    with tempfile.TemporaryDirectory() as directory:
        snapshot_root = Path(directory)
        for path in paths:
            target = snapshot_root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(_git(root, "cat-file", "blob", destination[str(path)]))
        try:
            return not validate_record(
                snapshot_root / record,
                snapshot_root / contract,
                snapshot_root / plan,
                snapshot_root,
            )
        except (UnicodeError, ValueError):
            return False


def archive_delivery_status(
    root: Path,
    version: str,
    *,
    validate_record: Callable[[Path, Path, Path, Path], list[str]],
) -> ArchiveDeliveryStatus:
    """Compare committed plans by content, requiring each final record on staging."""
    try:
        development, staging = (
            _git(root, "rev-parse", "--verify", f"refs/remotes/origin/{branch}^{{commit}}")
            .decode("ascii").strip()
            for branch in ("development", "staging")
        )
        source = _blobs(root, development, version)
        destination = _blobs(root, staging, version)
        plan_directory = PurePosixPath("docs/session-plans") / version
        for local_plan in (root / plan_directory).glob("*.md"):
            if local_plan.name == "INDEX.md":
                continue
            contents = local_plan.read_bytes()
            if not _COMPLETE.search(contents.decode("utf-8")):
                continue
            oid = source.get(local_plan.relative_to(root).as_posix())
            if oid is None or _git(root, "cat-file", "blob", oid) != contents:
                return "unknown"
        for path, oid in source.items():
            plan = PurePosixPath(path)
            if plan.parent != plan_directory or plan.suffix != ".md" or plan.name == "INDEX.md":
                continue
            contents = _git(root, "cat-file", "blob", oid).decode("utf-8")
            if not _COMPLETE.search(contents):
                continue
            if destination.get(path) != oid:
                return "pending"
            if not _valid_record(root, destination, source, plan, version, validate_record):
                return "pending"
        return "delivered"
    except (OSError, subprocess.CalledProcessError, UnicodeError, ValueError):
        return "unknown"
