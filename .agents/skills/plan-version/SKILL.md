---
name: plan-version
description: >-
  Internal lifecycle handler that turns an LGI.tools master version plan into
  approved, ordered session contracts. Normally dispatched by start-session;
  use directly when Ryan says
  "plan the version", "break this roadmap into sessions", "generate session
  contracts", "extrapolate the master plan", or when lifecycle resolution says
  contracts are missing or stale.
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

Return approved contracts and the fresh directive. Never create session plans here.
