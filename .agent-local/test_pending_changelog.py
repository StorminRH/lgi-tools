#!/usr/bin/env python3
"""Fixture tests for the pending changelog fragment checker."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from check_pending_changelog import collect_findings


VALID = """---
date: 2026-07-22
source: out-of-band fix
---

#### Changed
- Something changed in plain language.

#### Fixed
- A concrete bug was fixed.
"""


class PendingChangelogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.pending = self.root / "content" / "changelog" / "pending"
        self.pending.mkdir(parents=True)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, name: str, body: str) -> None:
        (self.pending / name).write_text(body, encoding="utf-8")

    def messages(self) -> list[str]:
        return [finding.message for finding in collect_findings(self.root)]

    def test_valid_fragment_is_clean(self) -> None:
        self.write("2026-07-22-fix.md", VALID)
        self.assertEqual([], collect_findings(self.root))

    def test_missing_inbox_is_clean(self) -> None:
        # A repository without the inbox directory is a legal empty state.
        empty = Path(self.temporary.name) / "no-such-root"
        self.assertEqual([], collect_findings(empty))

    def test_empty_inbox_is_clean(self) -> None:
        self.assertEqual([], collect_findings(self.root))

    def test_readme_is_ignored(self) -> None:
        self.write("README.md", "# Inbox\n\nNot a fragment.\n")
        self.assertEqual([], collect_findings(self.root))

    def test_missing_frontmatter_is_rejected(self) -> None:
        self.write("x.md", "#### Changed\n- No frontmatter here.\n")
        self.assertTrue(any("frontmatter block" in m for m in self.messages()))

    def test_unterminated_frontmatter_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("not terminated" in m for m in self.messages()))

    def test_missing_date_is_rejected(self) -> None:
        self.write("x.md", "---\nsource: fix\n---\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("missing the required date" in m for m in self.messages()))

    def test_non_iso_date_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 22-07-2026\n---\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("ISO YYYY-MM-DD" in m for m in self.messages()))

    def test_impossible_calendar_date_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-02-30\n---\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("not a real calendar date" in m for m in self.messages()))

    def test_duplicate_frontmatter_key_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\ndate: 2026-07-23\n---\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("duplicate frontmatter key" in m for m in self.messages()))

    def test_markup_in_bullet_is_rejected(self) -> None:
        for body in (
            "#### Changed\n- A **bold** note.\n",
            "#### Changed\n- An `inline code` note.\n",
            "#### Changed\n- A [linked](https://example.com) note.\n",
        ):
            self.write("x.md", f"---\ndate: 2026-07-22\n---\n\n{body}")
            self.assertTrue(
                any("must be plain text" in m for m in self.messages()),
                msg=f"expected plain-text rejection for: {body!r}",
            )

    def test_unsupported_frontmatter_key_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\npr: 999\n---\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("unsupported frontmatter key" in m for m in self.messages()))

    def test_unsupported_category_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n---\n\n#### Security\n- Body.\n")
        self.assertTrue(any("unsupported category" in m for m in self.messages()))

    def test_version_heading_is_rejected(self) -> None:
        self.write(
            "x.md",
            "---\ndate: 2026-07-22\n---\n\n### v3.10.0.4 — 2026-07-22\n\n#### Changed\n- Body.\n",
        )
        self.assertTrue(any("version or master heading" in m for m in self.messages()))

    def test_master_heading_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n---\n\n## v3.10 — Theme\n\n#### Changed\n- Body.\n")
        self.assertTrue(any("version or master heading" in m for m in self.messages()))

    def test_empty_category_group_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n---\n\n#### Changed\n\n#### Fixed\n- Body.\n")
        self.assertTrue(any("has no bullets" in m for m in self.messages()))

    def test_bullet_without_category_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n---\n\n- Orphan bullet.\n")
        self.assertTrue(any("not under a #### <Category> group" in m for m in self.messages()))

    def test_no_category_group_is_rejected(self) -> None:
        self.write("x.md", "---\ndate: 2026-07-22\n---\n\nJust prose, no groups.\n")
        messages = self.messages()
        self.assertTrue(any("at least one #### <Category> group" in m for m in messages))

    def test_duplicate_bullet_across_fragments_is_rejected(self) -> None:
        note = "---\ndate: 2026-07-22\n---\n\n#### Changed\n- The very same note.\n"
        self.write("a.md", note)
        self.write("b.md", note)
        self.assertTrue(any("already defined in" in m for m in self.messages()))

    def test_duplicate_bullet_within_one_fragment_is_rejected(self) -> None:
        self.write(
            "a.md",
            "---\ndate: 2026-07-22\n---\n\n#### Changed\n- Copy-pasted note.\n- Copy-pasted note.\n",
        )
        self.assertTrue(any("duplicate Changed note within the fragment" in m for m in self.messages()))

    def test_same_bullet_different_category_is_allowed(self) -> None:
        self.write("a.md", "---\ndate: 2026-07-22\n---\n\n#### Changed\n- Shared wording.\n")
        self.write("b.md", "---\ndate: 2026-07-22\n---\n\n#### Fixed\n- Shared wording.\n")
        self.assertEqual([], collect_findings(self.root))

    def test_version_like_filename_is_rejected(self) -> None:
        self.write("v3.10.md", VALID)
        self.assertTrue(any("must not look like a published changelog file" in m for m in self.messages()))

    def test_preamble_filename_is_rejected(self) -> None:
        self.write("_preamble.md", VALID)
        self.assertTrue(any("must not look like a published changelog file" in m for m in self.messages()))


if __name__ == "__main__":
    unittest.main()
