#!/usr/bin/env python3
"""Behavioral tests for the Codegraph guard's fire-once-per-session reminder."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from codegraph_guard import (
    claim_reminder,
    guard_bash,
    guard_read,
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
        # A path that does not yet exist stands in for a session that has not
        # been reminded; the guard claims it by creating the file.
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
        self.assertIn("MANDATORY", capture(guard_read, {"file_path": "src/a.ts"}, self.marker))
        self.assertEqual(capture(guard_read, {"file_path": "src/b.ts"}, self.marker), "")

    def test_one_reminder_shared_across_search_and_read(self) -> None:
        capture(guard_bash, {"command": "grep -rn foo src/"}, self.marker)
        self.assertEqual(capture(guard_read, {"file_path": "src/foo.ts"}, self.marker), "")

    def test_codegraph_command_neither_reminds_nor_marks(self) -> None:
        out = capture(guard_bash, {"command": "codegraph query esiFetch"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())

    def test_missing_session_always_reminds(self) -> None:
        # No session_id -> no marker -> remind every time rather than go silent.
        self.assertIsNone(marker_path(""))
        self.assertIn("MANDATORY", capture(guard_read, {"file_path": "src/foo.ts"}, None))
        self.assertIn("MANDATORY", capture(guard_read, {"file_path": "src/foo.ts"}, None))

    def test_non_source_read_is_ignored(self) -> None:
        out = capture(guard_read, {"file_path": "photo.png"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())

    def test_codegraph_own_directory_read_is_ignored(self) -> None:
        out = capture(guard_read, {"file_path": ".codegraph/index.ts"}, self.marker)
        self.assertEqual(out, "")
        self.assertFalse(self.marker.is_file())


class MarkerPath(unittest.TestCase):
    def test_empty_session_has_no_marker(self) -> None:
        self.assertIsNone(marker_path(""))

    def test_distinct_sessions_get_distinct_markers(self) -> None:
        # Hashing, not character stripping: lossy stripping made "a/b" and "ab"
        # collide, so one session could suppress another's reminder.
        self.assertNotEqual(marker_path("a/b"), marker_path("ab"))
        self.assertIsNotNone(marker_path("!!!"))

    def test_marker_name_is_filesystem_safe(self) -> None:
        name = marker_path("a/b c").name
        self.assertNotIn("/", name)
        self.assertNotIn(" ", name)


class ClaimReminder(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.marker = Path(self._tmp.name) / "reminded"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_claim_is_won_once_then_lost(self) -> None:
        self.assertTrue(claim_reminder(self.marker))
        self.assertFalse(claim_reminder(self.marker))

    def test_no_marker_always_claims(self) -> None:
        self.assertTrue(claim_reminder(None))
        self.assertTrue(claim_reminder(None))


if __name__ == "__main__":
    unittest.main()
