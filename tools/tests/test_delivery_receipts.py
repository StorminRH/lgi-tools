"""Receipt failures cannot convert missing/stale evidence into delivery success."""
from __future__ import annotations

import copy
import json
import unittest

from tools.delivery.receipts import parse_comment, validate

HEAD, BASE, MERGE = "a" * 40, "b" * 40, "c" * 40


class ReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.record = {"Delivery ID": "LGI-119-one", "PR": "https://github.com/StorminRH/lgi-tools/pull/123", "Branch": "development", "Criteria": "SC-1", "Review roles": "behavior-reviewer", "Receipt issue": "https://linear.app/lgitools/issue/LGI-119"}
        self.receipt = {"format": 2, "delivery_id": "LGI-119-one", "stage": "pre-merge", "subject": {"repository": "StorminRH/lgi-tools", "pr": 123, "base": "staging", "head_sha": HEAD, "base_sha": BASE, "merge_ref_sha": MERGE}, "criteria": {"SC-1": {"status": "PASS", "checks": [100], "observable": "Actual behavior observed"}}, "local": {"status": "PASS", "head_sha": HEAD, "applicability": "changed validator", "evidence": "https://github.com/StorminRH/lgi-tools/pull/123#issuecomment-5"}, "reviews": [{"role": "behavior-reviewer", "kind": "comment", "id": 50, "requested": "configured", "observed": "Not observable", "verdict": "PASS", "disposition": "No accepted findings remain"}]}
        self.source = {"pr": {"number": 123, "html_url": self.record["PR"], "head": {"sha": HEAD, "ref": "development"}, "base": {"sha": BASE, "ref": "staging", "repo": {"full_name": "StorminRH/lgi-tools"}}, "state": "open", "merged": False, "draft": False, "mergeable": True}, "merge_ref_sha": MERGE, "required_checks": [{"context": "verify", "app_id": 1}], "checks": [{"id": 100, "name": "verify", "head_sha": MERGE, "app": {"id": 1}, "status": "completed", "conclusion": "success"}], "reviews": [{"id": 50, "kind": "comment", "body": f"behavior-reviewer {HEAD} PASS; No accepted findings remain"}], "unresolved_threads": False}

    def errors(self, stage: str = "pre-merge") -> list[str]:
        return validate(self.receipt, self.record, self.source, stage)

    def test_current_subject_passes(self) -> None:
        self.assertEqual([], self.errors())

    def test_subject_mismatches_fail(self) -> None:
        original = copy.deepcopy(self.receipt)
        for key, value in (("repository", "another/repo"), ("pr", 124), ("base", "main"), ("head_sha", "d" * 40), ("base_sha", "d" * 40), ("merge_ref_sha", "d" * 40)):
            with self.subTest(key=key):
                self.receipt = copy.deepcopy(original)
                self.receipt["subject"][key] = value
                self.assertTrue(self.errors())

    def test_missing_review_check_rule_and_unresolved_thread_fail(self) -> None:
        for key, value in (("reviews", []), ("checks", []), ("required_checks", []), ("unresolved_threads", True)):
            with self.subTest(key=key):
                original = self.source[key]
                self.source[key] = value
                self.assertTrue(self.errors())
                self.source[key] = original

    def test_stale_failed_check_and_new_failed_rerun_block(self) -> None:
        self.source["checks"][0]["head_sha"] = "d" * 40
        self.assertTrue(self.errors())
        self.source["checks"][0]["head_sha"] = MERGE
        self.source["checks"].append(dict(self.source["checks"][0], id=101, conclusion="failure"))
        self.assertTrue(self.errors())

    def test_source_head_success_does_not_prove_current_base_was_tested(self) -> None:
        self.source["checks"][0]["head_sha"] = HEAD
        self.assertTrue(any("required check" in error for error in self.errors()))

    def test_missing_criteria_or_blocked_local_cannot_pass(self) -> None:
        self.receipt["criteria"] = {}
        self.assertTrue(self.errors())
        self.receipt["local"]["status"] = "BLOCKED"
        self.assertTrue(any("local" in error for error in self.errors()))

    def test_wrong_linear_comment_or_issue_rejected(self) -> None:
        comment = {"id": "comment-id", "issue": {"identifier": "LGI-119"}, "body": "```lgi-delivery-receipt\n" + json.dumps(self.receipt) + "\n```"}
        self.assertEqual(self.receipt, parse_comment(comment, "comment-id", self.record))
        for key, value in (("id", "another-comment"), ("issue", {"identifier": "LGI-113"})):
            wrong = dict(comment, **{key: value})
            with self.assertRaises(ValueError):
                parse_comment(wrong, "comment-id", self.record)

    def test_merged_with_failed_deploy_is_not_promoted(self) -> None:
        self.receipt.update(stage="promoted", merge_sha="d" * 40, deployment={"id": 200, "sha": "d" * 40, "environment": "staging", "state": "success"})
        self.source["pr"].update(merged=True, merge_commit_sha="d" * 40)
        self.source.update(merge={"sha": "d" * 40, "parents": [{"sha": BASE}]}, merge_ref_valid=True, deployment=dict(self.receipt["deployment"], state="failure"))
        self.assertTrue(any("deployment" in error for error in self.errors("promoted")))
        self.source["deployment"]["state"] = "success"
        self.assertEqual([], self.errors("promoted"))


class GitHubCollectionTests(unittest.TestCase):
    def test_frozen_candidate_bytes_are_checked_against_live_github(self) -> None:
        import base64
        from pathlib import Path
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import patch
        from tools.delivery.receipts import collect_github
        from tools.delivery.records import fields
        from tools.tests.test_delivery_records import candidate

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = candidate(root)
            record = fields(path)
            pr = {"head": {"sha": HEAD, "ref": "development"}, "base": {"sha": BASE, "ref": "staging"}, "merged": False}

            def get(endpoint: str, token: str) -> dict:
                if "/pulls/" in endpoint:
                    return pr
                if "/contents/" in endpoint:
                    return {"content": base64.b64encode(b"different committed record").decode()}
                raise AssertionError(endpoint)

            with patch("tools.delivery.receipts.github_api.github_token", return_value="fixture"), patch("tools.delivery.receipts._get", side_effect=get), patch("tools.delivery.receipts.subprocess.run", return_value=SimpleNamespace(stdout="remote.github.url https://github.com/StorminRH/lgi-tools.git\n")):
                with self.assertRaisesRegex(ValueError, "differs from GitHub frozen head"):
                    collect_github(record, {"subject": {"merge_ref_sha": MERGE}}, path, root, "pre-merge")

    def test_archive_history_requires_prior_final_observation_before_network(self) -> None:
        from pathlib import Path
        from unittest.mock import patch
        from tools.delivery.receipts import collect_github

        with patch("tools.delivery.receipts.github_api.github_token") as authenticate:
            for stage in ("pre-merge", "merged", "promoted", "released"):
                with self.subTest(stage=stage), self.assertRaises(ValueError):
                    collect_github({}, {}, Path("record.md"), Path.cwd(), stage, archive_history=True)
            authenticate.assert_not_called()
