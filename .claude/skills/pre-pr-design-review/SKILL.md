---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review", or
  when a final session is ready for external review.
---

# Run the pre-PR design review

Procedure: `docs/workflows/pre-pr-design-review.md`.

## Invocation authority

Invocation permits read-only review. Parent-authorized fixes remain in scope. No delivery or archive authority is added.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return the canonical procedure's exact result block unchanged, including the
finding dispositions, invalidated verification, and `Design notes:` block.
