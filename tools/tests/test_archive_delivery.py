"""Committed-tree fixtures for archive delivery readiness."""

from __future__ import annotations

from pathlib import Path
import hashlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from tools.lifecycle.archive_delivery import archive_delivery_status
from tools.lifecycle.resolve_development_state import archive_record_violations
from tools.tests.test_development_state import ResolverFixture


PLAN = "docs/session-plans/9.9/9.9.1.1.1.md"
RECORD = "docs/session-as-built/9.9/9.9.1.1.1.md"
COMPLETE = "# Session\n\n**Execution status:** Complete\n"


class ArchiveDeliveryTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git("init", "--quiet")
        self.git("config", "user.email", "fixture@example.test")
        self.git("config", "user.name", "Fixture")
        self.git("config", "commit.gpgsign", "false")
        self.git("commit", "--allow-empty", "-qm", "initial")
        self.base = self.git("rev-parse", "HEAD")
        fixture = ResolverFixture()
        self.addCleanup(fixture.close)
        contract = fixture.write_contract()
        fixture.write_session_plan(contract, execution_status="Complete")
        record = fixture.write_as_built(contract)
        self.complete = (fixture.root / PLAN).read_text(encoding="utf-8")
        self.record = record.read_text(encoding="utf-8")
        self.support = {
            contract.relative_to(fixture.root).as_posix(): contract.read_text(encoding="utf-8"),
            "docs/workflows/schema/session-as-built.md": (
                fixture.docs / "workflows/schema/session-as-built.md"
            ).read_text(encoding="utf-8"),
        }

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=self.root, text=True, capture_output=True, check=True
        ).stdout.strip()

    def write(self, path: str, contents: str) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents, encoding="utf-8")

    def commit(self) -> str:
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")
        return self.git("rev-parse", "HEAD")

    def ref(self, branch: str, commit: str = "HEAD") -> None:
        self.git("update-ref", f"refs/remotes/origin/{branch}", commit)

    def status(self) -> str:
        return archive_delivery_status(
            self.root,
            "9.9",
            validate_record=archive_record_violations,
        )

    def write_complete(self) -> None:
        self.write(PLAN, self.complete)
        for path, contents in self.support.items():
            self.write(path, contents)

    def test_missing_either_ref_is_unknown(self) -> None:
        self.assertEqual("unknown", self.status())
        for branch in ("development", "staging"):
            with self.subTest(branch=branch):
                self.ref(branch)
                self.assertEqual("unknown", self.status())
                self.git("update-ref", "-d", f"refs/remotes/origin/{branch}")

    def test_git_execution_failure_is_unknown(self) -> None:
        with patch("tools.lifecycle.archive_delivery.subprocess.run", side_effect=OSError):
            self.assertEqual("unknown", self.status())

    def test_unlanded_local_completed_plan_is_unknown(self) -> None:
        self.ref("development")
        self.ref("staging")
        self.write_complete()
        self.assertEqual("unknown", self.status())

    def test_local_completed_plan_differs_from_development_is_unknown(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.write(PLAN, self.complete + "\nUnlanded evidence\n")
        self.assertEqual("unknown", self.status())

    def test_valid_refs_without_completed_plans_are_delivered(self) -> None:
        self.ref("development")
        self.ref("staging")
        self.assertEqual("delivered", self.status())

    def test_docs_only_completed_plan_missing_from_staging_is_pending(self) -> None:
        self.ref("staging")
        self.write_complete()
        self.commit()
        self.ref("development")
        self.assertEqual("pending", self.status())

    def test_completed_plan_edit_missing_from_staging_is_pending(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        self.commit()
        self.ref("staging")
        self.write(PLAN, self.complete + "\nUpdated evidence\n")
        self.commit()
        self.ref("development")
        self.assertEqual("pending", self.status())

    def test_equal_plan_and_final_record_are_delivered(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.assertEqual("delivered", self.status())

    def test_equal_plan_without_staging_record_is_pending(self) -> None:
        self.write_complete()
        self.commit()
        self.ref("staging")
        self.write(RECORD, self.record)
        self.commit()
        self.ref("development")
        self.assertEqual("pending", self.status())

    def test_malformed_staging_record_is_pending_despite_valid_local_record(self) -> None:
        self.write_complete()
        self.write(RECORD, "Final record\n")
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.write(RECORD, self.record)
        self.assertEqual("pending", self.status())

    def test_stale_staging_plan_digest_is_pending(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        self.write(PLAN, self.complete + "\nUpdated evidence\n")
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.assertEqual("pending", self.status())

    def test_stale_staging_contract_digest_is_pending(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        contract = "docs/session-contracts/9.9/9.9.1.1.1.md"
        self.write(contract, self.support[contract] + "\nChanged scope\n")
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.assertEqual("pending", self.status())

    def test_missing_staging_schema_is_pending_despite_local_schema(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record)
        schema = "docs/workflows/schema/session-as-built.md"
        (self.root / schema).unlink()
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.write(schema, self.support[schema])
        self.assertEqual("pending", self.status())

    def test_valid_but_wrong_delivering_branch_is_pending(self) -> None:
        self.write_complete()
        self.write(RECORD, self.record.replace("**Branch:** `development`", "**Branch:** `lifecycle/9.9.1.1`"))
        self.commit()
        self.ref("development")
        self.ref("staging")
        self.assertEqual("pending", self.status())

    def test_rebound_record_cannot_hide_a_changed_contract(self) -> None:
        contract = "docs/session-contracts/9.9/9.9.1.1.1.md"
        original = self.support[contract]
        modified = original + "\nChanged scope\n"
        old_digest = hashlib.sha256(original.encode()).hexdigest()
        new_digest = hashlib.sha256(modified.encode()).hexdigest()
        for update_development in (False, True):
            with self.subTest(update_development=update_development):
                self.write_complete()
                self.write(RECORD, self.record)
                self.commit()
                self.ref("development")
                self.write(contract, modified)
                self.write(RECORD, self.record.replace(old_digest, new_digest))
                self.commit()
                self.ref("staging")
                if update_development:
                    self.ref("development")
                self.assertEqual("pending", self.status())

    def test_pending_plan_does_not_require_final_record(self) -> None:
        self.ref("staging")
        self.write(PLAN, COMPLETE.replace("Complete", "Pending"))
        self.commit()
        self.ref("development")
        self.assertEqual("delivered", self.status())

    def test_other_versions_and_unrelated_docs_do_not_block(self) -> None:
        self.ref("staging")
        self.write("docs/session-plans/9.8/9.8.1.1.md", COMPLETE)
        self.write("docs/ROADMAP.md", "Different roadmap status\n")
        self.commit()
        self.ref("development")
        self.assertEqual("delivered", self.status())

    def test_squash_equivalent_content_is_delivered(self) -> None:
        self.write_complete()
        self.commit()
        self.write(RECORD, self.record)
        development = self.commit()
        self.ref("development", development)
        tree = self.git("rev-parse", "HEAD^{tree}")
        staging = self.git("commit-tree", tree, "-p", self.base, "-m", "squashed promotion")
        self.ref("staging", staging)
        self.assertNotEqual(development, staging)
        self.assertEqual("delivered", self.status())

    def test_final_record_may_be_created_only_on_staging(self) -> None:
        self.write_complete()
        self.commit()
        self.ref("development")
        self.write(RECORD, self.record)
        self.commit()
        self.ref("staging")
        self.assertEqual("delivered", self.status())


if __name__ == "__main__":
    unittest.main()
