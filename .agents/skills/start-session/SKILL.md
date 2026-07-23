---
name: start-session
description: >-
  Public lifecycle entry that resolves and runs the next LGI.tools development
  stage from the master roadmap,
  session contracts, approved per-session plans, scratchpad, health baseline,
  and live repository state. Use when Ryan says "start the next session", "run
  session X", "work from the plan", "continue the version", or invokes
  `$start-session`. Missing contracts or plans are routed to the appropriate
  planning skill before implementation.
---

# Start an LGI.tools session

Procedure: `docs/workflows/start-session.md`.

## Invocation authority

Invocation permits only the resolver-selected action. Preserve its branch, artifact, gate, and pauses.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Return the dispatched result and fresh directive. Never select a sibling handler.
