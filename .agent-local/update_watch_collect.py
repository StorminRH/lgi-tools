#!/usr/bin/env python3
"""Deterministic engine for the report-only update-watch routine.

Owns the required-source registry (names, watch domains, idRule
implementations) imported by check_update_watch_baseline.py.

Subcommand ``collect``: read the baseline, query the npm registry for each
dependency's latest version, run ``pnpm audit --json``, fetch each configured
watch URL raw, and enumerate ALL open GitHub issues whose title starts with
the exact ``Update watch`` prefix (paginated to exhaustion), parsing their
fenced update-watch-deltas key blocks. Emits one JSON state document to a
caller-supplied path outside the repository. Every fetch, query, listing,
truncation, or parse failure is recorded as a named failure; it never
guesses.

Subcommand ``finalize``: take the collect state plus the agent-judged
service/EVE item list, canonicalize ids per idRule, compute delta keys
(dep-major:<name>:<major>, advisory:<GHSA-id>, service:<name>:<id>,
eve:<name>:<id>), re-scan open issues immediately before the verdict, drop
keys present in open issues or the baseline's acknowledged sets (advisory
acknowledgements match only when observed applicability equals the recorded
appliesTo), and emit the verdict. FAIL-CLOSED, uniformly: if collect or the
re-scan recorded ANY named failure — registry, audit, service or EVE fetch,
issue listing, truncation, or parse — finalize refuses to emit a report
verdict AND marks the run ``refused``, never ``quiet``; a duplicate or
partial digest is worse than a missed day, and a run that fetched nothing
must not masquerade as a clean no-delta run.

Read-only by construction: no repository writes, no issue-creating
commands; the skill owns the single outward issue creation only on a
clean report verdict. Issue listing uses the GitHub REST API directly so
the collector runs identically in local shells and cloud sessions that
lack the ``gh`` CLI; a missing binary or transport failure is a named
failure, never a crash.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


ISSUE_TITLE_PREFIX = "Update watch"
DELTAS_FENCE = "update-watch-deltas"
BASELINE_PATH = "docs/UPDATE_WATCH_BASELINE.md"
_FETCH_TIMEOUT = 30
_USER_AGENT = "lgi-tools-update-watch/1.0"


@dataclass(frozen=True)
class Source:
    """One required watch source: identity slug, display name, exact domains."""

    slug: str
    name: str
    section: str
    domains: tuple[str, ...]
    id_rule: str


# The single owner of required sources and their exact watch domains; the
# baseline checker imports this instead of keeping a second inventory.
SOURCE_REGISTRY: tuple[Source, ...] = (
    Source("vercel-nextjs", "Vercel / Next.js", "services", ("vercel.com", "nextjs.org"), "url"),
    Source("neon", "Neon", "services", ("neon.com",), "url"),
    Source("convex", "Convex", "services", ("news.convex.dev",), "url"),
    Source("upstash", "Upstash", "services", ("upstash.com",), "url"),
    Source(
        "eve-developers-blog",
        "EVE Developers blog",
        "eveSurface",
        ("developers.eveonline.com",),
        "url",
    ),
    # The docs source watches the rendered site's sitemap URL set rather than
    # the esi-docs GitHub repo: cloud-session GitHub egress is scoped to the
    # routine's own repository, and the MkDocs sitemap build-stamps lastmod,
    # so new/removed pages surface by URL identity while in-place edits are a
    # documented non-signal (the dev blog announces material ESI changes).
    Source(
        "eve-developer-docs",
        "EVE developer documentation",
        "eveSurface",
        ("developers.eveonline.com",),
        "url",
    ),
)


def canonical_url(raw: str) -> str:
    """Canonicalize a URL id: lowercase scheme/host, strip query/fragment/trailing slash."""
    parts = urlsplit(raw.strip())
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


# Supported idRule names mapped to their canonical-id extraction.
ID_RULES = {"url": canonical_url}


def source_by_name(name: str) -> Source | None:
    """Return the registry source with this exact display name, if any."""
    return next((source for source in SOURCE_REGISTRY if source.name == name), None)


def parse_baseline(text: str) -> dict:
    """Parse the single fenced update-watch-baseline JSON block from the document.

    Raises ValueError when the fence is absent, duplicated, or not valid JSON;
    schema-level validation is the checker's job, not this parser's.
    """
    blocks = re.findall(r"```update-watch-baseline\n(.*?)```", text, re.DOTALL)
    if len(blocks) != 1:
        raise ValueError(f"expected exactly one update-watch-baseline block, found {len(blocks)}")
    return json.loads(blocks[0])


def parse_issue_keys(body: str) -> list[str]:
    """Return every delta key inside the issue body's fenced key blocks."""
    keys: list[str] = []
    for block in re.findall(rf"```{DELTAS_FENCE}\n(.*?)```", body or "", re.DOTALL):
        keys.extend(line.strip() for line in block.splitlines() if line.strip())
    return keys


def major_of(version: str) -> int:
    """Return the leading major of a semver-ish version string, or raise ValueError."""
    head = version.strip().split(".", 1)[0]
    if not head.isdigit():
        raise ValueError(f"unparseable version {version!r}")
    return int(head)


def dep_major_key(name: str, major: int) -> str:
    """Delta key for an unacknowledged dependency major."""
    return f"dep-major:{name}:{major}"


def advisory_key(ghsa_id: str) -> str:
    """Delta key for an unacknowledged or re-applicable advisory."""
    return f"advisory:{ghsa_id}"


def item_key(source: Source, canonical_id: str) -> str:
    """Delta key for a service or EVE-surface announcement item."""
    prefix = "service" if source.section == "services" else "eve"
    return f"{prefix}:{source.slug}:{canonical_id}"


def window_class(as_published: str | None, scan_since: str) -> str:
    """Classify an item against the discovery window.

    Undated items and items dated on/after scanSince (inclusive,
    source-published dates taken as-is) are ``in-window``; dated items before
    scanSince are ``backdated``. Both classes are reportable — identity alone
    decides them — the label only records how the item entered discovery.
    """
    if as_published is None or as_published >= scan_since:
        return "in-window"
    return "backdated"


def observed_applicability(module: str, vulnerable_range: str) -> str:
    """Render an advisory's observed applicability in the recorded appliesTo form."""
    return f"{module}@{vulnerable_range}"


def load_dependency_scopes(repo_root: Path) -> tuple[set[str], set[str]]:
    """Return (production, development) top-level dependency names from package.json.

    Used only to annotate advisories with a dev/prod scope hint for the report.
    A missing or unparseable manifest yields empty sets — scope then renders as
    ``unknown`` — because scope is presentational and never affects delta
    identity or the verdict, so it must not force a refusal.
    """
    try:
        manifest = json.loads((repo_root / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set(), set()
    return set(manifest.get("dependencies", {})), set(manifest.get("devDependencies", {}))


def classify_scope(paths: list[str], production: set[str], development: set[str]) -> str:
    """Classify an advisory as ``production`` or ``development`` by its audit paths.

    The first segment after the ``.>`` root of each `pnpm audit` dependency path
    is the top-level consumer. One production consumer makes the whole advisory
    production-scoped; otherwise it is development when every consumer is a known
    dev dependency, and ``unknown`` when neither set decides it (or scope data is
    unavailable).
    """
    tops = {
        segments[0]
        for path in paths
        if (segments := [seg for seg in path.split(">") if seg not in ("", ".")])
    }
    if not tops or not (production or development):
        return "unknown"
    if tops & production:
        return "production"
    if tops <= development:
        return "development"
    return "unknown"


def _fetch(url: str) -> tuple[int, str]:
    """GET one URL raw; returns (status, body) or raises on transport failure."""
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(request, timeout=_FETCH_TIMEOUT) as response:
        return response.status, response.read().decode("utf-8", "replace")


def nwo_from_remote_url(url: str) -> str | None:
    """Extract owner/repo from a GitHub or platform-proxy remote URL, or None.

    Cloud sessions clone through a local credential proxy whose remote looks
    like ``http://local_proxy@127.0.0.1:<port>/git/<owner>/<repo>``, so the
    github.com form is tried first and any ``/git/<owner>/<repo>`` tail second.
    """
    cleaned = url.strip()
    match = re.search(r"github\.com[:/]([^/]+/[^/\s]+?)(?:\.git)?/?$", cleaned)
    if match:
        return match.group(1)
    match = re.search(r"/git/([^/\s]+/[^/\s]+?)(?:\.git)?/?$", cleaned)
    return match.group(1) if match else None


def filter_update_watch_issues(raw_issues: list[dict]) -> list[dict]:
    """Reduce a REST issue listing to update-watch issues with parsed key blocks.

    Pull requests are dropped (the issues endpoint returns them too) and only
    titles starting with the exact ``Update watch`` prefix survive.
    """
    issues = []
    for issue in raw_issues:
        if "pull_request" in issue:
            continue
        title = issue.get("title", "")
        if not title.startswith(ISSUE_TITLE_PREFIX):
            continue
        issues.append(
            {
                "number": issue.get("number"),
                "title": title,
                "keys": parse_issue_keys(issue.get("body", "")),
            }
        )
    return issues


def _list_open_issues(repo_root: Path, failures: list[str]) -> list[dict]:
    """Enumerate all open update-watch issues exhaustively via the REST API.

    Uses urllib directly (no ``gh`` dependency — cloud sessions do not ship
    the CLI) with the origin remote for repo identity and an optional
    GH_TOKEN/GITHUB_TOKEN bearer header. Records a named failure (and returns
    []) when the repo identity or the listing cannot be established.
    """
    try:
        remote = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=repo_root,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        failures.append(f"issue-listing: git unavailable: {exc}")
        return []
    if remote.returncode != 0:
        failures.append(f"issue-listing: git remote lookup failed: {remote.stderr.strip()}")
        return []
    nwo = nwo_from_remote_url(remote.stdout)
    if nwo is None:
        failures.append(f"issue-listing: unrecognized origin remote {remote.stdout.strip()!r}")
        return []

    headers = {"User-Agent": _USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    raw_issues: list[dict] = []
    page = 1
    while True:
        url = f"https://api.github.com/repos/{nwo}/issues?state=open&per_page=100&page={page}"
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=_FETCH_TIMEOUT) as response:
                batch = json.loads(response.read().decode("utf-8", "replace"))
        except Exception as exc:  # noqa: BLE001 - each failure is named, never guessed
            failures.append(f"issue-listing: page {page} failed: {exc}")
            return []
        if not isinstance(batch, list):
            failures.append(f"issue-listing: page {page} returned a non-list payload")
            return []
        raw_issues.extend(batch)
        if len(raw_issues) >= 10_000:
            # Sanity cap: a listing this large means pagination went wrong;
            # refuse rather than trust a possibly truncated suppression set.
            failures.append(f"issue-listing-truncation: {len(raw_issues)} issues returned")
            return []
        if len(batch) < 100:
            return filter_update_watch_issues(raw_issues)
        page += 1


def _ensure_outside_repo(path: Path, repo_root: Path) -> None:
    """Refuse to write collector state inside the repository worktree."""
    resolved = path.resolve()
    if resolved.is_relative_to(repo_root.resolve()):
        raise SystemExit(f"state path {resolved} is inside the repository; use a temp path")


def run_collect(repo_root: Path, out_path: Path) -> int:
    """Gather baseline, npm, audit, watch-page, and open-issue state into one document."""
    _ensure_outside_repo(out_path, repo_root)
    failures: list[str] = []
    state: dict = {"failures": failures}

    baseline_file = repo_root / BASELINE_PATH
    try:
        baseline = parse_baseline(baseline_file.read_text(encoding="utf-8"))
        state["baseline"] = baseline
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        failures.append(f"baseline: {exc}")
        baseline = {}

    npm_latest: dict[str, dict] = {}
    state["npmLatest"] = npm_latest
    for name in sorted(baseline.get("dependencies", {})):
        try:
            status, body = _fetch(f"https://registry.npmjs.org/{name}/latest")
            if status != 200:
                raise ValueError(f"HTTP {status}")
            version = json.loads(body)["version"]
            npm_latest[name] = {"version": version, "major": major_of(version)}
        except Exception as exc:  # noqa: BLE001 - each failure is named, never guessed
            failures.append(f"registry-query:{name}: {exc}")

    try:
        audit = subprocess.run(
            ["pnpm", "audit", "--json"],
            cwd=repo_root,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        audit = None
        failures.append(f"audit: pnpm unavailable: {exc}")
    if audit is not None:
        # pnpm audit exits non-zero when advisories exist; only unparseable
        # output fails.
        try:
            audit_data = json.loads(audit.stdout)
            production, development = load_dependency_scopes(repo_root)
            advisories = []
            for advisory in audit_data.get("advisories", {}).values():
                findings = advisory.get("findings") or []
                installed = sorted({f.get("version") for f in findings if f.get("version")})
                paths = [path for f in findings for path in (f.get("paths") or [])]
                advisories.append(
                    {
                        "id": advisory.get("github_advisory_id"),
                        "module": advisory.get("module_name"),
                        "range": advisory.get("vulnerable_versions"),
                        "severity": advisory.get("severity"),
                        "title": advisory.get("title"),
                        "installed": ", ".join(installed),
                        "patched": advisory.get("patched_versions"),
                        "paths": paths,
                        "scope": classify_scope(paths, production, development),
                        "url": advisory.get("url"),
                    }
                )
            state["advisories"] = advisories
        except (json.JSONDecodeError, AttributeError) as exc:
            failures.append(f"audit: unparseable pnpm audit output: {exc}")

    watch: dict[str, dict] = {}
    state["watch"] = watch
    for source in SOURCE_REGISTRY:
        entries = baseline.get(source.section, [])
        entry = next((item for item in entries if item.get("name") == source.name), None)
        if entry is None:
            failures.append(f"watch:{source.slug}: source missing from baseline")
            continue
        pages: dict[str, dict] = {}
        watch[source.slug] = {"scanSince": entry.get("scanSince"), "pages": pages}
        for url in entry.get("watch", []):
            try:
                status, body = _fetch(url)
                if status != 200:
                    raise ValueError(f"HTTP {status}")
                pages[url] = {"status": status, "content": body}
            except Exception as exc:  # noqa: BLE001 - each failure is named, never guessed
                failures.append(f"watch:{source.slug}:{url}: {exc}")

    state["openIssues"] = _list_open_issues(repo_root, failures)
    out_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(f"collect: {len(failures)} failure(s), state -> {out_path}")
    return 0


def compute_deltas(state: dict, items: list[dict], failures: list[str]) -> list[dict]:
    """Compute unacknowledged delta candidates from collect state plus judged items.

    Returns one record per candidate key with the section, source, acknowledged
    state, and observed state the digest reports; suppression against open
    issues happens afterwards in the finalize verdict.
    """
    baseline = state.get("baseline", {})
    deltas: list[dict] = []

    acknowledged_advisories = {
        (entry.get("id"), entry.get("appliesTo"))
        for entry in baseline.get("acknowledgedAdvisories", [])
    }
    acknowledged_ids = {entry[0] for entry in acknowledged_advisories}
    for advisory in state.get("advisories", []):
        observed = observed_applicability(advisory.get("module", "?"), advisory.get("range", "?"))
        if (advisory.get("id"), observed) in acknowledged_advisories:
            continue
        previously = advisory.get("id") in acknowledged_ids
        deltas.append(
            {
                "key": advisory_key(advisory.get("id", "?")),
                "section": "Security advisories",
                "source": "pnpm audit",
                "acknowledged": (
                    "acknowledged with different applicability" if previously else "not acknowledged"
                ),
                "observed": f"{observed} ({advisory.get('severity', '?')}: {advisory.get('title', '?')})",
                "fields": {
                    "package": advisory.get("module", "?"),
                    "severity": advisory.get("severity", "?"),
                    "installed": advisory.get("installed") or "?",
                    "vulnerable": advisory.get("range", "?"),
                    "patched": advisory.get("patched") or "?",
                    "scope": advisory.get("scope", "unknown"),
                    "advisory": advisory.get("id", "?"),
                    "url": advisory.get("url"),
                },
            }
        )

    dependencies = baseline.get("dependencies", {})
    npm_latest = state.get("npmLatest", {})
    for name, entry in sorted(dependencies.items()):
        latest = npm_latest.get(name)
        if latest is None:
            continue  # the named registry-query failure already forces refusal
        acknowledged_major = entry.get("acknowledgedMajor")
        if isinstance(acknowledged_major, int) and latest["major"] > acknowledged_major:
            deltas.append(
                {
                    "key": dep_major_key(name, latest["major"]),
                    "section": "Major versions",
                    "source": "npm registry",
                    "acknowledged": f"major {acknowledged_major}",
                    "observed": f"latest {latest['version']} (major {latest['major']})",
                    "fields": {
                        "package": name,
                        "acknowledgedMajor": acknowledged_major,
                        "latest": latest["version"],
                        "latestMajor": latest["major"],
                    },
                }
            )

    for judged in items:
        source = source_by_name(judged.get("source", ""))
        if source is None:
            failures.append(f"judged-item: unknown source {judged.get('source')!r}")
            continue
        rule = ID_RULES[source.id_rule]
        url = judged.get("url")
        if not isinstance(url, str) or not url:
            failures.append(f"judged-item:{source.slug}: item without a url")
            continue
        canonical_id = rule(url)
        entry = next(
            (
                candidate
                for candidate in state.get("baseline", {}).get(source.section, [])
                if candidate.get("name") == source.name
            ),
            {},
        )
        if canonical_id in entry.get("acknowledgedItems", []):
            continue
        scan_since = entry.get("scanSince", "")
        deltas.append(
            {
                "key": item_key(source, canonical_id),
                "section": "Service/EVE surface changes",
                "source": source.name,
                "acknowledged": "not acknowledged",
                "observed": (
                    f"{judged.get('title', '?')} "
                    f"({judged.get('date') or 'undated'}, "
                    f"{window_class(judged.get('date'), scan_since)}) {canonical_id}"
                ),
                "fields": {
                    "source": source.name,
                    "title": judged.get("title", "?"),
                    "date": judged.get("date") or "undated",
                    "window": window_class(judged.get("date"), scan_since),
                    "link": canonical_id,
                },
            }
        )
    return deltas


def render_key_block(keys: list[str]) -> str:
    """Render the fenced delta-key block embedded in every digest issue."""
    body = "\n".join(keys)
    return f"```{DELTAS_FENCE}\n{body}\n```"


# Priority order the digest presents its sections in; also the render order.
SECTION_ORDER = (
    "Security advisories",
    "Major versions",
    "Service/EVE surface changes",
)

ABSORPTION_NOTE = (
    "## Absorption note\n\n"
    "During a normal session, add each reported canonical id to its source's "
    "`acknowledgedItems` (or raise `acknowledgedMajor` / record the advisory "
    "with its observed applicability) in `docs/UPDATE_WATCH_BASELINE.md`, then "
    "advance `scanSince` only once every currently in-window item for that "
    "source is acknowledged. Partial absorption keeps the window."
)


def _cell(value: object) -> str:
    """Render one Markdown table cell: coerce to str, escape pipes, flatten newlines.

    Feed titles and advisory text are untrusted, so a literal ``|`` is escaped
    to keep it inside its column and newlines are collapsed to a single space.
    """
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\r", " ").replace("\n", " ").strip()


def _advisory_link(fields: dict) -> str:
    """Render the advisory id as a Markdown link when a url is present, else plain."""
    identifier = _cell(fields.get("advisory", "?"))
    url = fields.get("url")
    return f"[{identifier}]({url})" if url else identifier


def _render_table(header: str, alignment: str, rows: list[str], empty: str) -> str:
    """Assemble a Markdown table, or return the ``empty`` line when there are no rows."""
    if not rows:
        return empty
    return "\n".join([header, alignment, *rows])


def render_advisory_section(deltas: list[dict]) -> str:
    """Render the security-advisory table. Version ranges are code-spanned so a
    literal ``<`` never renders as HTML — the escaping bug the prose form had."""
    rows = [
        (
            f"| `{_cell(f.get('package', '?'))}` | {_cell(f.get('severity', '?'))} "
            f"| `{_cell(f.get('installed', '?'))}` | `{_cell(f.get('vulnerable', '?'))}` "
            f"| `{_cell(f.get('patched', '?'))}` | {_cell(f.get('scope', 'unknown'))} "
            f"| {_advisory_link(f)} |"
        )
        for delta in deltas
        if (f := delta.get("fields", {}))
    ]
    return _render_table(
        "| Package | Severity | Installed | Vulnerable | Patched in | Scope | Advisory |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        rows,
        "No unacknowledged security advisories.",
    )


def render_major_section(deltas: list[dict]) -> str:
    """Render the acknowledged-major-vs-latest table for dependency deltas."""
    rows = [
        (
            f"| `{_cell(f.get('package', '?'))}` | {_cell(f.get('acknowledgedMajor', '?'))} "
            f"| `{_cell(f.get('latest', '?'))}` (major {_cell(f.get('latestMajor', '?'))}) |"
        )
        for delta in deltas
        if (f := delta.get("fields", {}))
    ]
    return _render_table(
        "| Package | Acknowledged major | Latest |",
        "| --- | --- | --- |",
        rows,
        "No unacknowledged major-version deltas.",
    )


def render_service_section(deltas: list[dict]) -> str:
    """Render the service/EVE announcement table with window classification."""
    rows = [
        (
            f"| {_cell(f.get('source', '?'))} | {_cell(f.get('title', '?'))} "
            f"| {_cell(f.get('date', 'undated'))} | {_cell(f.get('window', '?'))} "
            f"| {_cell(f.get('link', '?'))} |"
        )
        for delta in deltas
        if (f := delta.get("fields", {}))
    ]
    return _render_table(
        "| Source | Item | Published | Window | Link |",
        "| --- | --- | --- | --- | --- |",
        rows,
        "No unacknowledged service or EVE-surface changes.",
    )


_SECTION_RENDERERS = {
    "Security advisories": render_advisory_section,
    "Major versions": render_major_section,
    "Service/EVE surface changes": render_service_section,
}


def render_issue_body(deltas: list[dict]) -> str:
    """Render the full digest issue body verbatim for the skill to post.

    Emits the three priority-ordered sections as Markdown tables, each item
    naming its source and observed/patched-or-acknowledged state, then the
    fenced `update-watch-deltas` key block finalize suppresses against, then the
    absorption note. Deterministic and free of the run date, which the skill
    owns in the issue title — so nothing here is ever hand-authored or re-escaped.
    """
    by_section: dict[str, list[dict]] = {section: [] for section in SECTION_ORDER}
    for delta in deltas:
        by_section.setdefault(delta.get("section", ""), []).append(delta)
    parts = [
        f"## {section}\n\n{_SECTION_RENDERERS[section](by_section[section])}"
        for section in SECTION_ORDER
    ]
    parts.append(render_key_block([delta["key"] for delta in deltas]))
    parts.append(ABSORPTION_NOTE)
    return "\n\n".join(parts)


def render_summary(
    state: dict, candidate_count: int, suppressed: list[str], verdict: str
) -> str:
    """Render the mandatory end-of-run summary printed verbatim by the skill.

    ``candidate_count`` is the total number of candidates found before the
    refusal gate clears the reportable set, so a refused run's summary still
    tells the operator how many deltas were pending when it failed.
    """
    lines = ["update-watch end-of-run summary:"]
    for slug, source_state in sorted(state.get("watch", {}).items()):
        pages = source_state.get("pages", {})
        lines.append(f"- source {slug}: {len(pages)} page(s) fetched")
    lines.append(f"- dependencies checked: {len(state.get('npmLatest', {}))}")
    lines.append(
        "- advisory query: "
        + ("ok" if "advisories" in state else "failed")
        + f" ({len(state.get('advisories', []))} advisories observed)"
    )
    lines.append(f"- open update-watch issues scanned: {len(state.get('openIssues', []))}")
    lines.append(f"- candidates found: {candidate_count}")
    lines.append(f"- deltas suppressed by open issues: {len(suppressed)}")
    failures = state.get("failures", [])
    if failures:
        lines.append(f"- verdict: refused: {'; '.join(failures)}")
    else:
        lines.append(f"- verdict: {verdict}")
    lines.append(
        "- outward action: "
        + ("open one digest issue" if verdict == "report" else "none")
    )
    return "\n".join(lines)


def finalize_verdict(state: dict, items: list[dict], fresh_issues: list[dict]) -> dict:
    """Compute the fail-closed verdict payload from state, judged items, and re-scan.

    Pure: the caller supplies the freshly re-scanned open issues. Any named
    failure — carried from collect or added here — forces ``refused``, never
    ``quiet``.
    """
    failures: list[str] = list(state.get("failures", []))
    deltas = compute_deltas(state, items, failures)
    # The true candidate count is fixed before the refusal gate clears the
    # reportable set, so the summary never understates pending deltas.
    candidate_count = len(deltas)

    reported_keys = {key for issue in fresh_issues for key in issue.get("keys", [])}
    suppressed = [delta["key"] for delta in deltas if delta["key"] in reported_keys]
    remaining = [delta for delta in deltas if delta["key"] not in reported_keys]

    if failures:
        verdict = "refused"
        remaining = []
    elif remaining:
        verdict = "report"
    else:
        verdict = "quiet"

    summary_state = dict(state)
    summary_state["failures"] = failures
    return {
        "verdict": verdict,
        "failures": failures,
        "deltas": remaining,
        "suppressed": suppressed,
        "keyBlock": render_key_block([delta["key"] for delta in remaining]),
        "issueBody": render_issue_body(remaining) if verdict == "report" else "",
        "summary": render_summary(summary_state, candidate_count, suppressed, verdict),
    }


def run_finalize(repo_root: Path, state_path: Path, items_path: Path, out_path: Path) -> int:
    """Load state and judged items, re-scan open issues, and emit the verdict."""
    _ensure_outside_repo(out_path, repo_root)
    state = json.loads(state_path.read_text(encoding="utf-8"))
    try:
        items = json.loads(items_path.read_text(encoding="utf-8")).get("items", [])
    except (OSError, json.JSONDecodeError, AttributeError) as exc:
        state.setdefault("failures", []).append(f"judged-items: {exc}")
        items = []

    # Re-scan immediately before the verdict so a digest opened since collect
    # still suppresses; any re-scan failure joins the refusal set.
    rescan_failures: list[str] = []
    fresh_issues = _list_open_issues(repo_root, rescan_failures)
    state.setdefault("failures", []).extend(rescan_failures)

    payload = finalize_verdict(state, items, fresh_issues)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(payload["summary"])
    return 0


def main(argv: list[str] | None = None) -> int:
    """Run the collector CLI (subcommands: collect, finalize)."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    subcommands = parser.add_subparsers(dest="command", required=True)
    collect = subcommands.add_parser("collect")
    collect.add_argument("--out", type=Path, required=True)
    finalize = subcommands.add_parser("finalize")
    finalize.add_argument("--state", type=Path, required=True)
    finalize.add_argument("--items", type=Path, required=True)
    finalize.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    root = args.repo_root.resolve()
    if args.command == "collect":
        return run_collect(root, args.out)
    return run_finalize(root, args.state, args.items, args.out)


if __name__ == "__main__":
    sys.exit(main())
