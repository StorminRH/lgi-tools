---
name: resolve-update-watch
description: >-
  Resolve the open LGI.tools update-watch digest issue: fix the findings that
  are safely fixable, absorb the informational ones into the baseline, open a
  pull request, and drive it to a mergeable state without merging it. Use for
  "address the update watch", "handle the open digest issue", "fix the
  update-watch findings", or "resolve the update-watch issue".
---

# Resolve an update-watch digest

Procedure: `docs/workflows/resolve-update-watch.md`.

## Invocation authority

Invocation permits the bounded branch, fixes, disposition, and open PR. Merge remains unauthorized.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return fixed, deferred, and absorbed findings. Include review state; leave the PR open.
