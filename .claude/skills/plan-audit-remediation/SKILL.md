---
name: plan-audit-remediation
description: >-
  Internal lifecycle handler that extends an LGI.tools master version with
  approved sub-versions and session contracts for every actionable version-close
  audit finding. Normally dispatched by start-session; use directly for
  "plan audit remediation", "fix the audit before archive", "extend the
  version for audit findings", or audit-remediation-plan-needed.
---

# Plan LGI.tools audit remediation

Procedure: `docs/workflows/version-audit.md`.

## Invocation authority

Invocation permits remediation planning. Unaudited product scope remains excluded.

## Claude Code runtime mechanics

- Create native Claude tasks; keep one active.
- Use background Bash for long-running work.
- Request fresh read-only review when the procedure requires it.

## Return

Return the approved roadmap and contracts. Include the fresh directive; create no plans.
