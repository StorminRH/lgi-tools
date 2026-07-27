#!/usr/bin/env python3
"""Fixture tests for the read-only version-start capture reporter."""

from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest

from capture_version_start import _ensure_ref_fidelity, render_capture
from check_baseline_claims import BASELINE_TEMPLATE_RELPATH
from repo_measures import MeasureError


REAL_ROOT = Path(__file__).resolve().parent.parent
MAIN_SHA = "c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd"


def _main_baseline() -> str:
    return (
        "# Code Health Baseline (LGI.tools)\n\n"
        "## Snapshot\n\n"
        "| Field | Value |\n"
        "| --- | --- |\n"
        "| Date | 2026-07-27 |\n"
        "| App version | 3.10.5.1 |\n"
        f"| Code ref | `{MAIN_SHA}` on `main` (audited) |\n"
        "| Measurement scope | Full audit |\n\n"
        "## Metrics\n\n"
        "| Metric | Version-start | Current | Delta |\n"
        "| --- | ---: | ---: | ---: |\n"
        "| Production TS/TSX files | 700 | 800 | +100 |\n"
        "| Production TS/TSX LOC | 1 | 2 | +1 |\n"
        "| Test files | 1 | 2 | +1 |\n"
        "| Coverage — statements | 1% | 1% | — |\n"
        "| Coverage — branches | 1% | 1% | — |\n"
        "| Coverage — functions | 1% | 1% | — |\n"
        "| Coverage — lines | 1% | 1% | — |\n"
        "| Fallow health score | 1 | 1 | — |\n"
        "| Functions above health thresholds | 0 | 0 | 0 |\n"
        "| Planner concern-context fields | 1 | 1 | — |\n"
        "| Concern-hook consumers | 1 | 1 | — |\n"
        "| Auth contract paths (`src/platform/auth/types.ts`, "
        "`src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`) | 3 | 3 | 0 |\n"
        "| ESI dataset registry entries | 1 | 1 | 0 |\n"
        "| Freshness leaf breadth | 1 | 1 | — |\n"
        "| Cron shell declarations | 1 | 1 | 0 |\n"
        "| Real-Postgres harness consumers | 1 | 1 | 0 |\n"
        "| Dataset declaration census | 1 | 1 | — |\n"
        "| API contract completeness | 1 | 1 | — |\n"
        "| EVE type-image resolver breadth | 1 | 1 | — |\n"
        "| Threshold overrides | 0 | 0 | 0 |\n"
        "| Source suppressions | 10 | 42 | +32 |\n"
        "| Whole-version Fallow clone groups | 0 | 1 | +1 |\n"
        "| Accepted duplication baseline clone groups | 0 | 0 | 0 |\n"
        "| Version-start-pinned Fallow verdict | Pass | Pass | — |\n"
        "| `src/data/telemetry/queries.ts` | 1 exports | 1 exports | — |\n"
        "| `src/data/esi-refresh-jobs/queries.ts` | 1 exports | 1 exports | — |\n\n"
        "## Watch findings\n"
    )


class CaptureFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        schema = (REAL_ROOT / BASELINE_TEMPLATE_RELPATH).read_text(encoding="utf-8")
        path = self.root / BASELINE_TEMPLATE_RELPATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(schema, encoding="utf-8")

    def close(self) -> None:
        self.temporary.cleanup()


class CaptureVersionStartTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = CaptureFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def test_promotion_fills_new_rows_and_promotes_shared_current(self) -> None:
        live = {
            "Production TS/TSX files": "800",
            "Production TS/TSX LOC": "2",
            "Test files": "2",
            "Diagnostic suppressions": "18",
            "Test contract suppressions": "24",
            "Whole-version Fallow clone groups": "1",
            "Fallow boundary zones (configured)": "22",
            "Vendor-resilience integrations": "14",
            "Instrumented capability operations": "38",
            "Owned service-level indicators": "5",
            "UI adoption exemptions": "16",
            "Retained legacy CSS families": "8",
        }
        text = render_capture(
            self.fixture.root,
            read_main=lambda _root: _main_baseline(),
            measure=lambda _root: live,
            ensure_fidelity=lambda _root, _ref: None,
        )
        self.assertIn(f"| Version-start ref | {MAIN_SHA} |", text)
        self.assertIn("| Production TS/TSX files | 800 | 800 | 0 |", text)
        self.assertIn("| Diagnostic suppressions | 18 | 18 | 0 |", text)
        self.assertIn("| Test contract suppressions | 24 | 24 | 0 |", text)
        self.assertIn("| Fallow boundary zones (configured) | 22 | 22 | 0 |", text)
        self.assertNotIn("Source suppressions", text)
        second = render_capture(
            self.fixture.root,
            read_main=lambda _root: _main_baseline(),
            measure=lambda _root: live,
            ensure_fidelity=lambda _root, _ref: None,
        )
        self.assertEqual(text, second)

    def test_ref_fidelity_failure_is_loud(self) -> None:
        def refuse(_root: Path, _ref: str) -> None:
            raise MeasureError("working tree differs from promotion ref on src")

        with self.assertRaisesRegex(MeasureError, "differs from promotion ref"):
            render_capture(
                self.fixture.root,
                read_main=lambda _root: _main_baseline(),
                measure=lambda _root: {},
                ensure_fidelity=refuse,
            )

    def test_unavailable_main_baseline_is_loud(self) -> None:
        def missing(_root: Path) -> str:
            raise MeasureError("origin/main baseline unavailable: missing")

        with self.assertRaisesRegex(MeasureError, "unavailable"):
            render_capture(
                self.fixture.root,
                read_main=missing,
                measure=lambda _root: {},
                ensure_fidelity=lambda _root, _ref: None,
            )

    def test_ref_fidelity_checks_tracked_untracked_and_ignored_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "src").mkdir()
            (root / "convex").mkdir()
            (root / "src/a.ts").write_text("export const a = 1;\n", encoding="utf-8")
            (root / "convex/a.ts").write_text("export const b = 1;\n", encoding="utf-8")
            (root / ".fallowrc.json").write_text("{}\n", encoding="utf-8")
            (root / ".gitignore").write_text("src/ignored.ts\n", encoding="utf-8")
            for command in (
                ("git", "init"),
                ("git", "config", "user.email", "fixture@example.invalid"),
                ("git", "config", "user.name", "Fixture"),
                ("git", "add", "."),
                ("git", "commit", "-m", "fixture"),
            ):
                subprocess.run(
                    command,
                    cwd=root,
                    check=True,
                    text=True,
                    capture_output=True,
                )
            promotion_ref = subprocess.run(
                ("git", "rev-parse", "HEAD"),
                cwd=root,
                check=True,
                text=True,
                capture_output=True,
            ).stdout.strip()

            _ensure_ref_fidelity(root, promotion_ref)

            (root / "src/untracked.ts").write_text(
                "export const extra = 1;\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MeasureError, "untracked promotion input"):
                _ensure_ref_fidelity(root, promotion_ref)
            (root / "src/untracked.ts").unlink()

            (root / "src/ignored.ts").write_text(
                "export const ignored = 1;\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MeasureError, "ignored promotion input"):
                _ensure_ref_fidelity(root, promotion_ref)
            (root / "src/ignored.ts").unlink()

            (root / "src/a.ts").write_text(
                "export const a = 2;\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MeasureError, "differs from promotion ref"):
                _ensure_ref_fidelity(root, promotion_ref)

    def test_duplicate_main_metric_is_loud(self) -> None:
        duplicate = _main_baseline().replace(
            "| Production TS/TSX LOC | 1 | 2 | +1 |\n",
            "| Production TS/TSX LOC | 1 | 2 | +1 |\n"
            "| Production TS/TSX files | 700 | 800 | +100 |\n",
        )
        with self.assertRaisesRegex(MeasureError, "duplicate Metrics key"):
            render_capture(
                self.fixture.root,
                read_main=lambda _root: duplicate,
                measure=lambda _root: {},
                ensure_fidelity=lambda _root, _ref: None,
            )

    def test_legacy_auth_metric_promotes_into_canonical_row(self) -> None:
        legacy = _main_baseline().replace(
            "Auth contract paths (`src/platform/auth/types.ts`, "
            "`src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`)",
            "`auth-surface` files",
        )
        text = render_capture(
            self.fixture.root,
            read_main=lambda _root: legacy,
            measure=lambda _root: {
                "Diagnostic suppressions": "18",
                "Test contract suppressions": "24",
                "Fallow boundary zones (configured)": "22",
                "Vendor-resilience integrations": "14",
                "Instrumented capability operations": "38",
                "Owned service-level indicators": "5",
                "UI adoption exemptions": "16",
                "Retained legacy CSS families": "8",
            },
            ensure_fidelity=lambda _root, _ref: None,
        )
        self.assertIn(
            "| Auth contract paths (`src/platform/auth/types.ts`, "
            "`src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`) "
            "| 3 | 3 | 0 |",
            text,
        )
        self.assertNotIn("`auth-surface` files", text)


if __name__ == "__main__":
    unittest.main()
