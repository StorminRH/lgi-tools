---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approved LGI.tools
  implementation plan for one session contract. Normally dispatched by
  start-session; use directly only when the operator invokes `/plan-session`,
  asks to plan a named lifecycle session or contract, or when start-session
  finds no approved plan for the selected session. Generic feature-planning
  requests remain ordinary work. Includes mandatory adversarial review of every
  complete draft before approval.
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

Use the canonical Markdown result directly in chat. Report approval, the plan
path, and the fresh directive; create no separate prompt.
