---
name: start-session
description: >-
  Public lifecycle entry that resolves and runs the next LGI.tools stage from
  its roadmap, contracts, approved
  session plans, scratchpad, health baseline, and live repository state. Use for
  "start the next session", "run session X", "work from the plan", or
  "continue the version", or invoke `/start-session` directly. Missing
  artifacts route to the owning planning skill.
---

# Start an LGI.tools session

Procedure: `docs/workflows/start-session.md`.

## Invocation authority

Invocation permits only the resolver-selected action. Preserve its branch, artifact, gate, and pauses.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Use the canonical Markdown result directly in chat. Carry through the handler
result and complete fresh directive without selecting a sibling.
