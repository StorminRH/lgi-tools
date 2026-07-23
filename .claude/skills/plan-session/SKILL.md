---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approved LGI.tools
  implementation plan for one session contract. Normally dispatched by
  start-session; use directly for "plan this", "start a session on...", "design this feature",
  "let's build X", or when start-session finds no approved current plan.
  Includes mandatory adversarial review of every complete draft before approval.
---

# Plan an LGI.tools session

Procedure: `docs/workflows/plan-session.md`.

## Invocation authority

Invocation authorizes read-only investigation and planning. Persist the canonical session plan only after explicit operator approval.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return the approved plan path and fresh directive. Create no separate prompt.
