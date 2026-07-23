#!/usr/bin/env python3
"""Tests for the review-quiescence rule and the head-scoped stability key."""

from __future__ import annotations

import unittest

from poll_pr_gate import quiescence, stable_key


def run(name: str, status: str) -> dict:
    return {"name": name, "status": status}


COMPLETED = [run("Greptile Review", "completed"), run("test", "completed")]


class Quiescence(unittest.TestCase):
    def test_settled_when_runs_complete_and_no_legacy_status(self) -> None:
        names, settled = quiescence(COMPLETED, {"state": "success", "statuses": []})
        self.assertTrue(settled)
        self.assertEqual(names, {"Greptile Review", "test"})

    def test_empty_status_default_pending_still_settles(self) -> None:
        # GitHub returns state "pending" with no statuses when a commit has no
        # legacy statuses at all; there is nothing to wait for, so it settles.
        _, settled = quiescence(COMPLETED, {"state": "pending", "statuses": []})
        self.assertTrue(settled)

    def test_not_settled_while_a_run_is_in_progress(self) -> None:
        runs = [*COMPLETED, run("semgrep", "in_progress")]
        _, settled = quiescence(runs, {"state": "success", "statuses": []})
        self.assertFalse(settled)

    def test_not_settled_while_a_legacy_status_is_pending(self) -> None:
        status = {"state": "pending", "statuses": [{"context": "coderabbit"}]}
        _, settled = quiescence(COMPLETED, status)
        self.assertFalse(settled)

    def test_settled_when_legacy_status_has_finished(self) -> None:
        status = {"state": "success", "statuses": [{"context": "coderabbit"}]}
        names, settled = quiescence(COMPLETED, status)
        self.assertTrue(settled)
        self.assertIn("coderabbit", names)

    def test_not_settled_with_no_runs(self) -> None:
        _, settled = quiescence([], {"state": "success", "statuses": []})
        self.assertFalse(settled)

    def test_reviewer_set_unions_runs_and_statuses(self) -> None:
        status = {"state": "success", "statuses": [{"context": "coderabbit"}]}
        names, _ = quiescence(COMPLETED, status)
        self.assertEqual(names, {"Greptile Review", "test", "coderabbit"})


class StableKey(unittest.TestCase):
    def test_settled_non_empty_set_has_a_key(self) -> None:
        self.assertEqual(stable_key("head1", frozenset({"a"}), True), ("head1", frozenset({"a"})))

    def test_unsettled_has_no_key(self) -> None:
        self.assertIsNone(stable_key("head1", frozenset({"a"}), False))

    def test_empty_set_has_no_key(self) -> None:
        self.assertIsNone(stable_key("head1", frozenset(), True))

    def test_key_changes_with_head_even_if_reviewers_match(self) -> None:
        # A fresh push (new head, same reviewer set) must not reuse the prior
        # head's stability, so its key differs and the wait restarts.
        self.assertNotEqual(
            stable_key("head1", frozenset({"a"}), True),
            stable_key("head2", frozenset({"a"}), True),
        )


if __name__ == "__main__":
    unittest.main()
