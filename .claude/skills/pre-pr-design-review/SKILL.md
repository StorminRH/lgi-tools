---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review", or
  when a final session is ready for external review.
---

# Run the pre-PR design review

Follow `docs/PRE_PR_DESIGN_REVIEW.md` as the sole design-review procedure. It
owns the ordering, judgment rules, evidence requirements, result form, and stop
conditions.

## Claude Code runtime mechanics

- Create a native Claude Code task list from the procedure and its final
  return-to-verification task. Keep one item active.
- Attach each phase's required evidence before completing its task.
- Return the procedure's exact result form to `close-out`. Reopen every review
  or verification task invalidated by a fix.

This skill grants no authority to open, merge, deploy, or archive anything.
