from __future__ import annotations

import unittest

from tools.lifecycle.resolve_development_state import resolve
from tools.tests.test_development_state import ResolverFixture


class DevelopmentDeliveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ResolverFixture()
        self.addCleanup(self.fixture.close)

    def two_rows(self, second_status: str | None = "Pending") -> None:
        (self.fixture.docs / "VERSION_9_9_PLAN.md").write_text(
            "# Version 9.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 9.9.1.1 | First | 1 | READY |\n"
            "| 9.9.1.2 | Second | 1 | READY |\n"
        )
        first = self.fixture.write_contract(session="9.9.1.1.1")
        self.fixture.write_session_plan(first, execution_status="Complete")
        if second_status is not None:
            second = self.fixture.write_contract(session="9.9.1.2.1")
            self.fixture.write_session_plan(second, execution_status=second_status)
        index = self.fixture.docs / "session-contracts/9.9/INDEX.md"
        index.write_text(
            "| Session | Sub-version | Contract |\n| --- | --- | --- |\n"
            "| 9.9.1.1.1 | 9.9.1.1 | `9.9.1.1.1.md` |\n"
            + ("| 9.9.1.2.1 | 9.9.1.2 | `9.9.1.2.1.md` |\n" if second_status else "")
        )

    def test_completed_row_advances_to_next_pending_session(self) -> None:
        self.two_rows()
        state, errors = resolve(self.fixture.root, app_facing=79)
        self.assertEqual([], errors)
        self.assertEqual("session-ready", state["stage"])
        self.assertEqual("9.9.1.2.1", state["session"])
        self.assertTrue(state["finalSession"])
        self.assertEqual("development", state["directive"]["branch"])

    def test_completed_row_advances_to_missing_contracts(self) -> None:
        self.two_rows(None)
        state, errors = resolve(self.fixture.root, app_facing=0)
        self.assertEqual([], errors)
        self.assertEqual("contracts-needed", state["stage"])
        self.assertEqual("9.9.1.2", state["subversion"])

    def test_completed_authority_is_validated_before_skip_or_archive(self) -> None:
        for next_status in ("Pending", "Complete"):
            for corruption in ("contract", "approval", "digest", "plan_schema"):
                with self.subTest(next_status=next_status, corruption=corruption):
                    self.two_rows(next_status)
                    contract = self.fixture.docs / "session-contracts/9.9/9.9.1.1.1.md"
                    plan = self.fixture.docs / "session-plans/9.9/9.9.1.1.1.md"
                    if corruption == "contract":
                        contract.write_text("# Malformed completed contract\n")
                        self.fixture.write_session_plan(contract, execution_status="Complete")
                    else:
                        text = plan.read_text()
                        if corruption == "approval":
                            text = text.replace("**Plan status:** Approved", "**Plan status:** Draft")
                        elif corruption == "digest":
                            text = text.replace("sha256:", "sha256:stale")
                        else:
                            text = text.replace("### Ordered work", "### Missing ordered work")
                        plan.write_text(text)
                    state, errors = resolve(self.fixture.root, app_facing=0, delivery_state="delivered")
                    self.assertEqual("invalid", state["stage"])
                    self.assertTrue(any("completed session authority is invalid" in error for error in errors))
                    self.assertIsNone(state["directive"]["handler"])

    def test_completed_index_entry_outside_roadmap_is_validated(self) -> None:
        self.two_rows("Complete")
        index = self.fixture.docs / "session-contracts/9.9/INDEX.md"
        index.write_text(index.read_text().replace("| 9.9.1.2 |", "| 9.9.1.3 |"))
        plan = self.fixture.docs / "session-plans/9.9/9.9.1.2.1.md"
        plan.write_text(plan.read_text().replace("**Plan status:** Approved", "**Plan status:** Draft"))
        state, errors = resolve(self.fixture.root, app_facing=0, delivery_state="delivered")
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(any("9.9.1.2.1: completed session authority" in error for error in errors))

    def test_legacy_terminal_work_keeps_existing_archive_behavior(self) -> None:
        roadmap = self.fixture.docs / "VERSION_9_9_PLAN.md"
        (self.fixture.docs / "VERSION_4_0_PLAN.md").write_text(
            roadmap.read_text().replace("9.9", "4.0").replace("CANCELLED", "COMPLETE")
        )
        roadmap.unlink()
        contracts = self.fixture.docs / "session-contracts/4.0"
        contracts.mkdir(parents=True)
        (contracts / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n| --- | --- | --- |\n"
            "| 4.0.1.1.1 | 4.0.1.1 | `4.0.1.1.1.md` |\n"
        )
        (contracts / "4.0.1.1.1.md").write_text("# Legacy contract\n")
        plans = self.fixture.docs / "session-plans/4.0"
        plans.mkdir(parents=True)
        (plans / "4.0.1.1.1.md").write_text("**Execution status:** Complete\n")
        state, errors = resolve(self.fixture.root, app_facing=0)
        self.assertEqual([], errors)
        self.assertEqual("archive-needed", state["stage"])

    def test_final_session_ignores_later_completed_rows(self) -> None:
        self.two_rows("Complete")
        first = self.fixture.docs / "session-contracts/9.9/9.9.1.1.1.md"
        self.fixture.write_session_plan(first)
        state, errors = resolve(self.fixture.root, app_facing=0)
        self.assertEqual([], errors)
        self.assertTrue(state["finalSession"])

    def test_archive_requires_delivery_even_below_threshold(self) -> None:
        self.two_rows("Complete")
        for count in (0, 79):
            for delivery, stage in (("pending", "promote-needed"), ("delivered", "archive-needed"), ("unknown", "invalid")):
                with self.subTest(count=count, delivery=delivery):
                    state, errors = resolve(self.fixture.root, app_facing=count, delivery_state=delivery)
                    self.assertEqual(stage, state["stage"])
                    self.assertEqual(delivery == "unknown", bool(errors))
                    self.assertEqual("close-out" if delivery == "pending" else "start-session" if delivery == "delivered" else None, state["directive"]["handler"])

    def test_partial_promotion_resumes_same_pending_session(self) -> None:
        self.two_rows()
        before, _ = resolve(self.fixture.root, app_facing=80)
        after, errors = resolve(self.fixture.root, app_facing=0)
        self.assertEqual([], errors)
        self.assertEqual("close-out", before["directive"]["handler"])
        self.assertEqual("session-ready", after["stage"])
        self.assertEqual(before["session"], after["session"])

    def test_complete_roadmap_cannot_hide_pending_execution(self) -> None:
        self.fixture.write_roadmap("COMPLETE")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        state, errors = resolve(self.fixture.root, app_facing=0, delivery_state="delivered")
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(any("every declared session" in error for error in errors))

    def test_missing_indexed_session_prevents_archive(self) -> None:
        self.fixture.write_roadmap("READY", sessions=2)
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract, execution_status="Complete")
        state, errors = resolve(self.fixture.root, app_facing=0, delivery_state="delivered")
        self.assertEqual([], errors)
        self.assertEqual("contracts-needed", state["stage"])

    def test_cancelled_and_deferred_work_needs_no_execution(self) -> None:
        for status in ("CANCELLED", "DEFERRED"):
            with self.subTest(status=status):
                self.fixture.write_roadmap(status)
                contract = self.fixture.write_contract()
                self.fixture.write_session_plan(contract)
                state, errors = resolve(self.fixture.root, app_facing=0)
                self.assertEqual([], errors)
                self.assertEqual("archive-needed", state["stage"])

    def test_new_plan_rejects_staging_or_session_pr_landing(self) -> None:
        self.fixture.write_roadmap("READY")
        contract = self.fixture.write_contract()
        for branch, pr in (("staging", "no"), ("development", "yes")):
            with self.subTest(branch=branch, pr=pr):
                self.fixture.write_session_plan(contract)
                plan = self.fixture.docs / "session-plans/9.9/9.9.1.1.1.md"
                plan.write_text(plan.read_text().replace(
                    "**Branch:** `development` · **ends in PR:** no",
                    f"**Branch:** `{branch}` · **ends in PR:** {pr}",
                ))
                state, errors = resolve(self.fixture.root, app_facing=0)
                self.assertEqual("session-plan-needed", state["stage"])
                self.assertTrue(any("must land on development" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
