---
name: version-audit
description: >-
  Internal lifecycle handler that executes an approved LGI.tools version audit
  or health pass, fully replaces the
  live baseline, and archive a completed version bundle only after its audit.
  Use for "version audit", "baseline the codebase", "health pass", "refresh the
  baseline", or "finish the version audit". Normally dispatched by start-session
  except for an explicitly requested periodic health pass.
---

# Run an LGI.tools version audit

Procedure: `docs/workflows/version-audit.md`.

## Invocation authority

Invocation permits audit-local records. Archival is permitted only after the
clean-close checks and baseline replacement are complete and the resolver
returns `archive-needed`. No merge or deployment is authorized.
No production or destructive-recovery authority is authorized.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return the reconciled audit state and fresh directive. Do not predict siblings.
