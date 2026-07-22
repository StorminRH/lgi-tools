---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review",
  "review the architecture before shipping", or whenever a final session is
  ready to enter the external PR review loop.
---

# Run the pre-PR design review

Follow `docs/PRE_PR_DESIGN_REVIEW.md` as the sole design-review procedure. It
owns the ordering, judgment rules, evidence requirements, result form, and stop
conditions.

## Codex runtime mechanics

- Create a native Codex task list from the procedure and its final
  return-to-verification task. Keep one item in progress.
- Attach each phase's required evidence before completing its task.
- Return the procedure's exact result form to `close-out`. Reopen every review
  or verification task invalidated by a fix.

This skill grants no authority to open, merge, deploy, or archive anything.
