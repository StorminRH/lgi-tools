#!/usr/bin/env python3
"""Fixture tests for the deterministic pending-fragment fold."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from fold_pending_changelog import fold, read_fragments, render


class FoldPendingChangelogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.pending = self.root / "content" / "changelog" / "pending"
        self.pending.mkdir(parents=True)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, name: str, date: str, body: str) -> None:
        (self.pending / name).write_text(f"---\ndate: {date}\n---\n\n{body}", encoding="utf-8")

    def test_missing_inbox_folds_to_nothing(self) -> None:
        empty = Path(self.temporary.name) / "none"
        self.assertEqual([], read_fragments(empty))
        self.assertEqual("", render(fold(read_fragments(empty), "1.0")))

    def test_fold_orders_by_date_then_filename_and_groups_by_category(self) -> None:
        # Deliberately out of order on disk; the fold must be deterministic.
        self.write("z-late.md", "2026-07-22", "#### Changed\n- Third change.\n")
        self.write("a-early.md", "2026-07-20", "#### Changed\n- First change.\n#### Fixed\n- A fix.\n")
        self.write("m-mid.md", "2026-07-20", "#### Changed\n- Second change.\n")
        folded = fold(read_fragments(self.root), "3.10.0.4")
        categories = [category for category, _ in folded]
        # Canonical category order: Changed before Fixed.
        self.assertEqual(["Changed", "Fixed"], categories)
        changed = dict(folded)["Changed"]
        # Ordering: (2026-07-20, a-early), (2026-07-20, m-mid), (2026-07-22, z-late).
        self.assertEqual(
            [
                "First change. — included since v3.10.0.4",
                "Second change. — included since v3.10.0.4",
                "Third change. — included since v3.10.0.4",
            ],
            changed,
        )
        self.assertEqual(["A fix. — included since v3.10.0.4"], dict(folded)["Fixed"])

    def test_render_produces_changelog_entry_markdown(self) -> None:
        self.write("a.md", "2026-07-20", "#### Added\n- A feature.\n")
        rendered = render(fold(read_fragments(self.root), "3.10.0.4"))
        self.assertEqual("#### Added\n- A feature. — included since v3.10.0.4", rendered)

    def test_readme_is_not_a_fragment(self) -> None:
        (self.pending / "README.md").write_text("# Inbox\n", encoding="utf-8")
        self.write("a.md", "2026-07-20", "#### Added\n- A feature.\n")
        fragments = read_fragments(self.root)
        self.assertEqual(["a.md"], [fragment.name for fragment in fragments])

    def test_non_fragment_filenames_are_skipped(self) -> None:
        # The fold helper mirrors the checker's inbox filter: README.md,
        # _preamble.md, and version-like names are never treated as fragments.
        (self.pending / "_preamble.md").write_text("## v9.9 — Theme\n", encoding="utf-8")
        (self.pending / "v3.10.md").write_text("### v3.10.0.1 — 2026-07-20\n", encoding="utf-8")
        self.write("a.md", "2026-07-20", "#### Added\n- A feature.\n")
        self.assertEqual(["a.md"], [fragment.name for fragment in read_fragments(self.root)])

    def test_fold_is_a_pure_function_of_present_fragments(self) -> None:
        # A fragment added later is not retroactively consumed: the fold only ever
        # reflects what is present when it runs, so late fragments stay queued.
        self.write("first.md", "2026-07-20", "#### Fixed\n- Present at cutoff.\n")
        before = [fragment.name for fragment in read_fragments(self.root)]
        self.assertEqual(["first.md"], before)
        self.write("second.md", "2026-07-25", "#### Fixed\n- Arrived after the cutoff.\n")
        after = [fragment.name for fragment in read_fragments(self.root)]
        self.assertEqual(["first.md", "second.md"], after)


if __name__ == "__main__":
    unittest.main()
