---
name: pre-pr-design-review
description: >-
  Run LGI.tools' required design-decay gate before a pull request or inside
  close-out. Use for "design review", "check before PR", "pre-PR review",
  "review the architecture before shipping", or whenever a final session is
  ready to enter the external PR review loop.
---

# Run the pre-PR design review

Procedure: `docs/workflows/pre-pr-design-review.md`.

## Invocation authority

Invocation permits read-only review. Parent-authorized fixes remain in scope. No delivery or archive authority is added.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Render the canonical design-review Markdown result exactly and without a code
fence. Preserve findings, invalidated verification, and PR-ready design notes.
