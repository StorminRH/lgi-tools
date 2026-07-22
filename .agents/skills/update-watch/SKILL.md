---
name: update-watch
description: >-
  Report-only daily update watch for LGI.tools. Runs the deterministic
  collector against the committed acknowledged-state baseline, judges
  service/EVE announcement items from fetched watch content, and opens at
  most one GitHub digest issue for unreported deltas. Used by the scheduled
  lgi-update-watch cloud routine; never modifies the repository.
---

# Run the report-only update watch

Procedure: `docs/workflows/update-watch.md`.

## Invocation authority

Invocation permits one optional digest issue. Repository mutation remains excluded.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Print the collector summary verbatim. Perform no other outward write.
