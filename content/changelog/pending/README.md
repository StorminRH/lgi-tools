# Pending changelog fragments

This directory is the release-note inbox for ordinary, out-of-band work — changes
that ship on their own PR without bumping `APP_VERSION` or publishing a
`### vX.Y.N` heading.

- Each out-of-band change drops one uniquely named Markdown fragment here
  (convention: `YYYY-MM-DD-<slug>.md`).
- The **live changelog loader never reads this directory**, so fragments are
  invisible on the site until a planned release folds them into a public version
  entry and deletes them.
- The form and rules are defined in
  `docs/workflows/schema/changelog-pending.md` and enforced by
  `.agent-local/check_pending_changelog.py`.

This `README.md` is documentation, not a fragment; the checker ignores it.
