"""Candidate records preserve historical validation and partial outcome identity."""
from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest

from tools.delivery.records import collection_violations, violations
from tools.lifecycle.resolve_development_state import as_built_schema_violations
from tools.tests.test_verify_archive import ArchiveFixture


def candidate(root: Path, name: str = "9.9.1.1", scope: str = "session") -> Path:
    contract = root / f"docs/session-contracts/9.9/{name}.md"
    plan = root / f"docs/session-plans/9.9/{name}.md"
    for target, text in ((contract, "# Contract\n"), (plan, "# Plan\n- **SC-1 — Correct outcome**\n")):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    data = {
        "Record format": "2", "Record status": "Candidate", "Recorded": "2026-09-08",
        "Scope": scope, "Delivery ID": name, "Receipt issue": "https://linear.app/lgitools/issue/LGI-119",
        "Contract": contract.relative_to(root).as_posix(), "Contract digest": "sha256:" + hashlib.sha256(contract.read_bytes()).hexdigest(),
        "Plan": plan.relative_to(root).as_posix(), "Plan digest": "sha256:" + hashlib.sha256(plan.read_bytes()).hexdigest(),
        "Criteria": "SC-1", "Branch": "development", "PR": "https://github.com/StorminRH/lgi-tools/pull/123",
        "Review roles": "behavior-reviewer", "Prior deliveries": "None.", "Record standard": "docs/workflows/schema/session-as-built-v2.md",
    }
    if scope != "session":
        for key in ("Contract", "Plan", "Contract digest", "Plan digest", "Criteria"):
            data[key] = "None."
    if scope == "partial":
        data["Partial scope"] = "9.9.1.1: OW1, OW2"
    record = root / f"docs/session-as-built/9.9/{name}.md"
    record.parent.mkdir(parents=True, exist_ok=True)
    record.write_text(f"# Session {name} As-Built — Fixture\n\n" + "\n".join(f"**{key}:** {value}" for key, value in data.items()) + f"\n\n## Delivered outcome\n\n- [{name}-outcome] Changed: A player sees the intended result.\n")
    return record


class CandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.record = candidate(self.root)

    def test_candidate_is_valid_without_final_proof_or_schema_snapshot(self) -> None:
        self.assertEqual([], violations(self.record, self.root))
        self.assertEqual([], as_built_schema_violations(self.record, self.root / "docs/session-contracts/9.9/9.9.1.1.md", self.root / "docs/session-plans/9.9/9.9.1.1.md", self.root, False))

    def test_unknown_format_stale_digest_missing_criteria_and_locator_fail(self) -> None:
        original = self.record.read_text()
        for before, after, message in (("Record format:** 2", "Record format:** 3", "Record format"), ("Contract digest:** sha256:", "Contract digest:** sha256:a", "digest"), ("Criteria:** SC-1", "Criteria:** SC-2", "Criteria"), ("https://linear.app/lgitools/issue/LGI-119", "https://example.test/pass", "Receipt issue")):
            with self.subTest(message=message):
                self.record.write_text(original.replace(before, after))
                self.assertTrue(any(message in error for error in violations(self.record, self.root)))

    def test_ordinary_and_partial_scope_have_no_invented_session_proof(self) -> None:
        for scope in ("ordinary", "partial"):
            self.assertEqual([], violations(candidate(self.root, scope, scope), self.root))

    def test_prior_partial_reference_is_not_duplicate_outcome(self) -> None:
        partial = candidate(self.root, "earlier", "partial")
        self.record.write_text(self.record.read_text().replace("Prior deliveries:** None.", "Prior deliveries:** earlier"))
        self.assertEqual([], collection_violations([partial, self.record]))
        self.record.write_text(self.record.read_text().replace("9.9.1.1-outcome", "earlier-outcome"))
        self.assertTrue(any("already delivered" in error for error in collection_violations([partial, self.record])))

    def test_missing_prior_delivery_fails(self) -> None:
        self.record.write_text(self.record.read_text().replace("Prior deliveries:** None.", "Prior deliveries:** missing"))
        self.assertTrue(collection_violations([self.record]))

    def test_format_two_archive_requires_receipt_before_destructive_step(self) -> None:
        fixture = ArchiveFixture()
        self.addCleanup(fixture.close)
        candidate(fixture.root)
        self.assertTrue(any("freshly collected" in message for message in fixture.messages("pre")))
        fixture.copy_bundle()
        self.assertTrue(any("freshly collected" in message for message in fixture.messages("post")))
