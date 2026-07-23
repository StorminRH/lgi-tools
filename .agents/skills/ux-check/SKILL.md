---
name: ux-check
description: >-
  Run the LGI.tools scripted UX sweep at the end of a session that touched the
  UI. Figure out which routes the session changed, make sure the local dev server
  is up, run `pnpm ux-check` with the affected routes, and report the
  console/network findings + screenshots inline. Use the shared probe runner for
  durable interaction checks and focused open-state evidence. Use this skill
  whenever you've changed a user-facing surface and want to check it before Ryan's
  review — phrasings like "ux check", "sweep the UI", "capture the pages", "check
  how it looks", "verify the UI". Ryan still reviews visual + feel in his own
  browser; this sweep is complementary, not a replacement for his eyeball.
---

# Run the LGI.tools UX check

Procedure: `docs/workflows/ux-check.md`.

## Invocation authority

Invocation permits local route and interaction capture. Operator browser judgment remains required.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Return diagnostics and capture locations. Pause for operator review before PR creation.
