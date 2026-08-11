#!/usr/bin/env python3
"""Stable command dispatcher for LGI.tools repository automation."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._lib.repository import ROOT as REPOSITORY_ROOT


COMMANDS = {
    ("delivery", "github-api"): "tools.delivery.github_api",
    ("delivery", "merge-clean-pr"): "tools.delivery.merge_clean_pr",
    ("delivery", "poll-pr-gate"): "tools.delivery.poll_pr_gate",
    ("delivery", "repair-gh-auth"): "tools.delivery.repair_gh_auth",
    ("delivery", "scrub-pr-body"): "tools.delivery.scrub_pr_body",
    ("delivery", "wait-prod-deploy"): "tools.delivery.wait_prod_deploy",
    ("lifecycle", "capture-version-start"): "tools.lifecycle.capture_version_start",
    ("lifecycle", "check-evidence"): "tools.lifecycle.check_lifecycle_evidence",
    ("lifecycle", "check-pending-changelog"): "tools.lifecycle.check_pending_changelog",
    ("lifecycle", "check-release"): "tools.lifecycle.check_release_consistency",
    ("lifecycle", "fold-pending-changelog"): "tools.lifecycle.fold_pending_changelog",
    ("lifecycle", "resolve"): "tools.lifecycle.resolve_development_state",
    ("lifecycle", "verify-archive"): "tools.lifecycle.verify_archive",
    ("policy", "check"): "tools.policy.check_agent_policy",
    ("policy", "check-all"): "tools.policy.check_all",
    ("policy", "check-doc-refs"): "tools.policy.check_doc_refs",
    ("quality", "check-baseline"): "tools.quality.check_baseline_claims",
    ("quality", "check-env-example"): "tools.quality.check_env_example",
    ("quality", "check-watch-triggers"): "tools.quality.check_watch_triggers",
    ("update-watch", "check-baseline"): "tools.update_watch.check_update_watch_baseline",
    ("update-watch", "collector"): "tools.update_watch.update_watch_collect",
}


def usage() -> str:
    """Return concise dispatcher help."""

    commands = "\n".join(
        f"  {group} {command}" for group, command in sorted(COMMANDS)
    )
    return (
        "usage: python3 tools/cli.py <group> <command> [arguments]\n"
        "       python3 tools/cli.py test [unittest arguments]\n\n"
        f"commands:\n{commands}\n  test"
    )


def main(argv: list[str] | None = None) -> int:
    """Dispatch one stable public command to its owning Python module."""

    arguments = list(sys.argv[1:] if argv is None else argv)
    if not arguments or arguments[0] in {"-h", "--help", "help"}:
        print(usage())
        return 0

    if arguments[0] == "test":
        extra = arguments[1:]
        command = [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "tools/tests",
            "-p",
            "test_*.py",
            *extra,
        ]
    elif len(arguments) >= 2 and (arguments[0], arguments[1]) in COMMANDS:
        module = COMMANDS[(arguments[0], arguments[1])]
        command = [sys.executable, "-m", module, *arguments[2:]]
    else:
        print(usage(), file=sys.stderr)
        return 2

    return subprocess.call(command, cwd=REPOSITORY_ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
