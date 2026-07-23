---
name: version-audit
description: >-
  Internal lifecycle handler that executes an approved LGI.tools version audit
  or periodic health pass, fully replaces the live code-health baseline, and
  archives a completed version bundle
  only after the version-close audit passes. Use for "version audit", "baseline
  the codebase", "health pass", "refresh the baseline", or "finish the version
  audit". Normally dispatched by start-session except for an explicitly requested
  periodic health pass.
---

# Run an LGI.tools version audit

Procedure: `docs/workflows/version-audit.md`.

## Invocation authority

Invocation permits audit-local records. Archival is permitted only after the
clean-close checks and baseline replacement are complete and the resolver
returns `archive-needed`. No merge or deployment is authorized.
No production or destructive-recovery authority is authorized.

## Codex runtime mechanics

- Create native Codex tasks; keep one active.
- Use the long-lived terminal for commands and polling.
- Request fresh read-only review when the procedure requires it.

## Return

Render the procedure's Markdown result for the active audit mode without a code
fence. Include reconciled state and the fresh directive; do not predict siblings.
