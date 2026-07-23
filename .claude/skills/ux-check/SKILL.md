---
name: ux-check
description: >-
  Verify LGI.tools user-facing changes with the scripted Playwright route sweep
  and shared interaction probes. Determine affected routes, establish the local
  stack they require, inspect desktop and mobile diagnostics and captures, and
  present evidence before the operator's browser review. Use after a UI change
  or when asked to run the UX check, sweep or capture the UI, check appearance,
  or verify a user-facing surface. Automated evidence does not replace operator
  visual and interaction judgment.
---

# Run the LGI.tools UX check

Procedure: `docs/workflows/ux-check.md`.

## Invocation authority

Invocation permits local route and interaction capture. Operator browser judgment remains required.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Use the canonical Markdown result directly in chat. Report diagnostics and
captures, then stop for the operator's browser review.
