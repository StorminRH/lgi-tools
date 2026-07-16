#!/usr/bin/env python3
"""Fixture tests for the LGI.tools development-state resolver."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from resolve_development_state import resolve


SHA = "a" * 40
RESOLVER = Path(__file__).with_name("resolve_development_state.py")


class ResolverFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.docs = self.root / "docs"
        self.docs.mkdir()
        (self.docs / "VERSION_AUDIT.md").write_text("# Audit procedure\n", encoding="utf-8")
        self.write_roadmap("COMPLETE")
        self.write_baseline(SHA)

    def close(self) -> None:
        self.temporary.cleanup()

    def write_roadmap(self, status: str) -> None:
        (self.docs / "VERSION_9_9_PLAN.md").write_text(
            "# Version 9.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            f"| 9.9.1.1 | Fixture | 1 | {status} |\n",
            encoding="utf-8",
        )

    def write_baseline(self, code_ref: str) -> None:
        (self.docs / "CODE_HEALTH_BASELINE.md").write_text(
            f"# Baseline\n\n| Field | Value |\n| --- | --- |\n| Code ref | `{code_ref}` |\n",
            encoding="utf-8",
        )

    def write_audit(self, status: str, finding_status: str | None = None, *, digest: str | None = None) -> None:
        procedure = self.docs / "VERSION_AUDIT.md"
        procedure_digest = digest or hashlib.sha256(procedure.read_bytes()).hexdigest()
        findings = ""
        if finding_status:
            findings = (
                "\n## Audit findings\n\n"
                "| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |\n"
                "| --- | ---: | --- | --- | --- | --- | --- |\n"
                f"| AF-001 | 1 | Campaign | leaked policy | one owner | 9.9.1.1 | {finding_status} |\n"
            )
        path = self.docs / "version-audits/9.9/PLAN.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "# Audit plan\n\n"
            f"**Audit status:** {status}\n"
            "**Audit cycle:** 1\n"
            f"**Audited ref:** `{SHA}`\n"
            "**Audit mode:** Version close\n"
            "**Procedure:** `docs/VERSION_AUDIT.md`\n"
            f"**Procedure digest:** `sha256:{procedure_digest}`\n"
            f"{findings}",
            encoding="utf-8",
        )

    def write_contract(self, ux_gate: str | None = "No") -> Path:
        directory = self.docs / "session-contracts/9.9"
        directory.mkdir(parents=True, exist_ok=True)
        contract = directory / "9.9.1.1.1.md"
        ux_marker = f"\n**UX gate:** {ux_gate}\n" if ux_gate is not None else ""
        contract.write_text(
            f"## Session 9.9.1.1.1 — Fixture\n{ux_marker}",
            encoding="utf-8",
        )
        (directory / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 9.9.1.1.1 | 9.9.1.1 | `9.9.1.1.1.md` |\n",
            encoding="utf-8",
        )
        return contract

    def write_session_plan(
        self,
        contract: Path,
        *,
        execution_status: str = "Pending",
        baseline_effect: str | None = "Neutral",
    ) -> None:
        directory = self.docs / "session-plans/9.9"
        directory.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(contract.read_bytes()).hexdigest()
        baseline_marker = (
            f"**Baseline effect:** {baseline_effect}\n"
            if baseline_effect is not None
            else ""
        )
        (directory / "9.9.1.1.1.md").write_text(
            "# Session plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            f"**Execution status:** {execution_status}\n"
            f"{baseline_marker}",
            encoding="utf-8",
        )

    def init_git(self, branch: str) -> None:
        subprocess.run(
            ["git", "init", "-b", branch, str(self.root)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )


class DevelopmentStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = ResolverFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def resolved(self) -> dict[str, object]:
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        directive = state.get("directive")
        self.assertIsInstance(directive, dict)
        assert isinstance(directive, dict)
        self.assertEqual(
            {"action", "reason", "handler", "mode", "authority", "primaryArtifact", "pause"},
            set(directive),
        )
        self.assertIn(directive["mode"], {"plan", "execute", "report"})
        for field in ("action", "reason", "authority", "pause"):
            self.assertIsInstance(directive[field], str)
            self.assertTrue(directive[field])
        return state

    def stage(self) -> str:
        return str(self.resolved()["stage"])

    def handler(self) -> str | None:
        directive = self.resolved()["directive"]
        assert isinstance(directive, dict)
        value = directive["handler"]
        return str(value) if value is not None else None

    def cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--root",
                str(self.fixture.root),
                *args,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def test_initial_approved_audit_is_ready(self) -> None:
        self.fixture.write_audit("Approved")
        self.assertEqual("audit-ready", self.stage())
        self.assertEqual("version-audit", self.handler())

    def test_missing_audit_plan_routes_to_audit_planning(self) -> None:
        self.assertEqual("audit-plan-needed", self.stage())
        self.assertEqual("plan-version-audit", self.handler())

    def test_terminal_roadmap_statuses_require_exact_tokens(self) -> None:
        for status in ("INCOMPLETE", "NOT SHIPPED", "SHIPPED (PR #247)"):
            with self.subTest(status=status):
                self.fixture.write_roadmap(status)
                state, errors = resolve(self.fixture.root)
                self.assertEqual("contracts-needed", state["stage"])
                self.assertTrue(
                    any(
                        "docs/VERSION_9_9_PLAN.md" in error and repr(status) in error
                        for error in errors
                    )
                )

        for status in ("SHIPPED", "COMPLETE"):
            with self.subTest(status=status):
                self.fixture.write_roadmap(status)
                state, errors = resolve(self.fixture.root)
                self.assertEqual([], errors)
                self.assertEqual("audit-plan-needed", state["stage"])

    def test_open_finding_requires_remediation_plan(self) -> None:
        self.fixture.write_audit("Remediation required", "Open")
        self.assertEqual("audit-remediation-plan-needed", self.stage())
        self.assertEqual("plan-audit-remediation", self.handler())

    def test_remediation_routes_through_session_planning_and_execution(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_audit("Remediation in progress", "Planned")
        contract = self.fixture.write_contract()
        self.assertEqual("session-plan-needed", self.stage())
        self.assertEqual("plan-session", self.handler())
        self.fixture.write_session_plan(contract)
        self.assertEqual("session-ready", self.stage())
        self.assertEqual("start-session", self.handler())

    def test_invalid_session_plan_marker_values_name_file_and_value(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        for label, value, kwargs in (
            ("Baseline effect", "Mixed", {"baseline_effect": "Mixed"}),
            ("Execution status", "Done", {"execution_status": "Done"}),
        ):
            with self.subTest(label=label):
                self.fixture.write_session_plan(contract, **kwargs)
                state, errors = resolve(self.fixture.root)
                self.assertEqual("session-plan-needed", state["stage"])
                self.assertTrue(
                    any(
                        "docs/session-plans/9.9/9.9.1.1.1.md" in error
                        and label in error
                        and repr(value) in error
                        for error in errors
                    )
                )

    def test_missing_binding_markers_route_to_session_planning(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract, baseline_effect=None)
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-plan-needed", state["stage"])
        self.assertEqual(
            "The session plan is missing its Baseline effect marker.",
            state["reason"],
        )

        contract = self.fixture.write_contract(ux_gate=None)
        self.fixture.write_session_plan(contract)
        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-plan-needed", state["stage"])
        self.assertEqual("The contract is missing its UX gate marker.", state["reason"])

    def test_invalid_ux_gate_names_contract_and_value(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract(ux_gate="Maybe")
        self.fixture.write_session_plan(contract)
        state, errors = resolve(self.fixture.root)
        self.assertEqual("session-plan-needed", state["stage"])
        self.assertTrue(
            any(
                "docs/session-contracts/9.9/9.9.1.1.1.md" in error
                and "UX gate" in error
                and "'Maybe'" in error
                for error in errors
            )
        )

    def test_ux_gate_flows_into_session_ready_pause(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        contract = self.fixture.write_contract(ux_gate="Yes")
        self.fixture.write_session_plan(contract)
        state = self.resolved()
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIn("Ryan's local browser review is required", directive["pause"])

        contract = self.fixture.write_contract(ux_gate="No")
        self.fixture.write_session_plan(contract)
        state = self.resolved()
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertEqual(
            "Pause on a material scope/design conflict or an explicit operator gate.",
            directive["pause"],
        )

    def test_pre_3_9_artifacts_are_exempt_from_binding_markers(self) -> None:
        (self.fixture.docs / "VERSION_9_9_PLAN.md").unlink()
        (self.fixture.docs / "VERSION_2_9_PLAN.md").write_text(
            "# Version 2.9\n\n## Status\n\n"
            "| Sub-version | Theme | Sessions | Status |\n"
            "| --- | --- | --- | --- |\n"
            "| 2.9.1.1 | Fixture | 1 | PLANNED |\n",
            encoding="utf-8",
        )
        contract_dir = self.fixture.docs / "session-contracts/2.9"
        contract_dir.mkdir(parents=True)
        contract = contract_dir / "2.9.1.1.1.md"
        contract.write_text("## Legacy contract\n", encoding="utf-8")
        (contract_dir / "INDEX.md").write_text(
            "| Session | Sub-version | Contract |\n"
            "| --- | --- | --- |\n"
            "| 2.9.1.1.1 | 2.9.1.1 | `2.9.1.1.1.md` |\n",
            encoding="utf-8",
        )
        plan_dir = self.fixture.docs / "session-plans/2.9"
        plan_dir.mkdir(parents=True)
        digest = hashlib.sha256(contract.read_bytes()).hexdigest()
        (plan_dir / "2.9.1.1.1.md").write_text(
            "# Legacy session plan\n\n"
            "**Plan status:** Approved\n"
            f"**Contract digest:** `sha256:{digest}`\n"
            "**Execution status:** Pending\n",
            encoding="utf-8",
        )

        state, errors = resolve(self.fixture.root)
        self.assertEqual([], errors)
        self.assertEqual("session-ready", state["stage"])

    def test_git_warnings_cover_plan_mode_and_execute_branch_drift(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        self.fixture.init_git("misc")

        plan_result = self.cli("--git")
        self.assertEqual(0, plan_result.returncode)
        plan_payload = json.loads(plan_result.stdout)
        self.assertIn("plan-mode directive has a dirty worktree", plan_payload["warnings"])

        contract = self.fixture.write_contract()
        self.fixture.write_session_plan(contract)
        execute_result = self.cli("--git")
        self.assertEqual(0, execute_result.returncode)
        execute_payload = json.loads(execute_result.stdout)
        self.assertTrue(
            any("does not embed sub-version 9.9.1.1" in warning for warning in execute_payload["warnings"])
        )

        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "symbolic-ref",
                "HEAD",
                "refs/heads/codex/tooling",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        codex_payload = json.loads(self.cli("--git").stdout)
        self.assertFalse(
            any("current branch" in warning for warning in codex_payload["warnings"])
        )

        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "symbolic-ref",
                "HEAD",
                "refs/heads/main",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        main_payload = json.loads(self.cli("--git").stdout)
        self.assertIn(
            "current branch is main; create the 9.9.1.1 sub-version branch",
            main_payload["warnings"],
        )

    def test_git_warnings_are_silent_for_non_git_roots(self) -> None:
        result = self.cli("--git")
        self.assertEqual(0, result.returncode)
        payload = json.loads(result.stdout)
        self.assertEqual([], payload["warnings"])

    def test_git_check_prints_warnings_without_failing(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_contract()
        self.fixture.init_git("main")
        result = self.cli("--git", "--check")
        self.assertEqual(0, result.returncode)
        self.assertIn("workflow state warning:", result.stdout)
        self.assertIn("workflow state valid: session-plan-needed", result.stdout)

    def test_local_main_behind_origin_main_warns(self) -> None:
        self.fixture.init_git("main")
        subprocess.run(
            ["git", "-C", str(self.fixture.root), "add", "."],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                "fixture",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        local_main = subprocess.run(
            ["git", "-C", str(self.fixture.root), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "--allow-empty",
                "-m",
                "origin fixture",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        origin_main = subprocess.run(
            ["git", "-C", str(self.fixture.root), "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "update-ref",
                "refs/remotes/origin/main",
                origin_main,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(self.fixture.root),
                "reset",
                "--hard",
                local_main,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        result = self.cli("--git")
        self.assertEqual(0, result.returncode)
        payload = json.loads(result.stdout)
        self.assertIn(
            "local main is behind origin/main by 1 commit(s)",
            payload["warnings"],
        )

    def test_git_flag_is_the_only_default_payload_difference(self) -> None:
        default_before = self.cli()
        default_after = self.cli()
        self.assertEqual(0, default_before.returncode)
        self.assertEqual(default_before.stdout, default_after.stdout)
        default_payload = json.loads(default_before.stdout)
        self.assertNotIn("warnings", default_payload)

        flagged = self.cli("--git")
        self.assertEqual(0, flagged.returncode)
        flagged_payload = json.loads(flagged.stdout)
        warnings = flagged_payload.pop("warnings")
        self.assertEqual([], warnings)
        self.assertEqual(default_payload, flagged_payload)

    def test_delivered_remediation_restarts_audit(self) -> None:
        self.fixture.write_audit("Remediation in progress", "Delivered")
        state = self.resolved()
        self.assertEqual("audit-restart-ready", state["stage"])
        self.assertEqual("version-audit", self.handler())
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIn("cycle 2", directive["action"])

    def test_repeated_finding_reopens_remediation(self) -> None:
        self.fixture.write_audit("Approved", "Delivered")
        self.assertEqual("audit-ready", self.stage())
        self.fixture.write_audit("Remediation required", "Open")
        self.assertEqual("audit-remediation-plan-needed", self.stage())

    def test_clean_complete_audit_can_archive(self) -> None:
        self.fixture.write_audit("Complete", "Verified")
        self.assertEqual("archive-needed", self.stage())
        self.assertEqual("version-audit", self.handler())

    def test_stale_procedure_requires_plan_reconciliation(self) -> None:
        self.fixture.write_audit("Remediation required", "Open", digest="0" * 64)
        before = (self.fixture.docs / "version-audits/9.9/PLAN.md").read_text(encoding="utf-8")
        self.assertEqual("audit-plan-needed", self.stage())
        self.assertEqual("plan-version-audit", self.handler())
        after = (self.fixture.docs / "version-audits/9.9/PLAN.md").read_text(encoding="utf-8")
        self.assertEqual(before, after)

    def test_missing_contracts_route_to_version_planning(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.assertEqual("contracts-needed", self.stage())
        self.assertEqual("plan-version", self.handler())

    def test_missing_master_plan_pauses_for_product_direction(self) -> None:
        (self.fixture.docs / "VERSION_9_9_PLAN.md").unlink()
        state = self.resolved()
        self.assertEqual("master-plan-needed", state["stage"])
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIsNone(directive["handler"])
        self.assertEqual("report", directive["mode"])

    def test_complete_audit_with_unresolved_finding_is_invalid(self) -> None:
        self.fixture.write_audit("Complete", "Delivered")
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)
        directive = state["directive"]
        assert isinstance(directive, dict)
        self.assertIsNone(directive["handler"])

    def test_nonterminal_roadmap_cannot_remain_remediation_required(self) -> None:
        self.fixture.write_roadmap("PLANNED")
        self.fixture.write_audit("Remediation required", "Open")
        self.fixture.write_contract()
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)

    def test_in_progress_requires_actionable_work(self) -> None:
        self.fixture.write_audit("Remediation in progress")
        state, errors = resolve(self.fixture.root)
        self.assertEqual("invalid", state["stage"])
        self.assertTrue(errors)


if __name__ == "__main__":
    unittest.main()
