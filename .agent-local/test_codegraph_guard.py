#!/usr/bin/env python3
"""Behavioral tests for the Codegraph guard's fire-once-per-session reminder."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from codegraph_guard import (
    already_reminded,
    guard_bash,
    guard_read,
    mark_reminded,
    marker_path,
)


def capture(fn, *args) -> str:
    """Return whatever the guard printed to stdout (the reminder JSON, or '')."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        fn(*args)
    return buffer.getvalue().strip()


class FireOnceReminder(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        # A fresh temp path stands in for a session that has not been reminded;
        # touching it marks the reminder as shown.
        self.marker = Path(self._tmp.name) / "reminded"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_read_reminds_first_time(self) -> None:
        out = capture(guard_read, {"file_path": "src/foo.ts"}, self.marker)
        self.assertIn("MANDATORY", out)
        self.assertTrue(self.marker.is_file())

    def test_search_reminds_first_time(self) -> None:
        out = capture(guard_bash, {"command": "grep -rn foo src/"}, self.marker)
        self.assertIn("MANDATORY", out)
        self.assertTrue(self.marker.is_file())

    def test_reminder_fires_only_once(self) -> None:
        first = capture(guard_read, {"file_path": "src/a.ts"}, self.marker)
        self.assertIn("MANDATORY", first)
        second = capture(guard_read, {"file_path": "src/b.ts"}, self.marker)
        self.assertEqual(second, "")

    def test_one_reminder_shared_across_search_and_read(self) -> None:
        capture(guard_bash, {"command": "grep -rn foo src/"}, self.marker)
        out = capture(guard_read, {"file_path": "src/foo.ts"}, self.marker)
        self.assertEqual(out, "")

    def test_silent_after_reminder(self) -> None:
        mark_reminded(self.marker)
        self.assertEqual(capture(guard_read, {"file_path": "src/foo.ts"}, self.marker), "")
        self.assertEqual(capture(guard_bash, {"command": "grep foo"}, self.marker), "")

    def test_codegraph_command_neither_reminds_nor_marks(self) -> None:
        # Running codegraph is not a search or read, so it does nothing — the
        # guard never tries to infer that the graph was consulted.
        out = capture(guard_bash, {"command": "codegraph query esiFetch"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())

    def test_missing_session_always_reminds(self) -> None:
        # No session_id -> no marker -> the guard reminds every time rather than
        # going silent.
        self.assertIsNone(marker_path(""))
        out = capture(guard_read, {"file_path": "src/foo.ts"}, None)
        self.assertIn("MANDATORY", out)

    def test_non_source_read_is_ignored(self) -> None:
        # "photo.png" contains no source-extension substring, so it is not a
        # source read and must neither remind nor mark.
        out = capture(guard_read, {"file_path": "photo.png"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())

    def test_codegraph_own_directory_read_is_ignored(self) -> None:
        out = capture(guard_read, {"file_path": ".codegraph/index.ts"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())

    def test_marker_path_sanitizes_session_id(self) -> None:
        path = marker_path("a/b c..d")
        self.assertIsNotNone(path)
        self.assertNotIn("/", path.name)
        self.assertNotIn(" ", path.name)

    def test_already_reminded_reflects_marker_state(self) -> None:
        self.assertFalse(already_reminded(self.marker))
        self.assertFalse(already_reminded(None))
        mark_reminded(self.marker)
        self.assertTrue(already_reminded(self.marker))


if __name__ == "__main__":
    unittest.main()
