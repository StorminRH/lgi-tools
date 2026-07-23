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

Invocation permits the current change's squash merge only through the
canonical procedure's merge gate and only when the run is eligible to return
`MERGED`; `SESSION_HANDOFF` and `BLOCKED` never authorize a merge.
All documented gates must pass on the current head.
No unrelated production action is authorized.
The procedure selects planned or ordinary mode.
A missing directive means ordinary mode.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Run procedure polls with background Bash.
- Reopen only checks invalidated by later changes.

## Return

Render the canonical procedure's exact Markdown result unchanged, including the
delivery outcome and resolver field: a fresh directive in planned mode, or
`Not applicable` in ordinary mode.
