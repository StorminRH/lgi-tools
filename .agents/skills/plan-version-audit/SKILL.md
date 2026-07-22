---
name: plan-version-audit
description: >-
  Internal lifecycle handler that creates the approved execution plan for an
  LGI.tools version-close audit or on-demand periodic health pass. Normally
  dispatched by start-session; use directly for "plan the version audit", "prepare a
  health pass", "the version is complete", or when lifecycle resolution says
  an audit plan is needed.
---

# Plan an LGI.tools version audit

Procedure: `docs/workflows/version-audit.md`.

## Invocation authority

Invocation authorizes the procedure's plan-version-audit entry mode. Audit artifacts remain unchanged until the operator approves the reviewed plan.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Return the approved audit plan and fresh directive. Do not execute it.
