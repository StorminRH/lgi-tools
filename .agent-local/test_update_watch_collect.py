#!/usr/bin/env python3
"""Offline fixture tests for the update-watch collector's pure logic."""

from __future__ import annotations

import unittest

from update_watch_collect import (
    SOURCE_REGISTRY,
    advisory_key,
    canonical_url,
    compute_deltas,
    dep_major_key,
    filter_update_watch_issues,
    finalize_verdict,
    item_key,
    major_of,
    nwo_from_remote_url,
    parse_baseline,
    parse_issue_keys,
    render_key_block,
    source_by_name,
    window_class,
)


def baseline_with(**overrides: object) -> dict:
    """Return a minimal valid baseline state, overridable per test."""
    baseline = {
        "dependencies": {"clsx": {"acknowledgedMajor": 1}},
        "acknowledgedAdvisories": [],
        "services": [
            {
                "name": "Neon",
                "watch": ["https://neon.com/docs/changelog/rss.xml"],
                "idRule": "url",
                "scanSince": "2026-07-19",
                "acknowledgedItems": [],
            }
        ],
        "eveSurface": [
            {
                "name": "EVE Developers blog",
                "watch": ["https://developers.eveonline.com/feed.xml"],
                "idRule": "url",
                "scanSince": "2026-07-19",
                "acknowledgedItems": [],
            }
        ],
    }
    baseline.update(overrides)
    return baseline


def state_with(**overrides: object) -> dict:
    """Return a minimal collect-state document, overridable per test."""
    state = {
        "failures": [],
        "baseline": baseline_with(),
        "npmLatest": {"clsx": {"version": "2.1.1", "major": 2}},
        "advisories": [],
        "watch": {},
        "openIssues": [],
    }
    state.update(overrides)
    return state


class KeyGrammarTests(unittest.TestCase):
    def test_delta_keys_use_the_documented_grammar(self) -> None:
        neon = source_by_name("Neon")
        blog = source_by_name("EVE Developers blog")
        self.assertEqual("dep-major:clsx:2", dep_major_key("clsx", 2))
        self.assertEqual("advisory:GHSA-aaaa-bbbb-cccc", advisory_key("GHSA-aaaa-bbbb-cccc"))
        self.assertEqual("service:neon:https://neon.com/x", item_key(neon, "https://neon.com/x"))
        self.assertEqual(
            "eve:eve-developers-blog:https://developers.eveonline.com/blog/x",
            item_key(blog, "https://developers.eveonline.com/blog/x"),
        )

    def test_canonical_url_lowercases_and_strips(self) -> None:
        self.assertEqual(
            "https://neon.com/changelog",
            canonical_url("HTTPS://Neon.com/changelog/?utm=1#frag"),
        )
        self.assertEqual("https://neon.com/", canonical_url("https://neon.com/"))

    def test_major_of_accepts_semver_and_rejects_garbage(self) -> None:
        self.assertEqual(16, major_of("16.2.10"))
        with self.assertRaises(ValueError):
            major_of("v16.2.10")


class ParsingTests(unittest.TestCase):
    def test_parse_baseline_requires_exactly_one_fence(self) -> None:
        text = '```update-watch-baseline\n{"dependencies": {}}\n```\n'
        self.assertEqual({"dependencies": {}}, parse_baseline(text))
        with self.assertRaises(ValueError):
            parse_baseline("no fence here")
        with self.assertRaises(ValueError):
            parse_baseline(text + text)

    def test_parse_issue_keys_reads_all_fenced_blocks(self) -> None:
        body = (
            "Digest\n```update-watch-deltas\ndep-major:clsx:2\n\nadvisory:GHSA-a-b-c\n```\n"
            "more\n```update-watch-deltas\nservice:neon:https://neon.com/x\n```\n"
        )
        self.assertEqual(
            ["dep-major:clsx:2", "advisory:GHSA-a-b-c", "service:neon:https://neon.com/x"],
            parse_issue_keys(body),
        )
        self.assertEqual([], parse_issue_keys(None))

    def test_render_key_block_round_trips_through_the_parser(self) -> None:
        keys = ["dep-major:clsx:2", "advisory:GHSA-a-b-c"]
        self.assertEqual(keys, parse_issue_keys(render_key_block(keys)))

    def test_nwo_parses_https_and_ssh_remotes(self) -> None:
        self.assertEqual(
            "StorminRH/lgi-tools",
            nwo_from_remote_url("https://github.com/StorminRH/lgi-tools.git"),
        )
        self.assertEqual(
            "StorminRH/lgi-tools",
            nwo_from_remote_url("git@github.com:StorminRH/lgi-tools.git"),
        )
        self.assertEqual(
            "StorminRH/lgi-tools",
            nwo_from_remote_url("https://github.com/StorminRH/lgi-tools"),
        )
        self.assertEqual(
            "StorminRH/lgi-tools",
            nwo_from_remote_url("http://local_proxy@127.0.0.1:41729/git/StorminRH/lgi-tools"),
        )
        self.assertIsNone(nwo_from_remote_url("https://example.com/not/github"))

    def test_issue_filter_drops_pull_requests_and_foreign_titles(self) -> None:
        issues = filter_update_watch_issues(
            [
                {"number": 1, "title": "Update watch — 2026-07-19", "body": render_key_block(["advisory:GHSA-a-b-c"])},
                {"number": 2, "title": "Update watch — 2026-07-18", "pull_request": {}, "body": ""},
                {"number": 3, "title": "Unrelated bug report", "body": render_key_block(["dep-major:x:9"])},
            ]
        )
        self.assertEqual(1, len(issues))
        self.assertEqual(["advisory:GHSA-a-b-c"], issues[0]["keys"])


class WindowTests(unittest.TestCase):
    def test_same_day_and_later_items_are_in_window(self) -> None:
        self.assertEqual("in-window", window_class("2026-07-19", "2026-07-19"))
        self.assertEqual("in-window", window_class("2026-07-20", "2026-07-19"))

    def test_undated_items_are_always_in_window(self) -> None:
        self.assertEqual("in-window", window_class(None, "2026-07-19"))

    def test_backdated_items_are_labeled_but_still_reportable(self) -> None:
        self.assertEqual("backdated", window_class("2026-07-01", "2026-07-19"))
        state = state_with(npmLatest={"clsx": {"version": "1.9.9", "major": 1}})
        failures: list[str] = []
        deltas = compute_deltas(
            state,
            [
                {
                    "source": "Neon",
                    "title": "Backdated entry",
                    "date": "2026-07-01",
                    "url": "https://neon.com/docs/changelog/2026-07-01",
                }
            ],
            failures,
        )
        self.assertEqual([], failures)
        self.assertEqual(
            ["service:neon:https://neon.com/docs/changelog/2026-07-01"],
            [delta["key"] for delta in deltas],
        )
        self.assertIn("backdated", deltas[0]["observed"])


class DeltaTests(unittest.TestCase):
    def test_dependency_delta_only_above_acknowledged_major(self) -> None:
        state = state_with(
            baseline=baseline_with(
                dependencies={"clsx": {"acknowledgedMajor": 1}, "zod": {"acknowledgedMajor": 4}}
            ),
            npmLatest={
                "clsx": {"version": "2.1.1", "major": 2},
                "zod": {"version": "4.4.3", "major": 4},
            },
        )
        deltas = compute_deltas(state, [], [])
        self.assertEqual(["dep-major:clsx:2"], [delta["key"] for delta in deltas])

    def test_unacknowledged_advisory_reports(self) -> None:
        state = state_with(
            advisories=[
                {
                    "id": "GHSA-aaaa-bbbb-cccc",
                    "module": "vite",
                    "range": ">=8.0.0 <=8.0.15",
                    "severity": "high",
                    "title": "bad",
                }
            ]
        )
        state["baseline"]["dependencies"] = {}
        deltas = compute_deltas(state, [], [])
        self.assertEqual(["advisory:GHSA-aaaa-bbbb-cccc"], [delta["key"] for delta in deltas])

    def test_acknowledged_advisory_with_same_applicability_is_suppressed(self) -> None:
        state = state_with(
            baseline=baseline_with(
                dependencies={},
                acknowledgedAdvisories=[
                    {"id": "GHSA-aaaa-bbbb-cccc", "appliesTo": "vite@>=8.0.0 <=8.0.15"}
                ],
            ),
            npmLatest={},
            advisories=[
                {
                    "id": "GHSA-aaaa-bbbb-cccc",
                    "module": "vite",
                    "range": ">=8.0.0 <=8.0.15",
                    "severity": "high",
                    "title": "bad",
                }
            ],
        )
        self.assertEqual([], compute_deltas(state, [], []))

    def test_advisory_recurs_when_observed_applicability_changes(self) -> None:
        state = state_with(
            baseline=baseline_with(
                dependencies={},
                acknowledgedAdvisories=[
                    {"id": "GHSA-aaaa-bbbb-cccc", "appliesTo": "vite@>=8.0.0 <=8.0.15"}
                ],
            ),
            npmLatest={},
            advisories=[
                {
                    "id": "GHSA-aaaa-bbbb-cccc",
                    "module": "vite",
                    "range": ">=7.0.0 <=8.0.15",
                    "severity": "high",
                    "title": "bad",
                }
            ],
        )
        deltas = compute_deltas(state, [], [])
        self.assertEqual(["advisory:GHSA-aaaa-bbbb-cccc"], [delta["key"] for delta in deltas])
        self.assertIn("different applicability", deltas[0]["acknowledged"])

    def test_partial_absorption_reports_only_unacknowledged_items(self) -> None:
        state = state_with(npmLatest={"clsx": {"version": "1.9.9", "major": 1}})
        state["baseline"]["services"][0]["acknowledgedItems"] = [
            "https://neon.com/docs/changelog/2026-07-17"
        ]
        deltas = compute_deltas(
            state,
            [
                {
                    "source": "Neon",
                    "title": "Absorbed",
                    "date": "2026-07-17",
                    "url": "https://neon.com/docs/changelog/2026-07-17",
                },
                {
                    "source": "Neon",
                    "title": "New",
                    "date": "2026-07-24",
                    "url": "https://neon.com/docs/changelog/2026-07-24",
                },
            ],
            [],
        )
        self.assertEqual(
            ["service:neon:https://neon.com/docs/changelog/2026-07-24"],
            [delta["key"] for delta in deltas],
        )

    def test_item_ids_canonicalize_before_comparison(self) -> None:
        state = state_with(npmLatest={"clsx": {"version": "1.9.9", "major": 1}})
        state["baseline"]["services"][0]["acknowledgedItems"] = [
            "https://neon.com/docs/changelog/2026-07-17"
        ]
        deltas = compute_deltas(
            state,
            [
                {
                    "source": "Neon",
                    "title": "Same entry, noisy URL",
                    "date": "2026-07-17",
                    "url": "HTTPS://NEON.com/docs/changelog/2026-07-17/?ref=feed",
                }
            ],
            [],
        )
        self.assertEqual([], deltas)

    def test_unknown_judged_source_is_a_named_failure(self) -> None:
        failures: list[str] = []
        compute_deltas(
            state_with(),
            [{"source": "Nonexistent", "title": "x", "date": None, "url": "https://x.example/"}],
            failures,
        )
        self.assertEqual(1, len(failures))
        self.assertIn("unknown source", failures[0])


class VerdictTests(unittest.TestCase):
    def test_clean_delta_run_reports(self) -> None:
        payload = finalize_verdict(state_with(), [], [])
        self.assertEqual("report", payload["verdict"])
        self.assertEqual(["dep-major:clsx:2"], [delta["key"] for delta in payload["deltas"]])
        self.assertIn("dep-major:clsx:2", payload["keyBlock"])
        self.assertIn("verdict: report", payload["summary"])

    def test_open_issue_suppression_yields_quiet(self) -> None:
        payload = finalize_verdict(
            state_with(),
            [],
            [{"number": 1, "title": "Update watch — 2026-07-19", "keys": ["dep-major:clsx:2"]}],
        )
        self.assertEqual("quiet", payload["verdict"])
        self.assertEqual(["dep-major:clsx:2"], payload["suppressed"])
        self.assertIn("outward action: none", payload["summary"])

    def test_zero_candidate_clean_run_is_quiet(self) -> None:
        state = state_with(npmLatest={"clsx": {"version": "1.9.9", "major": 1}})
        payload = finalize_verdict(state, [], [])
        self.assertEqual("quiet", payload["verdict"])
        self.assertEqual([], payload["suppressed"])

    def test_every_failure_class_forces_refusal_never_quiet(self) -> None:
        failure_classes = [
            "registry-query:clsx: HTTP 503",
            "audit: unparseable pnpm audit output: boom",
            "watch:neon:https://neon.com/docs/changelog/rss.xml: HTTP 500",
            "watch:eve-developers-blog:https://developers.eveonline.com/feed.xml: timeout",
            "issue-listing: git unavailable: [Errno 2] No such file or directory: 'git'",
            "issue-listing: page 1 failed: HTTP Error 403: rate limit exceeded",
            "issue-listing-truncation: 10000 issues returned",
            "audit: pnpm unavailable: [Errno 2] No such file or directory: 'pnpm'",
            "baseline: expected exactly one update-watch-baseline block, found 0",
            "judged-items: Expecting value: line 1 column 1 (char 0)",
        ]
        for failure in failure_classes:
            with self.subTest(failure=failure):
                # Even a state with zero candidates refuses; it must not
                # masquerade as a clean no-delta run.
                state = state_with(
                    failures=[failure],
                    npmLatest={"clsx": {"version": "1.9.9", "major": 1}},
                )
                payload = finalize_verdict(state, [], [])
                self.assertEqual("refused", payload["verdict"])
                self.assertEqual([], payload["deltas"])
                self.assertIn(f"refused: {failure}", payload["summary"])

    def test_refusal_beats_a_pending_report(self) -> None:
        state = state_with(failures=["registry-query:zod: HTTP 503"])
        payload = finalize_verdict(state, [], [])
        self.assertEqual("refused", payload["verdict"])
        self.assertEqual([], payload["deltas"])

    def test_refused_summary_still_counts_pending_candidates(self) -> None:
        # A failure clears the reportable set, but the operator still needs to
        # see how many deltas were pending — the count must not read zero.
        state = state_with(failures=["watch:neon:https://neon.com/x: HTTP 500"])
        payload = finalize_verdict(state, [], [])
        self.assertEqual("refused", payload["verdict"])
        self.assertEqual([], payload["deltas"])
        self.assertIn("candidates found: 1", payload["summary"])
        self.assertIn("deltas suppressed by open issues: 0", payload["summary"])


class RegistryTests(unittest.TestCase):
    def test_registry_covers_all_required_sources_once(self) -> None:
        names = [source.name for source in SOURCE_REGISTRY]
        self.assertEqual(sorted(set(names)), sorted(names))
        self.assertEqual(
            {"Vercel / Next.js", "Neon", "Convex", "Upstash"},
            {source.name for source in SOURCE_REGISTRY if source.section == "services"},
        )
        self.assertEqual(
            {"EVE Developers blog", "EVE developer documentation"},
            {source.name for source in SOURCE_REGISTRY if source.section == "eveSurface"},
        )


if __name__ == "__main__":
    unittest.main()
