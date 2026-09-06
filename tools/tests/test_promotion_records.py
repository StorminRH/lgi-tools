"""As-built records for sessions delivered together by a promotion."""

from pathlib import Path
import re
import unittest

from tools.lifecycle.resolve_development_state import as_built_schema_violations
from tools.tests.test_development_state import ResolverFixture


class PromotionRecordTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ResolverFixture()
        self.addCleanup(self.fixture.close)

    def record(
        self,
        session: str,
        *,
        branch: str = "development",
        pr: str = "#42",
    ) -> tuple[Path, Path, Path]:
        contract = self.fixture.write_contract(session=session)
        self.fixture.write_session_plan(contract, execution_status="Complete")
        record = self.fixture.write_as_built(contract, session=session, pr=pr)
        record.write_text(
            re.sub(
                r"^\*\*Branch:\*\* .+$",
                lambda _: f"**Branch:** `{branch}`",
                record.read_text(encoding="utf-8"),
                flags=re.MULTILINE,
            ),
            encoding="utf-8",
        )
        plan = self.fixture.docs / "session-plans/9.9" / f"{session}.md"
        return record, contract, plan

    def test_nonfinal_and_final_sessions_share_the_promotion_pr(self) -> None:
        for session in ("4.1.1.1.1", "4.1.1.1.2"):
            with self.subTest(session=session):
                paths = self.record(session)
                self.assertEqual(
                    [],
                    as_built_schema_violations(
                        *paths,
                        self.fixture.root,
                        per_session_delivery=False,
                        final_session="4.1.1.1.2",
                    ),
                )

    def test_custom_delivering_branch_is_required_when_supplied(self) -> None:
        paths = self.record("4.1.1.1.1", branch="codex/promotion")
        self.assertEqual(
            [],
            as_built_schema_violations(
                *paths,
                self.fixture.root,
                per_session_delivery=False,
                delivering_branch="codex/promotion",
            ),
        )
        self.assertIn(
            "Branch must be 'development'",
            as_built_schema_violations(
                *paths, self.fixture.root, per_session_delivery=False
            ),
        )

    def test_new_sessions_reject_lifecycle_branch_and_deferred_pr(self) -> None:
        paths = self.record(
            "4.1.1.1.1", branch="lifecycle/4.1.1.1", pr="Deferred to 4.1.1.1.2"
        )
        violations = as_built_schema_violations(
            *paths,
            self.fixture.root,
            per_session_delivery=False,
            final_session="4.1.1.1.2",
        )
        self.assertIn("Branch must be 'development'", violations)
        self.assertIn(
            "PR must be '#<positive number>' for every delivered session", violations
        )

    def test_new_sessions_require_positive_pr_for_every_delivery_mode(self) -> None:
        for pr in ("#0", "#-1", "#abc", "Deferred to 4.1.1.1.2"):
            for per_session in (False, True):
                with self.subTest(pr=pr, per_session=per_session):
                    paths = self.record("4.1.1.1.1", pr=pr)
                    self.assertIn(
                        "PR must be '#<positive number>' for every delivered session",
                        as_built_schema_violations(
                            *paths,
                            self.fixture.root,
                            per_session_delivery=per_session,
                        ),
                    )

    def test_completed_4_0_records_keep_legacy_branch_and_deferred_pr(self) -> None:
        for session, pr in (
            ("4.0.9.9.1", "Deferred to 4.0.9.9.2"),
            ("4.0.9.9.2", "#42"),
        ):
            with self.subTest(session=session):
                paths = self.record(session, branch="lifecycle/4.0.9.9", pr=pr)
                self.assertEqual(
                    [],
                    as_built_schema_violations(
                        *paths,
                        self.fixture.root,
                        per_session_delivery=False,
                        final_session="4.0.9.9.2",
                    ),
                )

    def test_legacy_nonfinal_record_still_defers_under_shared_pr_delivery(self) -> None:
        paths = self.record("4.0.9.9.1", branch="lifecycle/4.0.9.9")
        self.assertIn(
            "PR must defer to the final session under the one-sub-version-PR delivery unit",
            as_built_schema_violations(
                *paths,
                self.fixture.root,
                per_session_delivery=False,
                final_session="4.0.9.9.2",
            ),
        )


if __name__ == "__main__":
    unittest.main()
