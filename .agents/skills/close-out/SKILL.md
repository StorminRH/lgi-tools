---
name: close-out
description: >-
  Run LGI.tools' end-of-session sequence: verify and commit the current session,
  and for a complete sub-version run the required pre-PR design review before
  the PR/Greptile loop, clean merge, and production reconciliation. Use for
  "close out", "do the session end", "wrap up", "ship it", "run the Greptile
  loop", "finish up and merge", or "take this to merge". Invocation is
  conditional per-run authorization to merge only after every clean gate passes.
---

# Close out an LGI.tools session

Follow `docs/workflows/close-out.md` as the sole close-out sequence. The
canonical procedure owns the ordering and every shared step.

## Authorization

Invocation authorizes the current sub-version's squash merge only when the
current head has Greptile 5/5 with zero unresolved findings, green CI, and a
mergeable/CLEAN PR. It does not authorize merging past a failed gate or any
unrelated production action.

## Codex runtime mechanics

- Create a native Codex task list from the canonical procedure, keep one item in
  progress, and reopen only verification that a later change invalidates.
- When the procedure starts the PR-gate poll, launch it as a Codex background
  job and continue useful close-out work.
- When a Greptile justification awaits an inline reply on an unchanged head,
  use a Codex background job to watch for that reply.
