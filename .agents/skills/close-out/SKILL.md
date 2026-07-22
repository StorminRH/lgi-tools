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

Follow `docs/workflows/close-out.md` as the sole close-out sequence. The
canonical procedure owns the ordering, mode selection, and every shared step.

## Authorization

Invocation authorizes the current change's squash merge only when the current
head has Greptile 5/5 with zero unresolved findings, green CI, and a
mergeable/CLEAN PR. It does not authorize merging past a failed gate or any
unrelated production action. Mode is the procedure's to choose: planned when
`start-session` passed a valid resolver directive, ordinary otherwise, and the
absence of a directive is normal.

## Codex runtime mechanics

- Create a native Codex task list from the canonical procedure, keep one item in
  progress, and reopen only verification that a later change invalidates.
- When the procedure starts the PR-gate poll, launch it as a Codex background
  job and continue useful close-out work.
- When a Greptile justification awaits an inline reply on an unchanged head,
  use a Codex background job to watch for that reply.
