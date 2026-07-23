---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approval-ready
  LGI.tools implementation plan for one session contract. Normally dispatched
  by start-session; use directly only when the operator names `plan-session`,
  asks to plan a named lifecycle session or contract, or when start-session
  finds that the selected session has no approved plan. Generic feature-planning
  requests remain ordinary work. Includes mandatory adversarial review of every
  complete draft before approval.
---

# Plan an LGI.tools session

Procedure: `docs/workflows/plan-session.md`.

## Invocation authority

Invocation authorizes read-only investigation and planning. Persist the canonical session plan only after explicit operator approval.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Render the procedure's Markdown result without a code fence. Include approval,
the plan path, and the fresh directive; do not begin execution.
