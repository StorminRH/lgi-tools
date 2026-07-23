---
name: plan-version
description: >-
  Internal lifecycle handler that turns an LGI.tools master version plan into
  approved, ordered session contracts. Normally dispatched by start-session;
  use directly when the operator says "plan the version", "break this roadmap
  into sessions", "generate session contracts", or "extrapolate the master
  plan", or when lifecycle resolution says contracts are missing or stale.
---

# Plan an LGI.tools version

Procedure: `docs/workflows/plan-version.md`.

## Invocation authority

Invocation permits read-only topology planning. Repository mutation requires operator approval.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Render the procedure's Markdown result without a code fence. Include topology,
contracts, approval, and the fresh directive; create no session plan.
