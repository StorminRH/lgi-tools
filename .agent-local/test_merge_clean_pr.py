#!/usr/bin/env python3
"""Tests for the merge gate: it must never report ready when a merge is not warranted."""

from __future__ import annotations

import copy
import unittest

from merge_clean_pr import (
    GREPTILE,
    REQUIRED_CHECKS,
    live_inline_findings,
    merge_blockers,
)

HEAD = "6228ebcb3749ee0aac8a027815f21b30df003a03"


def summary_comment(body: str) -> dict:
    return {"user": {"login": GREPTILE}, "id": 1, "updated_at": "2026-07-23T10:00:00Z", "body": body}


def clean_inputs() -> dict:
    """A PR state that should merge: every gate satisfied."""
    return {
        "pr": {
            "head": {"sha": HEAD, "ref": "feature"},
            "state": "open",
            "draft": False,
            "mergeable": True,
            "mergeable_state": "clean",
        },
        "issue_comments": [summary_comment(f"Greptile Summary\nConfidence Score: 5/5\nReviewed {HEAD}")],
        "inline_comments": [],
        "runs": [{"name": name, "status": "completed", "conclusion": "success"} for name in REQUIRED_CHECKS],
        "expected_head": HEAD,
    }


def blockers(**overrides) -> list[str]:
    data = clean_inputs()
    data.update(overrides)
    return merge_blockers(data["pr"], data["issue_comments"], data["inline_comments"], data["runs"], data["expected_head"])


class MergeGate(unittest.TestCase):
    def test_clean_state_has_no_blockers(self) -> None:
        self.assertEqual(blockers(), [])

    def test_head_moved_blocks(self) -> None:
        self.assertTrue(any("head moved" in r for r in blockers(expected_head="deadbeef")))

    def test_closed_pr_blocks(self) -> None:
        pr = clean_inputs()["pr"] | {"state": "closed"}
        self.assertTrue(any("not open" in r for r in blockers(pr=pr)))

    def test_draft_blocks(self) -> None:
        pr = clean_inputs()["pr"] | {"draft": True}
        self.assertTrue(any("draft" in r for r in blockers(pr=pr)))

    def test_unmergeable_blocks(self) -> None:
        pr = clean_inputs()["pr"] | {"mergeable": False}
        self.assertTrue(any("not mergeable" in r for r in blockers(pr=pr)))

    def test_dirty_merge_state_blocks(self) -> None:
        pr = clean_inputs()["pr"] | {"mergeable_state": "dirty"}
        self.assertTrue(any("merge state" in r for r in blockers(pr=pr)))

    def test_missing_summary_blocks(self) -> None:
        self.assertTrue(any("no Greptile summary" in r for r in blockers(issue_comments=[])))

    def test_score_below_five_blocks(self) -> None:
        cs = [summary_comment(f"Greptile Summary\nConfidence Score: 4/5\nReviewed {HEAD}")]
        self.assertTrue(any("not 5/5" in r for r in blockers(issue_comments=cs)))

    def test_summary_not_naming_head_blocks(self) -> None:
        cs = [summary_comment("Greptile Summary\nConfidence Score: 5/5\nReviewed abc1234")]
        self.assertTrue(any("does not name the current head" in r for r in blockers(issue_comments=cs)))

    def test_newer_greptile_comment_blocks(self) -> None:
        cs = clean_inputs()["issue_comments"] + [
            {"user": {"login": GREPTILE}, "id": 2, "updated_at": "2026-07-23T11:00:00Z", "body": "on it"}
        ]
        self.assertTrue(any("newer than the live summary" in r for r in blockers(issue_comments=cs)))

    def test_live_inline_finding_blocks(self) -> None:
        inline = [{"user": {"login": GREPTILE}, "commit_id": HEAD, "line": 5, "body": "P1"}]
        self.assertTrue(any("inline finding" in r for r in blockers(inline_comments=inline)))

    def test_outdated_inline_comment_does_not_block(self) -> None:
        # A resolved finding left on an older commit must not block a clean merge.
        inline = [{"user": {"login": GREPTILE}, "commit_id": "a1a808f", "line": None, "body": "P1"}]
        self.assertEqual(blockers(inline_comments=inline), [])

    def test_missing_required_check_blocks(self) -> None:
        runs = [{"name": "test", "status": "completed", "conclusion": "success"}]
        self.assertTrue(any("missing required checks" in r for r in blockers(runs=runs)))

    def test_failing_check_blocks(self) -> None:
        runs = copy.deepcopy(clean_inputs()["runs"])
        runs[0]["conclusion"] = "failure"
        self.assertTrue(any("non-passing checks" in r for r in blockers(runs=runs)))

    def test_incomplete_check_blocks(self) -> None:
        runs = copy.deepcopy(clean_inputs()["runs"])
        runs[0]["status"] = "in_progress"
        runs[0]["conclusion"] = None
        self.assertTrue(any("non-passing checks" in r for r in blockers(runs=runs)))

    def test_no_runs_blocks(self) -> None:
        self.assertTrue(any("no check runs" in r for r in blockers(runs=[])))


class LiveInlineFindings(unittest.TestCase):
    def test_current_head_finding_counts(self) -> None:
        found = live_inline_findings([{"user": {"login": GREPTILE}, "commit_id": HEAD, "line": 5}], HEAD)
        self.assertEqual(len(found), 1)

    def test_old_commit_finding_is_ignored(self) -> None:
        found = live_inline_findings([{"user": {"login": GREPTILE}, "commit_id": "old", "line": 5}], HEAD)
        self.assertEqual(found, [])

    def test_non_greptile_comment_ignored(self) -> None:
        found = live_inline_findings([{"user": {"login": "coderabbitai"}, "commit_id": HEAD, "line": 5}], HEAD)
        self.assertEqual(found, [])

    def test_ignores_non_dict_items(self) -> None:
        self.assertEqual(live_inline_findings([None, "x"], HEAD), [])


if __name__ == "__main__":
    unittest.main()
