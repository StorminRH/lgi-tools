---
name: plan-version
description: >-
  Internal lifecycle handler that turns an LGI.tools master version plan into
  approved, ordered session contracts. Normally dispatched by start-session;
  use directly for "plan the version", "break this roadmap into sessions", "generate
  session contracts", "extrapolate the master plan", or missing/stale contracts.
---

# Plan an LGI.tools version

Procedure: `docs/workflows/plan-version.md`.

## Invocation authority

Invocation permits read-only topology planning. Repository mutation requires operator approval.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Use the canonical Markdown result directly in chat. Include the approved
topology, contracts, and fresh directive; never create session plans here.
