#!/usr/bin/env python3
"""Fixture tests for the update-watch baseline checker."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from check_update_watch_baseline import collect_findings
from update_watch_collect import SOURCE_REGISTRY

import check_agent_drift


_REAL_ROOT = Path(__file__).resolve().parents[1]


def valid_block(dependencies: dict | None = None) -> dict:
    """Build a schema-valid baseline block from the collector's own registry."""
    block: dict = {
        "dependencies": dependencies if dependencies is not None else {"zod": {"acknowledgedMajor": 4}},
        "acknowledgedAdvisories": [
            {"id": "GHSA-aaaa-bbbb-cccc", "appliesTo": "vite@>=8.0.0 <=8.0.15"}
        ],
        "services": [],
        "eveSurface": [],
    }
    for source in SOURCE_REGISTRY:
        block[source.section].append(
            {
                "name": source.name,
                # Slug-unique paths keep watch URLs globally distinct even when
                # two sources share a domain (both EVE sources do).
                "watch": [f"https://{domain}/{source.slug}/feed.xml" for domain in source.domains],
                "idRule": source.id_rule,
                "scanSince": "2026-07-19",
                "acknowledgedItems": [],
            }
        )
    return block


class BaselineFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "docs").mkdir()

    def close(self) -> None:
        self.temporary.cleanup()

    def write_package(self, dependencies: dict, dev_dependencies: dict) -> None:
        (self.root / "package.json").write_text(
            json.dumps({"dependencies": dependencies, "devDependencies": dev_dependencies}),
            encoding="utf-8",
        )

    def write_baseline(self, block: dict | str) -> None:
        body = block if isinstance(block, str) else json.dumps(block, indent=2)
        (self.root / "docs/UPDATE_WATCH_BASELINE.md").write_text(
            f"# Baseline\n\n```update-watch-baseline\n{body}\n```\n",
            encoding="utf-8",
        )


class BaselineCheckerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = BaselineFixture()
        self.fixture.write_package({"zod": "^4.4.3"}, {})

    def tearDown(self) -> None:
        self.fixture.close()

    def messages(self) -> list[str]:
        return [finding.render() for finding in collect_findings(self.fixture.root)]

    def test_complete_baseline_is_green(self) -> None:
        self.fixture.write_baseline(valid_block())
        self.assertEqual([], self.messages())

    def test_dev_dependency_union_is_required(self) -> None:
        self.fixture.write_package({"zod": "^4.4.3"}, {"vitest": "^4.1.7"})
        self.fixture.write_baseline(valid_block())
        self.assertEqual(1, len(self.messages()))
        self.assertIn("dependency vitest from package.json is missing", self.messages()[0])

    def test_stale_extra_dependency_reports_with_line(self) -> None:
        block = valid_block({"zod": {"acknowledgedMajor": 4}, "leftpad": {"acknowledgedMajor": 1}})
        self.fixture.write_baseline(block)
        [message] = self.messages()
        self.assertIn("baseline dependency leftpad is not in package.json", message)
        path = self.fixture.root / "docs/UPDATE_WATCH_BASELINE.md"
        expected_line = next(
            number
            for number, line in enumerate(path.read_text().splitlines(), start=1)
            if '"leftpad"' in line
        )
        self.assertTrue(message.startswith(f"docs/UPDATE_WATCH_BASELINE.md:{expected_line}:"))

    def test_invalid_acknowledged_major_variants_report(self) -> None:
        for bad in (-1, "2", True, None):
            with self.subTest(bad=bad):
                self.fixture.write_baseline(valid_block({"zod": {"acknowledgedMajor": bad}}))
                self.assertEqual(1, len(self.messages()))
                self.assertIn("non-negative integer acknowledgedMajor", self.messages()[0])

    def test_malformed_advisory_id_and_applies_to_report(self) -> None:
        block = valid_block()
        block["acknowledgedAdvisories"] = [{"id": "CVE-2026-1", "appliesTo": "no-at-range"}]
        self.fixture.write_baseline(block)
        messages = self.messages()
        self.assertEqual(2, len(messages))
        self.assertIn("not a GHSA id", messages[0])
        self.assertIn("appliesTo in <package>@<observed range> form", messages[1])

    def test_missing_required_service_source_reports(self) -> None:
        block = valid_block()
        block["services"] = [entry for entry in block["services"] if entry["name"] != "Neon"]
        self.fixture.write_baseline(block)
        self.assertEqual(1, len(self.messages()))
        self.assertIn("required source Neon is missing from services", self.messages()[0])

    def test_missing_required_eve_source_reports(self) -> None:
        block = valid_block()
        block["eveSurface"] = [
            entry for entry in block["eveSurface"] if entry["name"] != "EVE developer documentation"
        ]
        self.fixture.write_baseline(block)
        self.assertEqual(1, len(self.messages()))
        self.assertIn("required source EVE developer documentation is missing", self.messages()[0])

    def test_wrong_watch_domain_fails_the_exact_domain_lock(self) -> None:
        block = valid_block()
        neon = next(entry for entry in block["services"] if entry["name"] == "Neon")
        neon["watch"] = ["https://neon.tech/changelog/rss.xml"]
        self.fixture.write_baseline(block)
        self.assertEqual(1, len(self.messages()))
        self.assertIn("watch domains", self.messages()[0])

    def test_duplicate_source_name_reports(self) -> None:
        block = valid_block()
        block["services"].append(dict(block["services"][0]))
        self.fixture.write_baseline(block)
        self.assertTrue(any("appears more than once" in message for message in self.messages()))

    def test_duplicate_watch_url_reports(self) -> None:
        block = valid_block()
        upstash = next(entry for entry in block["services"] if entry["name"] == "Upstash")
        docs = next(
            entry for entry in block["eveSurface"] if entry["name"] == "EVE developer documentation"
        )
        docs_url = docs["watch"][0]
        upstash_extra = dict(upstash)
        # Duplicate an existing URL inside one source's own list.
        upstash_extra["watch"] = [upstash["watch"][0], upstash["watch"][0]]
        block["services"][block["services"].index(upstash)] = upstash_extra
        self.fixture.write_baseline(block)
        self.assertTrue(any("is duplicated" in message for message in self.messages()))
        self.assertIn(docs_url, json.dumps(block))  # unrelated URLs stay unique

    def test_unknown_id_rule_reports(self) -> None:
        block = valid_block()
        block["services"][0]["idRule"] = "title-hash"
        self.fixture.write_baseline(block)
        self.assertEqual(1, len(self.messages()))
        self.assertIn("idRule 'title-hash' is not in the registry", self.messages()[0])

    def test_unknown_source_name_reports(self) -> None:
        block = valid_block()
        block["services"].append(
            {
                "name": "Cloudflare",
                "watch": ["https://cloudflare.com/x"],
                "idRule": "url",
                "scanSince": "2026-07-19",
                "acknowledgedItems": [],
            }
        )
        self.fixture.write_baseline(block)
        self.assertTrue(
            any("is not in the collector's registry" in message for message in self.messages())
        )

    def test_malformed_date_watch_and_items_report(self) -> None:
        block = valid_block()
        neon = next(entry for entry in block["services"] if entry["name"] == "Neon")
        neon["scanSince"] = "07/19/2026"
        neon["watch"] = "not-a-list"
        neon["acknowledgedItems"] = [1]
        self.fixture.write_baseline(block)
        messages = self.messages()
        self.assertTrue(any("non-empty watch URL list" in message for message in messages))
        self.assertTrue(any("scanSince must be YYYY-MM-DD" in message for message in messages))
        self.assertTrue(any("list of canonical id strings" in message for message in messages))

    def test_missing_fence_malformed_json_and_absent_files_report(self) -> None:
        (self.fixture.root / "docs/UPDATE_WATCH_BASELINE.md").write_text("no fence", "utf-8")
        self.assertIn("baseline block is unusable", self.messages()[0])
        self.fixture.write_baseline("{not json")
        self.assertIn("baseline block is unusable", self.messages()[0])
        (self.fixture.root / "docs/UPDATE_WATCH_BASELINE.md").unlink()
        self.assertEqual(
            ["docs/UPDATE_WATCH_BASELINE.md:1: update-watch baseline is missing"],
            self.messages(),
        )

    def test_absent_and_malformed_package_json_report(self) -> None:
        self.fixture.write_baseline(valid_block())
        (self.fixture.root / "package.json").unlink()
        self.assertEqual(["package.json:1: package.json is missing"], self.messages())
        (self.fixture.root / "package.json").write_text("{oops", "utf-8")
        self.assertIn("package.json is malformed", self.messages()[0])


class DriftIntegrationTests(unittest.TestCase):
    def test_seeded_bad_baseline_surfaces_through_the_real_drift_runner(self) -> None:
        fixture = BaselineFixture()
        self.addCleanup(fixture.close)
        fixture.write_package({"zod": "^4.4.3"}, {})
        block = valid_block()
        block["services"][0]["idRule"] = "title-hash"
        fixture.write_baseline(block)
        agent_local = fixture.root / ".agent-local"
        agent_local.mkdir()
        for name in (
            "checker_common.py",
            "update_watch_collect.py",
            "check_update_watch_baseline.py",
        ):
            shutil.copy(_REAL_ROOT / ".agent-local" / name, agent_local / name)

        errors: list[str] = []
        warnings = check_agent_drift.check_lifecycle_checkers(
            errors,
            root=fixture.root,
            checkers=(".agent-local/check_update_watch_baseline.py",),
        )
        self.assertEqual([], warnings)
        self.assertEqual(1, len(errors))
        self.assertIn("idRule 'title-hash' is not in the registry", errors[0])

    def test_update_watch_checker_is_registered_in_the_drift_tuple(self) -> None:
        self.assertIn(
            ".agent-local/check_update_watch_baseline.py",
            check_agent_drift.LIFECYCLE_CHECKERS,
        )


if __name__ == "__main__":
    unittest.main()
