---
name: ux-check
description: >-
  Verify LGI.tools UI changes with the repository's scripted Playwright sweep.
  Determine the affected routes, reuse or start the local dev server, run
  `pnpm ux-check` for the affected routes at desktop and mobile sizes, inspect the JSON report
  and screenshots, run durable interaction definitions through the shared probe
  runner when needed, and present the
  evidence before Ryan's browser review. Use when asked to "run the UX check",
  "sweep/capture the UI", "check how it looks", or verify a user-facing change.
  This is complementary to—not a replacement for—Ryan's visual/feel review.
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

Return diagnostics and capture locations. Pause for operator review before PR creation.
