---
name: ux-check
description: >-
  Verify LGI.tools user-facing changes with the repository's scripted route
  sweep and shared interaction probes. Resolve affected routes, establish the
  required local stack, run `pnpm ux-check`, inspect diagnostics and captures,
  and return evidence before the operator's browser review. Use after changing a
  UI surface or when asked for a UX check, UI sweep, route capture, appearance
  check, or UI verification. Automated evidence never replaces operator visual
  and interaction judgment.
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

Render the procedure's Markdown result without a code fence. Include diagnostics
and capture locations, then pause for operator review.
