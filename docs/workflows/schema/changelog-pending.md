# Pending changelog fragment form

Ordinary, out-of-band work does not bump `APP_VERSION` or publish a
`### vX.Y.N` heading. Instead it drops one release-note fragment into the
pending inbox at `content/changelog/pending/`, and a later planned release folds
those fragments into its public version entry. The live changelog loader never
reads this directory, so a pending fragment is invisible on the site until a
planned release publishes it.

One fragment describes one out-of-band change. Give each fragment a unique file
name so parallel changes never collide in a shared section — a
`YYYY-MM-DD-<slug>.md` name (the record date plus a short slug) is the
convention. A fragment file name must not match the live master pattern
`vX.Y.md` and must not be `_preamble.md`, so it can never be mistaken for a
published changelog file.

Use this exact shape:

```markdown
---
date: YYYY-MM-DD
source: <optional one-line provenance>
---

#### Changed
- One plain-language change per bullet.

#### Removed
- One plain-language change per bullet.
```

Rules the pending checker (`.agent-local/check_pending_changelog.py`) enforces:

- **Frontmatter.** A leading `---` … `---` block with keys drawn only from
  `date` and `source`. `date` is required and is the ISO `YYYY-MM-DD` record or
  ship date of the out-of-band change (the day the change was made — provenance
  that also fixes the deterministic fold order). `source` is optional free text
  such as a branch name or short description; do not wait for a PR number the
  PR does not have yet. Any other key is rejected.
- **Body.** One or more `#### <Category>` groups using only the closed set
  `Added`, `Changed`, `Fixed`, and `Removed` (the same vocabulary as
  `docs/workflows/schema/changelog-entry.md`). Each retained group has one or
  more `- ` bullets. Write user-facing work in plain pilot language and internal
  work in a plain sentence a teammate can understand. Do not use bold, inline
  code, or links.
- **No version heading.** A fragment must not contain a `### vX.Y.N — date`
  entry heading or any `## ` master heading; the version is unknown until the
  planned release absorbs it.
- **No duplicates.** Two fragments must not carry the identical bullet under the
  identical category.

`README.md` in the inbox is documentation, not a fragment, and is ignored.

## How a planned release absorbs fragments

At planned close-out, after syncing with current `origin/main` so fragments
already merged there are present, the release folds every pending fragment into
the new `### vX.Y.N — YYYY-MM-DD` entry. The deterministic ordering, grouping,
and provenance are produced by
`python3 .agent-local/fold_pending_changelog.py --prior-version <previous-version>`,
which prints the folded Markdown and the exact list of consumed fragment files:

1. Order fragments deterministically by `date`, then by file name.
2. Group their bullets by category in the canonical `Added`, `Changed`,
   `Fixed`, `Removed` order, after the version's own bullets for that category.
3. Because these changes shipped out-of-band before the rollup deployed, mark
   each folded bullet so the site does not imply it first deployed with the
   rollup — append a plain-text provenance clause such as
   `— included since v<previous-version>`.
4. Delete every consumed fragment file in the same release PR. Git retains the
   history, and deletion prevents a fragment from being published twice.

Anything merged into `content/changelog/pending/` after that cutoff stays
pending for the following planned release.
