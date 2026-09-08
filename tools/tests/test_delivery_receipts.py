"""Receipt failures cannot convert missing/stale evidence into delivery success."""
from __future__ import annotations

import copy
import json
import unittest

from tools.delivery.receipts import parse_comment, validate
from tools.delivery.review_policy import PATH

HEAD, BASE, MERGE = "a" * 40, "b" * 40, "c" * 40


class ReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.record = {"Delivery ID": "LGI-119-one", "PR": "https://github.com/StorminRH/lgi-tools/pull/123", "Branch": "development", "Criteria": "SC-1", "Review roles": "behavior-reviewer", "Receipt issue": "https://linear.app/lgitools/issue/LGI-119"}
        self.receipt = {"format": 2, "delivery_id": "LGI-119-one", "stage": "pre-merge", "subject": {"repository": "StorminRH/lgi-tools", "pr": 123, "base": "staging", "head_sha": HEAD, "base_sha": BASE, "merge_ref_sha": MERGE}, "criteria": {"SC-1": {"status": "PASS", "checks": [100], "observable": "Actual behavior observed"}}, "local": {"status": "PASS", "head_sha": HEAD, "applicability": "changed validator", "evidence": "https://github.com/StorminRH/lgi-tools/pull/123#issuecomment-5"}, "reviews": [{"role": "behavior-reviewer", "kind": "comment", "id": 50, "requested": "configured", "observed": "Not observable", "verdict": "PASS", "disposition": "No accepted findings remain"}]}
        self.source = {"pr": {"number": 123, "html_url": self.record["PR"], "head": {"sha": HEAD, "ref": "development"}, "base": {"sha": BASE, "ref": "staging", "repo": {"full_name": "StorminRH/lgi-tools"}}, "state": "open", "merged": False, "draft": False, "mergeable": True}, "merge_ref_sha": MERGE, "required_checks": [{"context": "verify", "app_id": 1}], "checks": [{"id": 100, "name": "verify", "head_sha": MERGE, "app": {"id": 1}, "status": "completed", "conclusion": "success"}], "reviews": [{"id": 50, "kind": "comment", "body": f"behavior-reviewer {HEAD} PASS; No accepted findings remain"}], "unresolved_threads": False}
        self.source["pr"]["base"]["repo"]["id"] = 1234
        self.receipt["review_policy"] = {"path": PATH, "commit_sha": BASE, "blob_sha": "e" * 40}
        self.source["review_policy"] = dict(self.receipt["review_policy"], policy={"format": 1, "repository_id": 1234, "branches": {"staging": ["behavior-reviewer"]}, "roles": {"behavior-reviewer": [{"id": 101, "type": "User"}], "greptile": [{"id": 202, "type": "Bot"}]}})
        self.source["reviews"][0].update(user={"id": 101, "type": "User", "login": "operator"})
        self.source["reviews"][0]["body"] += "\nrequested=configured\nobserved=Not observable"

    def errors(self, stage: str = "pre-merge") -> list[str]:
        return validate(self.receipt, self.record, self.source, stage)

    def test_current_subject_passes(self) -> None:
        self.assertEqual([], self.errors())

    def test_spoofed_commenter_cannot_authorize_itself_with_receipt_claims(self) -> None:
        self.source["reviews"][0]["user"]["id"] = 999
        self.source["reviews"][0]["author_association"] = "OWNER"
        self.receipt["reviews"][0]["author_id"] = 101
        self.receipt["authorized_authors"] = [999]
        self.assertTrue(any("unauthorized" in error for error in self.errors()))

    def test_missing_or_wrong_author_identity_fails(self) -> None:
        for author in (None, {}, {"login": "operator", "type": "User"}, {"id": "101", "type": "User"}, {"id": True, "type": "User"}, {"id": 101}, {"id": 101, "type": "Bot"}):
            with self.subTest(author=author):
                self.source["reviews"][0]["user"] = author
                self.assertTrue(any("unauthorized" in error for error in self.errors()))

    def test_operator_login_rename_preserves_stable_authority(self) -> None:
        self.source["reviews"][0]["user"]["login"] = "renamed-operator"
        self.assertEqual([], self.errors())

    def test_operator_preserves_honest_requested_pin_and_unobservable_runtime(self) -> None:
        self.receipt["reviews"][0]["requested"] = "gpt-5.6-sol / high"
        self.source["reviews"][0]["body"] = self.source["reviews"][0]["body"].replace("requested=configured", "requested=gpt-5.6-sol / high")
        self.assertEqual([], self.errors())

    def test_operator_attestation_accepts_crlf_without_relaxing_value_match(self) -> None:
        self.source["reviews"][0]["body"] = self.source["reviews"][0]["body"].replace("\n", "\r\n")
        self.assertEqual([], self.errors())
        self.receipt["reviews"][0]["observed"] = "unsubstantiated-model-pin"
        self.assertTrue(any("observed runtime attestation" in error for error in self.errors()))

    def test_arbitrary_branch_cannot_install_its_own_delivery_authority(self) -> None:
        self.source["pr"]["base"]["ref"] = "attacker-branch"
        self.receipt["subject"]["base"] = "attacker-branch"
        self.source["review_policy"]["policy"]["branches"] = {"attacker-branch": ["behavior-reviewer"]}
        self.assertTrue(any("supported delivery destination" in error for error in self.errors()))

    def test_real_bot_can_satisfy_only_its_assigned_role(self) -> None:
        self.record["Review roles"] += ", greptile"
        bot_receipt = dict(self.receipt["reviews"][0], role="greptile", id=51, kind="review")
        bot_evidence = dict(self.source["reviews"][0], id=51, kind="review", commit_id=HEAD, state="COMMENTED", user={"id": 202, "type": "Bot"})
        bot_evidence["body"] = bot_evidence["body"].replace("behavior-reviewer", "greptile")
        self.receipt["reviews"].append(bot_receipt)
        self.source["reviews"].append(bot_evidence)
        self.assertEqual([], self.errors())
        self.source["reviews"][0]["user"] = bot_evidence["user"]
        self.assertTrue(any("unauthorized for role behavior-reviewer" in error for error in self.errors()))

    def test_operator_cannot_impersonate_bot_role(self) -> None:
        self.record["Review roles"] += ", greptile"
        self.receipt["reviews"].append(dict(self.receipt["reviews"][0], role="greptile", id=51))
        evidence = dict(self.source["reviews"][0], id=51)
        evidence["body"] = evidence["body"].replace("behavior-reviewer", "greptile")
        self.source["reviews"].append(evidence)
        self.assertTrue(any("unauthorized for role greptile" in error for error in self.errors()))

    def test_requested_and_observed_attestations_must_match_author_text(self) -> None:
        for field in ("requested", "observed"):
            original = self.receipt["reviews"][0][field]
            self.receipt["reviews"][0][field] = "unsubstantiated-model-pin"
            self.assertTrue(any(f"{field} runtime attestation" in error for error in self.errors()))
            self.receipt["reviews"][0][field] = original
        self.source["reviews"][0]["body"] += "\nobserved=different-model"
        self.assertTrue(any("observed runtime attestation" in error for error in self.errors()))

    def test_record_and_receipt_agreement_cannot_omit_policy_required_role(self) -> None:
        self.source["review_policy"]["policy"]["branches"]["staging"].append("greptile")
        self.assertTrue(any("omits roles required" in error for error in self.errors()))

    def test_unknown_role_fails_even_when_its_author_and_body_match(self) -> None:
        self.record["Review roles"] += ", invented-role"
        self.receipt["reviews"].append(dict(self.receipt["reviews"][0], role="invented-role", id=51))
        evidence = dict(self.source["reviews"][0], id=51)
        evidence["body"] = evidence["body"].replace("behavior-reviewer", "invented-role")
        self.source["reviews"].append(evidence)
        self.assertTrue(any("role absent" in error for error in self.errors()))

    def test_missing_and_stale_policy_cannot_pass(self) -> None:
        original = copy.deepcopy(self.source["review_policy"])
        for observation in (None, {}, dict(original, commit_sha=HEAD)):
            with self.subTest(observation=observation):
                self.source["review_policy"] = observation
                self.assertTrue(any("review policy" in error for error in self.errors()))
        self.source["review_policy"] = original
        locator = self.receipt["review_policy"]
        for supplied in (None, {}, dict(locator, commit_sha=HEAD), dict(locator, blob_sha="f" * 40), dict(locator, path="attacker.json"), dict(locator, authorized_authors=[999])):
            with self.subTest(supplied=supplied):
                self.receipt["review_policy"] = supplied
                self.assertTrue(any("policy locator" in error for error in self.errors()))

    def test_repository_branch_and_policy_schema_are_authoritative(self) -> None:
        original = copy.deepcopy(self.source["review_policy"]["policy"])
        for change in ({"repository_id": 999}, {"repository_id": True}, {"format": True}, {"format": 2}, {"branches": {"main": ["behavior-reviewer"]}}, {"branches": {"staging": []}}, {"branches": {"staging": ["invented-role"]}}, {"roles": {}}, {"roles": {"behavior-reviewer": [{"id": 101}]}}, {"roles": {"behavior-reviewer": [{"id": True, "type": "User"}]}}, {"roles": {"behavior-reviewer": [{"id": 101, "type": "User"}] * 2}}):
            with self.subTest(change=change):
                self.source["review_policy"]["policy"] = dict(original, **change)
                self.assertTrue(any("review policy" in error for error in self.errors()))

    def test_authorized_review_still_requires_current_successful_review_state(self) -> None:
        self.receipt["reviews"][0]["kind"] = "review"
        evidence = self.source["reviews"][0]
        evidence.update(kind="review", commit_id=HEAD, state="APPROVED")
        self.assertEqual([], self.errors())
        for change in ({"commit_id": BASE}, {"state": "DISMISSED"}, {"state": "CHANGES_REQUESTED"}):
            evidence.update(commit_id=HEAD, state="APPROVED")
            evidence.update(change)
            self.assertTrue(any("GitHub review" in error for error in self.errors()))

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
