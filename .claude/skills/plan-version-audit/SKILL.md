---
name: plan-version-audit
description: >-
  Internal lifecycle handler that creates an approved execution plan for an
  LGI.tools version-close audit or on-demand health pass. Normally dispatched by
  start-session; use directly for "plan the version audit", "prepare a health
  pass", "the version is complete", or a missing audit plan.
---

# Plan an LGI.tools version audit

Procedure: `docs/workflows/version-audit.md`.

## Invocation authority

Invocation authorizes the procedure's plan-version-audit entry mode. Audit artifacts remain unchanged until the operator approves the reviewed plan.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return the approved audit plan and fresh directive. Do not execute it.
