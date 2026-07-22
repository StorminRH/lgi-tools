---
name: close-out
description: >-
  Run LGI.tools' end-of-session delivery in ordinary or planned mode: verify and
  commit the change, run the required pre-PR design review before the shared
  PR/Greptile loop, clean merge, and production proof, and for a planned
  sub-version publish the version and hand back to start-session. Use for
  "close out", "do the session end", "wrap up", "ship it", "run the Greptile
  loop", "finish up and merge", or "take this to merge". Invocation is
  conditional per-run authorization to merge only after every clean gate passes.
---

# Close out an LGI.tools session

Procedure: `docs/workflows/close-out.md`.

## Authorization

Invocation permits the current change's squash merge.
All documented gates must pass on the current head.
No unrelated production action is authorized.
The procedure selects planned or ordinary mode.
A missing directive means ordinary mode.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Run procedure polls as Codex background jobs.
- Reopen only checks invalidated by later changes.

## Return

Return the delivery outcome and fresh resolver directive.
