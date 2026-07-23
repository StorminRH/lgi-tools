#!/usr/bin/env python3
"""Behavioral tests for the Codegraph orientation guard's fire-until-oriented
state machine."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from codegraph_guard import (
    guard_bash,
    guard_read,
    is_oriented,
    mark_oriented,
    marker_path,
)


def capture(fn, *args) -> str:
    """Return whatever the guard printed to stdout (the nudge JSON, or '')."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        fn(*args)
    return buffer.getvalue().strip()


class OrientationGuard(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        # An un-touched path in a fresh temp dir stands in for an un-oriented
        # session; touching it marks the session oriented.
        self.marker = Path(self._tmp.name) / "oriented"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_read_nudges_before_orientation(self) -> None:
        out = capture(guard_read, {"file_path": "src/foo.ts"}, self.marker)
        self.assertIn("MANDATORY", out)

    def test_codegraph_command_marks_and_stays_silent(self) -> None:
        out = capture(guard_bash, {"command": "codegraph query esiFetch"}, self.marker)
        self.assertEqual(out, "")
        self.assertTrue(self.marker.is_file())

    def test_read_silent_after_orientation(self) -> None:
        mark_oriented(self.marker)
        out = capture(guard_read, {"file_path": "src/foo.ts"}, self.marker)
        self.assertEqual(out, "")

    def test_search_silent_after_orientation(self) -> None:
        mark_oriented(self.marker)
        out = capture(guard_bash, {"command": "grep -rn foo src/"}, self.marker)
        self.assertEqual(out, "")

    def test_search_nudges_before_orientation(self) -> None:
        out = capture(guard_bash, {"command": "grep -rn foo src/"}, self.marker)
        self.assertIn("MANDATORY", out)

    def test_missing_session_never_suppresses(self) -> None:
        # No session_id -> no marker -> the guard degrades to always-nudge
        # rather than over-suppressing.
        self.assertIsNone(marker_path(""))
        out = capture(guard_read, {"file_path": "src/foo.ts"}, None)
        self.assertIn("MANDATORY", out)

    def test_non_source_read_is_ignored(self) -> None:
        # "photo.png" contains no source-extension substring. (Note: extension
        # matching is by substring so it can catch glob patterns like **/*.ts,
        # which means a path like data.json over-matches .js — a pre-existing
        # quirk this change does not touch.)
        out = capture(guard_read, {"file_path": "photo.png"}, self.marker)
        self.assertEqual(out, "")

    def test_codegraph_own_directory_read_is_ignored(self) -> None:
        out = capture(guard_read, {"file_path": ".codegraph/index.ts"}, self.marker)
        self.assertEqual(out, "")

    def test_marker_path_sanitizes_session_id(self) -> None:
        path = marker_path("a/b c..d")
        self.assertIsNotNone(path)
        self.assertNotIn("/", path.name)
        self.assertNotIn(" ", path.name)

    def test_is_oriented_reflects_marker_state(self) -> None:
        self.assertFalse(is_oriented(self.marker))
        self.assertFalse(is_oriented(None))
        mark_oriented(self.marker)
        self.assertTrue(is_oriented(self.marker))


if __name__ == "__main__":
    unittest.main()
