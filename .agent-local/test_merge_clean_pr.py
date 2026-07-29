#!/usr/bin/env python3
"""Tests for the merge gate: it must never report ready when a merge is not warranted."""

from __future__ import annotations

import copy
import unittest

import merge_clean_pr
from merge_clean_pr import (
    BASE_REQUIRED_CHECKS,
    CODERABBIT,
    GREPTILE,
    GREPTILE_CHECK,
    REQUIRED_CHECKS,
    coderabbit_reviewed,
    coderabbit_reviewed_head,
    greptile_reviewed,
    live_coderabbit_findings,
    live_inline_findings,
    merge_blockers,
)

HEAD = "6228ebcb3749ee0aac8a027815f21b30df003a03"


def summary_comment(body: str) -> dict:
    return {"user": {"login": GREPTILE}, "id": 1, "updated_at": "2026-07-23T10:00:00Z", "body": body}


def gr_root(comment_id: int = 20, commit: str = HEAD) -> dict:
    """One Greptile inline finding root."""
    return {
        "user": {"login": GREPTILE},
        "id": comment_id,
        "commit_id": commit,
        "in_reply_to_id": None,
        "line": 5,
        "body": "P1 finding",
    }


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


def blockers(resolved: frozenset[int] = frozenset(), **overrides) -> list[str]:
    data = clean_inputs()
    data.update(overrides)
    return merge_blockers(
        data["pr"],
        data["issue_comments"],
        data["inline_comments"],
        data["runs"],
        data["expected_head"],
        resolved,
        data.get("reviews", []),
    )


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
        cs = [
            *clean_inputs()["issue_comments"],
            {"user": {"login": GREPTILE}, "id": 2, "updated_at": "2026-07-23T11:00:00Z", "body": "on it"},
        ]
        self.assertTrue(any("newer than the live summary" in r for r in blockers(issue_comments=cs)))

    def test_unresolved_inline_finding_blocks(self) -> None:
        inline = [gr_root()]
        self.assertTrue(any("inline finding" in r for r in blockers(inline_comments=inline)))

    def test_resolved_inline_finding_does_not_block(self) -> None:
        self.assertEqual(blockers(resolved=frozenset({20}), inline_comments=[gr_root()]), [])

    def test_unresolved_finding_on_an_older_commit_still_blocks(self) -> None:
        # Anchor commit says nothing about whether the finding still stands.
        inline = [gr_root(commit="a1a808f")]
        self.assertTrue(any("unresolved inline finding" in r for r in blockers(inline_comments=inline)))

    def test_resolved_finding_reanchored_to_the_head_does_not_block(self) -> None:
        # The PR #324 regression. GitHub moves `commit_id` to the new head for any
        # comment whose anchor line survives the fix, including one Greptile has
        # already marked addressed and resolved, so the old head filter refused a
        # merge every participating reviewer had signed off.
        self.assertEqual(
            blockers(resolved=frozenset({20}), inline_comments=[gr_root(commit=HEAD)]),
            [],
        )

    def test_greptile_reply_is_not_a_finding(self) -> None:
        reply = gr_root(21) | {"in_reply_to_id": 20}
        self.assertEqual(blockers(inline_comments=[reply]), [])

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
    def test_unresolved_finding_counts(self) -> None:
        self.assertEqual(len(live_inline_findings([gr_root()], frozenset())), 1)

    def test_resolved_finding_is_ignored(self) -> None:
        self.assertEqual(live_inline_findings([gr_root()], frozenset({20})), [])

    def test_anchor_commit_is_irrelevant(self) -> None:
        # Both directions of the bug: an old anchor still counts, a head anchor
        # stops counting once the thread is resolved.
        self.assertEqual(len(live_inline_findings([gr_root(commit="old")], frozenset())), 1)
        self.assertEqual(live_inline_findings([gr_root(commit=HEAD)], frozenset({20})), [])

    def test_reply_is_not_a_finding(self) -> None:
        reply = gr_root(21) | {"in_reply_to_id": 20}
        self.assertEqual(live_inline_findings([reply], frozenset()), [])

    def test_non_greptile_comment_ignored(self) -> None:
        found = live_inline_findings([{"user": {"login": "coderabbitai"}, "id": 20}], frozenset())
        self.assertEqual(found, [])

    def test_ignores_non_dict_items(self) -> None:
        self.assertEqual(live_inline_findings([None, "x"], frozenset()), [])


def cr_root(comment_id: int = 10, commit: str = HEAD) -> dict:
    return {
        "user": {"login": CODERABBIT},
        "id": comment_id,
        "commit_id": commit,
        "in_reply_to_id": None,
        "line": 5,
    }


def coderabbit_only_inputs() -> dict:
    """A PR Greptile never appeared on: no summary comment and no Greptile check."""
    data = clean_inputs()
    data["issue_comments"] = []
    data["runs"] = [
        {"name": name, "status": "completed", "conclusion": "success"}
        for name in BASE_REQUIRED_CHECKS
    ]
    data["reviews"] = [{"user": {"login": CODERABBIT}, "commit_id": HEAD}]
    return data


def coderabbit_only_blockers(resolved: frozenset[int] = frozenset(), **overrides) -> list[str]:
    data = coderabbit_only_inputs()
    data.update(overrides)
    return merge_blockers(
        data["pr"],
        data["issue_comments"],
        data["inline_comments"],
        data["runs"],
        data["expected_head"],
        resolved,
        data["reviews"],
    )


class CodeRabbitParticipation(unittest.TestCase):
    def test_an_inline_comment_counts_as_participation(self) -> None:
        self.assertTrue(coderabbit_reviewed([cr_root()], []))

    def test_a_review_object_counts_as_participation(self) -> None:
        self.assertTrue(coderabbit_reviewed([], [{"user": {"login": CODERABBIT}}]))

    def test_another_author_is_not_participation(self) -> None:
        self.assertFalse(coderabbit_reviewed([gr_root()], [{"user": {"login": "StorminRH"}}]))

    def test_nothing_at_all_is_not_participation(self) -> None:
        self.assertFalse(coderabbit_reviewed([], []))


class GreptileParticipation(unittest.TestCase):
    def test_summary_counts_as_reviewed(self) -> None:
        comments = [summary_comment("Greptile Summary\nConfidence Score: 5/5")]
        self.assertTrue(greptile_reviewed(comments, []))

    def test_check_alone_counts_as_reviewed(self) -> None:
        runs = [{"name": GREPTILE_CHECK, "status": "completed", "conclusion": "success"}]
        self.assertTrue(greptile_reviewed([], runs))

    def test_absent_summary_and_check_is_not_reviewed(self) -> None:
        runs = [{"name": "test", "status": "completed", "conclusion": "success"}]
        self.assertFalse(greptile_reviewed([], runs))


class CodeRabbitAlone(unittest.TestCase):
    def test_coderabbit_alone_is_clean_with_no_findings(self) -> None:
        self.assertEqual(coderabbit_only_blockers(), [])

    def test_unresolved_finding_blocks(self) -> None:
        reasons = coderabbit_only_blockers(inline_comments=[cr_root()])
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_resolved_finding_does_not_block(self) -> None:
        self.assertEqual(coderabbit_only_blockers(frozenset({10}), inline_comments=[cr_root()]), [])

    def test_unresolved_finding_on_an_older_commit_still_blocks(self) -> None:
        # CodeRabbit never re-anchors a finding, so its commit is the one it was
        # found on. Filtering by head would drop every finding after any push.
        reasons = coderabbit_only_blockers(inline_comments=[cr_root(commit="old")])
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_bot_reply_is_not_a_finding(self) -> None:
        reply = cr_root(11) | {"in_reply_to_id": 10}
        self.assertEqual(coderabbit_only_blockers(inline_comments=[reply]), [])

    def test_missing_coderabbit_check_blocks(self) -> None:
        runs = [{"name": "test", "status": "completed", "conclusion": "success"}]
        reasons = coderabbit_only_blockers(runs=runs)
        self.assertTrue(any("missing required checks" in r for r in reasons))

    def test_coderabbit_alone_does_not_require_the_greptile_check(self) -> None:
        self.assertFalse(any("Greptile Review" in r for r in coderabbit_only_blockers()))

    def test_greptile_findings_are_never_waived_by_a_green_coderabbit(self) -> None:
        # Greptile took part, so its unresolved finding blocks even though
        # CodeRabbit is clean. Neither reviewer waives the other.
        data = clean_inputs()
        reasons = merge_blockers(
            data["pr"],
            data["issue_comments"],
            [gr_root()],
            data["runs"],
            data["expected_head"],
            frozenset(),
        )
        self.assertTrue(any("Greptile has 1 unresolved inline finding" in r for r in reasons))

    def test_missing_greptile_summary_still_blocks_when_greptile_checked(self) -> None:
        runs = [
            {"name": name, "status": "completed", "conclusion": "success"}
            for name in REQUIRED_CHECKS
        ]
        reasons = coderabbit_only_blockers(runs=runs)
        self.assertTrue(any("no Greptile summary found" in r for r in reasons))


class CodeRabbitReviewedHead(unittest.TestCase):
    def test_review_on_the_current_head_counts(self) -> None:
        reviews = [{"user": {"login": CODERABBIT}, "commit_id": HEAD}]
        self.assertTrue(coderabbit_reviewed_head(reviews, HEAD))

    def test_review_on_an_older_head_does_not_count(self) -> None:
        reviews = [{"user": {"login": CODERABBIT}, "commit_id": "older"}]
        self.assertFalse(coderabbit_reviewed_head(reviews, HEAD))

    def test_human_review_does_not_count(self) -> None:
        reviews = [{"user": {"login": "StorminRH"}, "commit_id": HEAD}]
        self.assertFalse(coderabbit_reviewed_head(reviews, HEAD))

    def test_rate_limited_head_blocks_the_merge(self) -> None:
        # CodeRabbit's commit status reports success even when it says
        # "Review rate limited", so an unreviewed head must still block.
        reasons = coderabbit_only_blockers(reviews=[{"user": {"login": CODERABBIT}, "commit_id": "older"}])
        self.assertTrue(any("no CodeRabbit review on the current head" in r for r in reasons))

    def test_no_reviews_at_all_blocks_the_merge(self) -> None:
        reasons = coderabbit_only_blockers(reviews=[])
        self.assertTrue(any("no CodeRabbit review on the current head" in r for r in reasons))


class ResolvedThreadRootsRepo(unittest.TestCase):
    """Thread resolution must be read from the repository actually being polled.

    This is the one way the function can fail open: reading another repository's
    resolutions would mark unresolved findings resolved and clear a real blocker.
    """

    def query_variables(self, **kwargs) -> dict:
        seen: dict = {}

        def fake_request(method, path, token, payload):
            seen.update(payload["variables"])
            return {"data": {"repository": {"pullRequest": {"reviewThreads": {
                "nodes": [], "pageInfo": {"hasNextPage": False}}}}}}, {}

        original = merge_clean_pr.request
        merge_clean_pr.request = fake_request
        try:
            merge_clean_pr.resolved_thread_roots(306, "t", **kwargs)
        finally:
            merge_clean_pr.request = original
        return seen

    def test_defaults_to_the_module_constants(self) -> None:
        variables = self.query_variables()
        self.assertEqual(variables["owner"], merge_clean_pr.OWNER)
        self.assertEqual(variables["repo"], merge_clean_pr.REPO)

    def test_an_explicit_repo_overrides_the_constants(self) -> None:
        variables = self.query_variables(repo="other-owner/other-repo")
        self.assertEqual(variables["owner"], "other-owner")
        self.assertEqual(variables["repo"], "other-repo")


class CodeRabbitIncrementalAcknowledgement(unittest.TestCase):
    """CodeRabbit files no new review object for a fix push.

    It is an incremental reviewer: it edits the existing finding in place,
    appending `Addressed in commit <sha>` and resolving the thread. Requiring a
    head-pinned review object therefore makes the gate unsatisfiable for any PR
    that needed a fix round, so its own marker is accepted as equivalent proof —
    while a rate-limited pass, which emits no marker, must still block.
    """

    def cr_comment(self, body: str, commit: str = "older") -> dict:
        return {"user": {"login": CODERABBIT}, "id": 10, "commit_id": commit, "body": body}

    def test_abbreviated_marker_counts_as_head_evidence(self) -> None:
        # The real shape: comment still anchored to the old commit, body appended.
        comment = self.cr_comment(f"finding text\n\n✅ Addressed in commit {HEAD[:7]}")
        self.assertTrue(coderabbit_reviewed_head([], HEAD, [comment]))

    def test_backticked_and_full_length_markers_count(self) -> None:
        self.assertTrue(
            coderabbit_reviewed_head([], HEAD, [self.cr_comment(f"Addressed in commit `{HEAD[:8]}`")])
        )
        self.assertTrue(
            coderabbit_reviewed_head([], HEAD, [self.cr_comment(f"Addressed in commit {HEAD}")])
        )

    def test_marker_naming_another_commit_does_not_count(self) -> None:
        # An acknowledgement of an earlier push is not evidence for this head.
        stale = self.cr_comment("Addressed in commit 0837eb2")
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [stale]))

    def test_rate_limited_pass_still_blocks(self) -> None:
        # The hole this gate exists to close: a green status with no real review.
        limited = self.cr_comment("Review rate limited. Please try again later.")
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [limited]))
        reasons = coderabbit_only_blockers(reviews=[], inline_comments=[limited])
        self.assertTrue(any("no CodeRabbit review on the current head" in r for r in reasons))

    def test_a_human_cannot_supply_the_marker(self) -> None:
        human = {"user": {"login": "StorminRH"}, "id": 11, "body": f"Addressed in commit {HEAD}"}
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [human]))

    def test_marker_only_counts_on_an_inline_finding_root(self) -> None:
        # Closes the prompt-echo channel: a conversational reply carries the same
        # author, so only a finding root may supply the marker.
        reply = self.cr_comment(f"Addressed in commit {HEAD[:7]}") | {"in_reply_to_id": 9}
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [reply]))

    def test_too_short_a_sha_is_rejected(self) -> None:
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [self.cr_comment(f"Addressed in commit {HEAD[:6]}")]))

    def test_acknowledgement_does_not_waive_a_live_finding(self) -> None:
        # Head evidence and "no finding left standing" stay independent gates: the
        # fixed finding is acknowledged and resolved, a second one is neither.
        ack = self.cr_comment(f"Addressed in commit {HEAD[:7]}")
        still_open = cr_root(11, commit="older")
        reasons = coderabbit_only_blockers(
            frozenset({10}), reviews=[], inline_comments=[ack, still_open]
        )
        self.assertFalse(any("no CodeRabbit review" in r for r in reasons))
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_the_reported_hole_stays_closed(self) -> None:
        # The minimal shape of the regression, distinct from the test above: ONE
        # root on an earlier commit, carrying head evidence but never resolved.
        # Head evidence is therefore satisfied while the finding still stands, and
        # before the fix the head filter dropped it and returned no blockers.
        only_root = self.cr_comment(f"finding\n\nAddressed in commit {HEAD[:7]}")
        reasons = coderabbit_only_blockers(reviews=[], inline_comments=[only_root])
        self.assertFalse(any("no CodeRabbit review" in r for r in reasons))
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_a_quoted_marker_is_not_head_evidence(self) -> None:
        # The marker must be its own line. This file and the gate's own source
        # contain the literal phrase, so a review quoting them mid-sentence or in
        # a code block must not mint evidence no pass produced.
        quoted = self.cr_comment(
            f"The check looks for `Addressed in commit {HEAD[:7]}` inside a body, "
            "which is too loose.\n\n```python\nif 'Addressed in commit "
            f"{HEAD[:7]}' in body:\n    pass\n```"
        )
        self.assertFalse(coderabbit_reviewed_head([], HEAD, [quoted]))

    def test_the_real_appended_marker_line_still_counts(self) -> None:
        emoji_line = self.cr_comment(f"finding text\n\n✅ Addressed in commit {HEAD[:7]}")
        self.assertTrue(coderabbit_reviewed_head([], HEAD, [emoji_line]))

    def test_acknowledgement_never_substitutes_for_greptile(self) -> None:
        # Greptile took part, so its own finding must still be answered.
        data = clean_inputs()
        reasons = merge_blockers(
            data["pr"],
            data["issue_comments"],
            [
                gr_root(),
                self.cr_comment(f"Addressed in commit {HEAD[:7]}"),
            ],
            data["runs"],
            data["expected_head"],
            frozenset(),
        )
        self.assertTrue(any("Greptile has 1 unresolved inline finding" in r for r in reasons))


class EveryParticipatingReviewerGates(unittest.TestCase):
    """Presence decides the gate: both, one, or — refusing everything — neither."""

    def cr_review_at_head(self) -> list[dict]:
        return [{"user": {"login": CODERABBIT}, "commit_id": HEAD}]

    def test_both_present_and_clean_merges(self) -> None:
        reasons = blockers(
            frozenset({10}),
            inline_comments=[cr_root()],
            reviews=self.cr_review_at_head(),
        )
        self.assertEqual(reasons, [])

    def test_a_clean_greptile_does_not_waive_a_coderabbit_finding(self) -> None:
        # The direction the old fallback allowed silently: Greptile reviewed, so
        # CodeRabbit's unresolved finding was never even computed.
        reasons = blockers(inline_comments=[cr_root()], reviews=self.cr_review_at_head())
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_a_rate_limited_coderabbit_leaves_greptile_deciding(self) -> None:
        # PR #324's shape. CodeRabbit took part on earlier heads and was rate
        # limited on this one; its findings are all resolved and Greptile read
        # this head, so the merge is not held hostage to a quota.
        reasons = blockers(frozenset({10}), inline_comments=[cr_root(commit="older")], reviews=[])
        self.assertEqual(reasons, [])

    def test_a_rate_limited_coderabbit_still_owes_its_findings(self) -> None:
        reasons = blockers(inline_comments=[cr_root(commit="older")], reviews=[])
        self.assertTrue(any("CodeRabbit has 1 unresolved" in r for r in reasons))

    def test_a_stale_greptile_summary_leaves_coderabbit_deciding(self) -> None:
        # The mirror case: Greptile has not re-run on this head, CodeRabbit has.
        stale = [summary_comment("Greptile Summary\nConfidence Score: 5/5\nReviewed abc1234")]
        reasons = blockers(issue_comments=stale, reviews=self.cr_review_at_head())
        self.assertEqual(reasons, [])

    def test_a_non_five_greptile_score_blocks_even_when_coderabbit_read_the_head(self) -> None:
        # Head evidence is collective; a participating reviewer's verdict is not.
        low = [summary_comment(f"Greptile Summary\nConfidence Score: 3/5\nReviewed {HEAD}")]
        reasons = blockers(issue_comments=low, reviews=self.cr_review_at_head())
        self.assertTrue(any("not 5/5" in r for r in reasons))

    def test_no_reviewer_at_all_blocks(self) -> None:
        runs = [
            {"name": name, "status": "completed", "conclusion": "success"}
            for name in BASE_REQUIRED_CHECKS
        ]
        reasons = blockers(issue_comments=[], runs=runs, reviews=[])
        self.assertTrue(any("no reviewer read the current head" in r for r in reasons))
        self.assertTrue(any("no Greptile review on the current head" in r for r in reasons))
        self.assertTrue(any("no CodeRabbit review on the current head" in r for r in reasons))


class LiveCodeRabbitFindings(unittest.TestCase):
    def test_ignores_non_dict_items(self) -> None:
        self.assertEqual(live_coderabbit_findings([None, "x"], frozenset()), [])

    def test_ignores_other_authors(self) -> None:
        other = cr_root() | {"user": {"login": GREPTILE}}
        self.assertEqual(live_coderabbit_findings([other], frozenset()), [])


if __name__ == "__main__":
    unittest.main()
