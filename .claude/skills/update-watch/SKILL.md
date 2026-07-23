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

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Place the collector's Markdown summary directly in chat without alteration or a
code fence. Perform no other outward write.
