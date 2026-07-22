#!/usr/bin/env python3
"""Verify backticked repository paths in docs, guides, and skill trees.

Only spans that start with a known repository root, name a known root file, or
declare an ``../`` archive reference are path claims. Line suffixes are
stripped, globs must match, deliberately ignored local outputs may be described
before they exist, and missing operator-machine archive paths warn. Basename-only
references are deliberately outside this first version.
"""

from __future__ import annotations

from fnmatch import fnmatch
import json
from pathlib import Path
import re
import sys

from checker_common import Finding, run_checker


_PATH_ROOTS = (
    "src/",
    "docs/",
    "scripts/",
    "content/",
    "convex/",
    "public/",
    "fallow-baselines/",
    ".agent-local/",
    ".agents/",
    ".claude/",
    ".codex/",
    ".github/",
)
_ROOT_FILES = {
    ".env.example",
    ".fallowrc.json",
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docker-compose.yml",
    "eslint.config.mjs",
    "neon.ts",
    "package.json",
    "pnpm-lock.yaml",
    "postcss.config.mjs",
    "tsconfig.json",
    "vercel.json",
    "vitest.config.ts",
}
_SKIP_PREFIXES = ("dup:", "zone:", "sha256:")
_INLINE_CODE = re.compile(r"(?<!`)`([^`\n]+)`(?!`)")
_LINE_SUFFIX = re.compile(r":\d+(?:[-–—]\d+)?$")

# Deliberate historical references remain useful prose and are frozen by the
# owning version. Every entry is (source glob, normalized token, reason).
_ALLOWLIST = (
    (
        "docs/**",
        "src/features/auth/queries.ts",
        "deleted auth hub is a frozen historical example routed to the Workflow and docs backlog",
    ),
    (
        "docs/session-plans/3.9/3.9.1.1.md",
        "docs/COMMENT_STANDARD.md",
        "rejected design alternative records why the comment standard lives in AGENTS.md",
    ),
    (
        "docs/**",
        "src/lib/esi-datasets/types.ts",
        "approved future artifact created by Session 3.9.2.3.1",
    ),
    (
        "docs/**",
        "src/lib/esi-datasets/entries.ts",
        "approved future artifact created by Session 3.9.2.3.1",
    ),
    (
        "docs/**",
        "src/esi-datasets/checks.ts",
        "approved future artifact created by Session 3.9.2.3.1",
    ),
    (
        "docs/**",
        "src/esi-datasets/registry.test.ts",
        "approved future artifact created by Session 3.9.2.3.1",
    ),
    (
        "docs/**",
        "src/esi-datasets/",
        "approved future junction directory created by Session 3.9.2.3.1",
    ),
    (
        "docs/**",
        "src/lib/esi-datasets/freshness.ts",
        "approved future artifact created by Session 3.9.2.3.2",
    ),
    (
        "docs/**",
        "docs/ux-check/run-probes.mjs",
        "approved future artifact created by Session 3.9.2.5",
    ),
    (
        "docs/**",
        "docs/ux-check/probes/",
        "approved future probe-definitions directory created by Session 3.9.2.5",
    ),
    (
        "docs/backlog.md",
        "scripts/fallow-trial-log.mjs",
        "deferred stale-artifact cleanup remains owned by the 3.9.3.1 backlog triage",
    ),
    (
        "docs/**",
        "docs/ux-check/profiles/",
        "approved future gitignored profiler-output directory created by Session 3.9.3.4.1",
    ),
    (
        "docs/**",
        "docs/ux-check/profiles/3.9.3.4/normal/",
        "approved future gitignored per-mode evidence directory created by Session 3.9.3.4.2",
    ),
    (
        "docs/session-plans/3.9/3.9.3.5.md",
        "docs/UPDATE_WATCH_BASELINE.md",
        "approved future artifact created by Session 3.9.3.5",
    ),
    (
        "docs/session-plans/3.9/3.9.3.5.md",
        ".agent-local/check_update_watch_baseline.py",
        "approved future artifact created by Session 3.9.3.5",
    ),
    (
        "docs/session-plans/3.9/3.9.3.5.md",
        ".agent-local/update_watch_collect.py",
        "approved future artifact created by Session 3.9.3.5",
    ),
    (
        "docs/session-plans/3.9/3.9.3.5.md",
        ".claude/skills/update-watch/SKILL.md",
        "approved future artifact created by Session 3.9.3.5",
    ),
    (
        "docs/session-plans/3.9/3.9.3.5.md",
        ".agents/skills/update-watch/SKILL.md",
        "approved future artifact created by Session 3.9.3.5",
    ),
    (
        "docs/session-plans/3.9/3.9.1.5.md",
        ".agent-local/pr-privacy-local-patterns.txt",
        "approved deliberately-untracked local pattern file created by Session 3.9.1.5; never resolves on a fresh clone",
    ),
    (
        "docs/session-plans/3.9/3.9.5.1.md",
        "src/lib/eve-image.test.ts",
        "approved future artifact created by Session 3.9.5.1",
    ),
    (
        "docs/**",
        ".agent-local/comment-sweep/",
        "approved deliberately-untracked scratch tooling directory for the 3.9.1.7 slice (plans .1/.2 and the SCRATCHPAD handoff); deleted at sub-version close and never resolves on a fresh clone",
    ),
)

# RECORD documents preserve historical decisions or machine-owned lifecycle
# state. Each entry is (source glob, reason); only unresolved repository-path
# errors are exempted, while archive and relative-reference warnings still run.
_RECORD_SOURCES = (
    ("docs/session-plans/**", "approved implementation plans are frozen history"),
    ("docs/session-contracts/**", "approved session contracts are frozen history"),
    ("docs/version-audits/**", "version audit plans and evidence are frozen history"),
    ("docs/SCRATCHPAD.md", "session handoff history is a durable record"),
    ("docs/VERSION_*_PLAN.md", "the active roadmap is resolver-owned living state"),
    ("docs/backlog.md", "deferred work is machine-owned living state"),
    (
        "docs/CODE_HEALTH_BASELINE.md",
        "the health baseline is validated by purpose-built checkers",
    ),
)

# Old tokens retained in historical prose map to their verified archive homes.
# A missing operator-machine archive warns instead of blocking another machine.
_ARCHIVE_REDIRECTS = (
    (
        "docs/**",
        "docs/SCALING_AUDIT_FINDINGS.md",
        "../LGI Tools Document Archive/SCALING_AUDIT_FINDINGS.md",
        "completed scaling audit was archived",
    ),
    (
        "docs/**",
        "docs/3.7.9_VERIFIED_CONSTANTS.md",
        "../LGI Tools Document Archive/3.7.9_VERIFIED_CONSTANTS.md",
        "completed constants evidence was archived",
    ),
    (
        "docs/**",
        "docs/DEV_PERF_DIAGNOSIS.md",
        "../LGI Tools Document Archive/DEV_PERF_DIAGNOSIS.md",
        "dev-performance diagnosis was archived and remains future-session evidence",
    ),
    (
        "docs/**",
        "docs/3.6.7a-AUDIT-FINDINGS.md",
        "../LGI Tools Document Archive/3.6.7a-AUDIT-FINDINGS.md",
        "completed audit findings were archived",
    ),
    (
        "docs/**",
        "docs/HUB_SCOPED_MARKET_DATA.md",
        "../LGI Tools Document Archive/HUB_SCOPED_MARKET_DATA.md",
        "completed market-data ruling evidence was archived",
    ),
    (
        "docs/**",
        "docs/UI_SYSTEM_AUDIT_3_8_2_8.md",
        "../LGI Tools Document Archive/versions/3.8/UI_SYSTEM_AUDIT_3_8_2_8.md",
        "v3.8 UI audit was archived with its version bundle",
    ),
    (
        "docs/SCRATCHPAD.md",
        "docs/lgi-component-kit-lab.html",
        "../LGI Tools Document Archive/versions/3.8/lgi-component-kit-lab.html",
        "component lab was archived with the v3.8 bundle",
    ),
)


def _source_paths(root: Path) -> list[Path]:
    """Return the markdown surfaces whose inline path claims are authoritative."""
    candidates = list((root / "docs").rglob("*.md"))
    candidates.extend(
        root / raw_path
        for raw_path in ("AGENTS.md", "src/AGENTS.md", "CLAUDE.md", "src/CLAUDE.md")
    )
    for skill_root in (root / ".agents/skills", root / ".claude/skills"):
        candidates.extend(skill_root.glob("*/SKILL.md"))
    return sorted({path for path in candidates if path.is_file()})


def _normalized_path_claim(token: str) -> str | None:
    """Return the filesystem portion of one inline span, or None when not a claim."""
    token = token.strip()
    if token.startswith(_SKIP_PREFIXES):
        return None
    if any(marker in token for marker in ("<", ">", "{", "}", "…")):
        return None
    if re.search(r"(?:^|[/_.-])(?:X\.Y|X_Y|vX\.Y)(?:[/_.-]|$)", token):
        return None
    if token.startswith("../"):
        return _LINE_SUFFIX.sub("", token)
    if any(character.isspace() for character in token):
        return None
    if token.startswith(_PATH_ROOTS) or token in _ROOT_FILES:
        without_line = _LINE_SUFFIX.sub("", token)
        return without_line.partition("#")[0]
    return None


def _allowlisted(source: str, token: str) -> bool:
    """Return whether a path claim has a documented legacy exemption."""
    return any(
        fnmatch(source, source_glob) and token == allowed_token and bool(reason.strip())
        for source_glob, allowed_token, reason in _ALLOWLIST
    )


def _is_record_source(source: str) -> bool:
    """Return whether a scanned document is RECORD (exempt from path errors).

    RECORD is frozen history (prior/current plans, contracts, audits, and
    SCRATCHPAD) and machine-owned living state (the active roadmap, backlog,
    and code-health baseline). These legitimately reference archived, deleted,
    or not-yet-created paths, are never rewritten to satisfy this checker, and
    have their real validity owned by the resolver and check_baseline_claims —
    not by generic path existence. Only the plain unresolved-repository-path
    error is suppressed; archive-redirect and ``../`` warnings still fire.
    """
    return any(
        fnmatch(source, source_glob) and bool(reason.strip())
        for source_glob, reason in _RECORD_SOURCES
    )


def _archive_redirect(source: str, token: str) -> str | None:
    """Return a declared archive target for a historical repository token."""
    return next(
        (
            archive_target
            for source_glob, old_token, archive_target, reason in _ARCHIVE_REDIRECTS
            if fnmatch(source, source_glob)
            and token == old_token
            and bool(reason.strip())
        ),
        None,
    )


def _path_exists(root: Path, token: str) -> bool:
    """Return whether a literal or globbed repo path resolves."""
    # Literal existence wins: bracketed Next.js route segments like
    # `src/app/sites/[id]/page.tsx` are real paths, not character classes.
    if (root / token).exists():
        return True
    if any(character in token for character in "*?["):
        return any(root.glob(token))
    return False


def _ignored_paths(root: Path) -> tuple[str, ...]:
    """Return manifest-declared local paths that need not exist in a clean clone."""
    manifest_path = root / ".agent-local/policy-manifest.json"
    if not manifest_path.is_file():
        return ()
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return ()
    ignored = manifest.get("ignoredPaths", [])
    if not isinstance(ignored, list):
        return ()
    return tuple(
        raw_path.rstrip("/")
        for raw_path in ignored
        if isinstance(raw_path, str) and raw_path.rstrip("/")
    )


def _declared_ignored(token: str, ignored_paths: tuple[str, ...]) -> bool:
    """Return whether a repository path claim belongs to declared local state."""
    normalized = token.rstrip("/")
    return any(
        normalized == ignored_path or normalized.startswith(f"{ignored_path}/")
        for ignored_path in ignored_paths
    )


def collect_findings(root: Path) -> list[Finding]:
    """Report dead repository paths and missing operator-machine archive paths."""
    findings: list[Finding] = []
    ignored_paths = _ignored_paths(root)
    for path in _source_paths(root):
        source = path.relative_to(root).as_posix()
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(),
            start=1,
        ):
            for match in _INLINE_CODE.finditer(line):
                token = _normalized_path_claim(match.group(1))
                if (
                    token is None
                    or _allowlisted(source, token)
                    or _declared_ignored(token, ignored_paths)
                ):
                    continue
                redirected = _archive_redirect(source, token)
                if redirected is not None:
                    if not _path_exists(root, redirected):
                        findings.append(
                            Finding(
                                source,
                                line_number,
                                f"archive reference does not resolve: {redirected}",
                                "warn",
                            )
                        )
                    continue
                if token.startswith("../"):
                    if not _path_exists(root, token):
                        findings.append(
                            Finding(
                                source,
                                line_number,
                                f"archive reference does not resolve: {token}",
                                "warn",
                            )
                        )
                    continue
                if not _path_exists(root, token) and not _is_record_source(source):
                    findings.append(
                        Finding(
                            source,
                            line_number,
                            f"repository path does not resolve: {token}",
                            "error",
                        )
                    )
    return findings


def main() -> int:
    """Run the document-reference checker CLI."""
    return run_checker(collect_findings)


if __name__ == "__main__":
    sys.exit(main())
