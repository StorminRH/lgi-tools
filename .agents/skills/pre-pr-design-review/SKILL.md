---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review",
  "review the architecture before shipping", or whenever a final session is
  ready to enter the external PR review loop.
---

# Run the pre-PR design review

<!-- shared-policy-revision: 27 -->

Follow `docs/PRE_PR_DESIGN_REVIEW.md` in full. It owns the review; this skill
sequences it. `docs/DESIGN_PRINCIPLES.md` is the constitution and
`docs/CODE_HEALTH_BASELINE.md` is the current hotspot record.

## Sequence

1. Read the constitution, baseline, approved session plan, complete branch diff,
   and the review document before judging the change.
2. Create a native Codex todo list from every numbered review section and keep
   one item in progress.
3. Run the review against delivered behavior and design, not filenames alone.
   Record evidence and classify every finding as blocking, in-scope fix, or
   genuinely out of scope under the owning document's rules.
4. Fix in-scope findings before the PR gate can pass, then rerun every affected
   review and verification item.
5. If any measured hotspot surface, override, suppression, duplication state,
   or campaign status changed, update the relevant rows in
   `docs/CODE_HEALTH_BASELINE.md` in the same change.
6. Put the concise result in the PR body's canonical `## Notes` section and
   return control to `close-out` before it opens the PR.

This skill grants no authority to open, merge, deploy, or archive anything.
