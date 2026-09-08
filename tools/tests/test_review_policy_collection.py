"""The live collector, not a receipt or checkout, chooses review authority."""
from __future__ import annotations

import base64
import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools.delivery import review_policy
from tools.delivery.receipts import check_record_receipt
from tools.delivery.records import fields, violations
from tools.tests import test_delivery_receipts as fixtures
from tools.tests.test_delivery_records import candidate

HEAD, BASE, MERGE = fixtures.HEAD, fixtures.BASE, fixtures.MERGE
LANDED = "d" * 40


class PolicyCollectionTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.path = candidate(self.root)
        self.record = fields(self.path)
        fixture = fixtures.ReceiptTests()
        fixture.setUp()
        self.receipt, self.source = fixture.receipt, fixture.source
        self.receipt["delivery_id"] = self.record["Delivery ID"]
        self.pr = self.source["pr"]
        self.policy_blob = {
            "type": "file", "path": review_policy.PATH, "encoding": "base64",
            "sha": self.receipt["review_policy"]["blob_sha"],
            "content": base64.b64encode(json.dumps(self.source["review_policy"]["policy"]).encode()).decode(),
        }
        self.requests = []

    def get(self, endpoint: str, token: str) -> dict:
        prefix = "/repos/StorminRH/lgi-tools"
        if endpoint == f"{prefix}/pulls/123":
            return copy.deepcopy(self.pr)
        if endpoint == f"{prefix}/contents/{self.path.relative_to(self.root)}?ref={HEAD}":
            return {"content": base64.b64encode(self.path.read_bytes()).decode()}
        if endpoint in {f"{prefix}/commits/{MERGE}", f"{prefix}/commits/{LANDED}"}:
            return {"sha": endpoint.rsplit("/", 1)[1], "parents": [{"sha": BASE}, {"sha": HEAD}]}
        if endpoint.endswith("/protection/required_status_checks"):
            return {"checks": self.source["required_checks"]}
        if endpoint == f"{prefix}/deployments/200":
            return {"sha": LANDED, "environment": "staging"}
        raise AssertionError(endpoint)

    def get_all(self, endpoint: str, token: str, key: str | None = None) -> list:
        if endpoint.endswith("/rules/branches/staging"):
            return []
        if "/check-runs?" in endpoint:
            return self.source["checks"] if MERGE in endpoint else []
        if endpoint.endswith("/pulls/123/reviews?per_page=100"):
            return []
        if endpoint.endswith("/issues/123/comments?per_page=100"):
            return copy.deepcopy(self.source["reviews"])
        if endpoint.endswith("/deployments/200/statuses?per_page=100"):
            return [{"id": 300, "state": "success", "created_at": "2026-09-01T00:00:00Z"}]
        raise AssertionError(endpoint)

    def policy_request(self, method: str, endpoint: str, token: str, data: object) -> tuple:
        self.requests.append(endpoint)
        self.assertEqual("GET", method)
        self.assertIsNone(data)
        self.assertEqual(f"/repos/StorminRH/lgi-tools/contents/{review_policy.PATH}?ref={BASE}", endpoint)
        if isinstance(self.policy_blob, Exception):
            raise self.policy_blob
        return self.policy_blob, {}

    def check(self, stage: str = "pre-merge", *, archive: bool = False) -> list[str]:
        self.receipt["stage"] = stage
        if stage != "pre-merge":
            self.pr.update(merged=True, state="closed", merge_commit_sha=LANDED)
            self.receipt["merge_sha"] = LANDED
        if stage in {"promoted", "released"}:
            self.receipt.update(deployment={"id": 200, "sha": LANDED, "environment": "staging", "state": "success"}, deployment_observation={"observed_at": "2026-09-02T00:00:00Z", "success_status_id": 300})
        identity = {
            "baseRefName": "staging", "baseRefOid": self.pr["base"]["sha"],
            "headRefName": "development", "headRefOid": HEAD,
            "merged": self.pr["merged"], "isDraft": False, "mergeable": "MERGEABLE",
            "mergeCommit": {"oid": LANDED} if self.pr["merged"] else None,
            "potentialMergeCommit": {"oid": MERGE, "parents": {"nodes": [{"oid": BASE}, {"oid": HEAD}]}},
        }
        comment = {"id": "fixture-comment", "issue": {"identifier": "LGI-119"}, "body": "```lgi-delivery-receipt\n" + json.dumps(self.receipt) + "\n```"}
        with patch("tools.delivery.receipts.github_api.github_token", return_value="fixture"), patch("tools.delivery.receipts._get", side_effect=self.get), patch("tools.delivery.receipts.github_api.get_all", side_effect=self.get_all), patch("tools.delivery.receipts.github_api.request", side_effect=self.policy_request), patch("tools.delivery.receipts._pull_identity", return_value=identity), patch("tools.delivery.receipts._threads", return_value=False), patch("tools.delivery.receipts.subprocess.run", return_value=SimpleNamespace(stdout="remote.github.url https://github.com/StorminRH/lgi-tools.git\n")):
            return check_record_receipt(self.path, self.root, comment, comment["id"], stage, archive_history=archive)

    def test_live_collection_accepts_operator_and_rejects_same_text_from_spoofer(self) -> None:
        self.assertEqual([], self.check())
        self.assertEqual(1, len(self.requests))
        self.source["reviews"][0]["user"]["id"] = 999
        self.assertTrue(any("unauthorized" in error for error in self.check()))

    def test_local_or_receipt_policy_cannot_grant_a_role(self) -> None:
        policy = copy.deepcopy(self.source["review_policy"]["policy"])
        policy["roles"]["behavior-reviewer"] = [{"id": 999, "type": "User"}]
        local = self.root / review_policy.PATH
        local.parent.mkdir(parents=True)
        local.write_text(json.dumps(policy))
        self.receipt["policy"] = policy
        self.source["reviews"][0]["user"]["id"] = 999
        self.assertTrue(any("unauthorized" in error for error in self.check()))

    def test_merged_and_archived_authority_uses_merge_parent_despite_branch_drift(self) -> None:
        self.pr["base"]["sha"] = "f" * 40
        self.assertEqual([], self.check("merged"))
        self.assertEqual([], self.check("promoted", archive=True))
        self.assertEqual(2, len(self.requests))
        self.source["reviews"][0]["user"]["id"] = 999
        self.assertTrue(any("unauthorized" in error for error in self.check("promoted", archive=True)))

    def test_historical_policy_cannot_be_replaced_by_a_newer_locator(self) -> None:
        self.pr["base"]["sha"] = "f" * 40
        self.receipt["review_policy"]["commit_sha"] = "f" * 40
        self.assertTrue(any("policy locator" in error for error in self.check("promoted", archive=True)))

    def test_missing_or_unreadable_policy_blocks_current_and_archive_delivery(self) -> None:
        for code in (404, 403):
            self.policy_blob = RuntimeError(f"GitHub API {code}: policy unavailable")
            for stage, archive in (("pre-merge", False), ("promoted", True)):
                self.pr.update(merged=False, state="open")
                with self.subTest(code=code, stage=stage), self.assertRaisesRegex(RuntimeError, "policy unavailable"):
                    self.check(stage, archive=archive)

    def test_policy_contents_shape_and_duplicate_fields_fail_closed(self) -> None:
        original = copy.deepcopy(self.policy_blob)
        invalid = [[], dict(original, type="dir"), dict(original, encoding="none"), dict(original, path="another-policy.json"), dict(original, sha="short"), dict(original, content=base64.b64encode(b'{"format": 1, "format": 2}').decode())]
        for blob in invalid:
            self.policy_blob = blob
            with self.subTest(blob=blob), self.assertRaises(ValueError):
                self.check()

    def test_local_record_parsing_stays_offline_without_policy(self) -> None:
        with patch("tools.delivery.github_api.request", side_effect=AssertionError("offline check contacted GitHub")):
            self.assertEqual([], violations(self.path, self.root))
