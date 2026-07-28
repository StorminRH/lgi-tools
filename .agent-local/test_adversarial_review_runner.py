"""Tests for the concurrent Cursor adversarial-review runner."""

from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / ".agent-local" / "run_adversarial_review.py"


class AdversarialReviewRunnerTests(unittest.TestCase):
    def make_fake_cursor(self, directory: Path) -> Path:
        path = directory / "fake-cursor-agent"
        path.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env python3
                import hashlib
                import json
                import os
                import sys

                args = sys.argv[1:]
                if "--resume" in args:
                    session_id = args[args.index("--resume") + 1]
                    scenario = os.environ.get("FAKE_CURSOR_SCENARIO", "findings")
                    if scenario == "nonzero":
                        print("collection failed", file=sys.stderr)
                        raise SystemExit(7)
                    if scenario == "error-result":
                        print(json.dumps({"is_error": True, "session_id": session_id}))
                        raise SystemExit(0)
                    if scenario == "clean-with-finding":
                        result = (
                            "Verdict: CLEAN\\n\\n"
                            "Findings:\\n"
                            "1. [MINOR] owner.py — invariant; scenario; correction.\\n\\n"
                            "Load-bearing checks that held:\\n- identity — evidence."
                        )
                    elif scenario == "findings-with-none":
                        result = (
                            "Verdict: FINDINGS\\n\\n"
                            "Findings: None\\n\\n"
                            "Load-bearing checks that held:\\n- identity — evidence."
                        )
                    elif scenario == "clean-with-load-bearing-marker":
                        result = (
                            "Verdict: CLEAN\\n\\n"
                            "Findings: None\\n\\n"
                            "Load-bearing checks that held:\\n"
                            "1. [BLOCKER] parser fixture — rejected marker outside findings."
                        )
                    else:
                        severity = "BLOCKER" if "grok" in session_id else "MAJOR"
                        result = (
                            "Verdict: FINDINGS\\n\\n"
                            "Findings:\\n"
                            f"1. [{severity}] owner.py — invariant; scenario; correction.\\n\\n"
                            "Load-bearing checks that held:\\n- identity — evidence."
                        )
                    print(json.dumps({"result": result, "session_id": session_id}))
                else:
                    model = args[args.index("--model") + 1]
                    prompt = sys.stdin.read()
                    digest = hashlib.sha256(prompt.encode()).hexdigest()[:8]
                    prefix = "grok" if "grok" in model else "composer"
                    print(json.dumps({
                        "result": "investigated",
                        "session_id": f"{prefix}-{digest}",
                    }))
                """
            ),
            encoding="utf-8",
        )
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return path

    def run_runner(
        self,
        *,
        composer_count: int,
        output_inside_repository: bool = False,
        prefill_output: bool = False,
        scenario: str = "findings",
    ) -> subprocess.CompletedProcess[str]:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        repository = root / "repository"
        repository.mkdir()
        briefs = root / "briefs"
        briefs.mkdir()
        grok = briefs / "grok.md"
        grok.write_text("holistic brief", encoding="utf-8")
        fake_cursor = self.make_fake_cursor(root)
        output = repository / "results" if output_inside_repository else root / "results"
        if prefill_output:
            output.mkdir()
            (output / "stale.json").write_text("{}", encoding="utf-8")
        command = [
            sys.executable,
            str(RUNNER),
            "--repository",
            str(repository),
            "--output-dir",
            str(output),
            "--grok-brief",
            str(grok),
            "--cursor-agent",
            str(fake_cursor),
        ]
        for index in range(1, composer_count + 1):
            brief = briefs / f"composer-{index}.md"
            brief.write_text(f"composer brief {index}", encoding="utf-8")
            command.extend(
                ["--composer-brief", f"scope {index}={brief}"]
            )
        return subprocess.run(
            command,
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "FAKE_CURSOR_SCENARIO": scenario},
        )

    def test_runs_one_grok_and_three_composers_and_counts_findings(self) -> None:
        result = self.run_runner(composer_count=3)
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual(summary["seat_count"], 4)
        self.assertEqual(summary["seats"][0]["reviewer"], "Grok 4.5 High")
        self.assertEqual(summary["seats"][0]["reported"]["blocker"], 1)
        for seat in summary["seats"][1:]:
            self.assertEqual(seat["reported"]["major"], 1)

    def test_rejects_more_than_three_composer_seats(self) -> None:
        result = self.run_runner(composer_count=4)
        self.assertEqual(result.returncode, 2)
        self.assertIn("between one and three Composer", result.stderr)

    def test_rejects_output_inside_repository(self) -> None:
        result = self.run_runner(
            composer_count=1,
            output_inside_repository=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("outside the repository", result.stderr)

    def test_rejects_nonempty_output_directory(self) -> None:
        result = self.run_runner(composer_count=1, prefill_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("must start empty", result.stderr)

    def test_counts_only_numbered_findings_inside_the_findings_section(self) -> None:
        result = self.run_runner(
            composer_count=1,
            scenario="clean-with-load-bearing-marker",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        for seat in summary["seats"]:
            self.assertEqual(seat["verdict"], "CLEAN")
            self.assertEqual(seat["reported"], {"blocker": 0, "major": 0, "minor": 0})

    def test_rejects_clean_with_a_numbered_finding(self) -> None:
        result = self.run_runner(composer_count=1, scenario="clean-with-finding")
        self.assertEqual(result.returncode, 2)
        self.assertIn("returned CLEAN with numbered findings", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rejects_findings_without_a_numbered_finding(self) -> None:
        result = self.run_runner(composer_count=1, scenario="findings-with-none")
        self.assertEqual(result.returncode, 2)
        self.assertIn("returned FINDINGS without parseable numbered findings", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rejects_cursor_error_results_without_a_summary(self) -> None:
        result = self.run_runner(composer_count=1, scenario="error-result")
        self.assertEqual(result.returncode, 2)
        self.assertIn("returned an error result", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rejects_nonzero_cursor_results_without_a_summary(self) -> None:
        result = self.run_runner(composer_count=1, scenario="nonzero")
        self.assertEqual(result.returncode, 2)
        self.assertIn("exited 7", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
