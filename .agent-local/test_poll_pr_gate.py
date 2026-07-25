#!/usr/bin/env python3
"""Tests for the review-quiescence rule and the head-scoped stability key."""

from __future__ import annotations

import unittest

from poll_pr_gate import (
    CODERABBIT_CHECK,
    coderabbit_rate_limited,
    quiescence,
    review_key,
    stable_key,
)


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


class ReviewKey(unittest.TestCase):
    REVIEWERS = frozenset({"test", "CodeRabbit"})

    def test_no_blockers_still_yields_a_key(self) -> None:
        # The difference from stable_key: an empty blocker set is the success
        # case here, so it must stabilize rather than read as missing data.
        self.assertIsNotNone(review_key("head1", self.REVIEWERS, [], True))

    def test_unsettled_has_no_key(self) -> None:
        self.assertIsNone(review_key("head1", self.REVIEWERS, [], False))

    def test_empty_reviewer_set_has_no_key(self) -> None:
        # No reviewer has registered yet, so "nothing blocks" is not yet true.
        self.assertIsNone(review_key("head1", frozenset(), [], True))

    def test_key_changes_when_a_blocker_clears(self) -> None:
        # A resolved finding must restart the wait rather than reuse the prior
        # poll's stability, so the clean state is confirmed for a full interval.
        self.assertNotEqual(
            review_key("head1", self.REVIEWERS, ["CodeRabbit has 1 unresolved"], True),
            review_key("head1", self.REVIEWERS, [], True),
        )

    def test_key_changes_with_head(self) -> None:
        self.assertNotEqual(
            review_key("head1", self.REVIEWERS, [], True),
            review_key("head2", self.REVIEWERS, [], True),
        )

    def test_key_changes_when_a_late_reviewer_registers(self) -> None:
        # The late-bot protection inherited from stable_key: a newly appearing
        # reviewer resets the wait even though the blocker list is unchanged.
        self.assertNotEqual(
            review_key("head1", frozenset({"test"}), [], True),
            review_key("head1", self.REVIEWERS, [], True),
        )

    def test_blocker_order_does_not_change_the_key(self) -> None:
        # Blockers are a set for stability purposes; reordering is not a change.
        self.assertEqual(
            review_key("head1", self.REVIEWERS, ["a", "b"], True),
            review_key("head1", self.REVIEWERS, ["b", "a"], True),
        )


class CodeRabbitRateLimited(unittest.TestCase):
    """CodeRabbit reports success even when it declined, so only the description tells."""

    def status(self, description: str, context: str | None = None) -> dict:
        # Derived from the production constant so renaming it cannot turn the
        # positive case green-by-accident and the negative case vacuous.
        resolved = CODERABBIT_CHECK if context is None else context
        return {"state": "success", "statuses": [{"context": resolved, "description": description}]}

    def test_rate_limited_description_is_detected(self) -> None:
        self.assertTrue(coderabbit_rate_limited(self.status("Review rate limited")))

    def test_detection_is_case_insensitive(self) -> None:
        self.assertTrue(coderabbit_rate_limited(self.status("REVIEW RATE LIMITED")))

    def test_a_completed_review_is_not_rate_limited(self) -> None:
        self.assertFalse(coderabbit_rate_limited(self.status("Review completed")))

    def test_another_context_saying_rate_limited_is_ignored(self) -> None:
        # Only CodeRabbit's own status speaks for CodeRabbit.
        self.assertFalse(coderabbit_rate_limited(self.status("Review rate limited", "other-bot")))

    def test_missing_statuses_is_not_rate_limited(self) -> None:
        self.assertFalse(coderabbit_rate_limited({"state": "pending", "statuses": []}))
        self.assertFalse(coderabbit_rate_limited({}))


if __name__ == "__main__":
    unittest.main()
