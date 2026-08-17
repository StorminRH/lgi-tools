---
name: plan-version-audit
description: Create and approve an execution plan for a version-close audit or requested periodic health audit. Use before running an audit when no current approved audit plan exists or the lifecycle resolver selects plan-version-audit.
---

# Plan a version audit

Create and approve an audit execution plan. Same classification, baseline,
remediation, and archive rules as the `version-audit` skill.

Planning persists only the approved artifact. No merge, deployment, production,
or destructive-recovery authority.

## Procedure

1. Require resolver `plan-version-audit` for lifecycle Version close. Explicit
   operator request may select Periodic (never archives).
2. Read baseline, master plan, contracts, session plans, changelog,
   and relevant open `[Backlog]` GitHub Issues.
3. Design measurements, commands, artifact inventory, hotspot/drift questions,
   baseline replacement, verification, and any version-close archive destination.
4. Present the shape; invoke `adversarial-review` on the complete plan and
   evidence; obtain operator approval. Do not auto-relaunch.
5. Persist an Approved cycle-1 plan using
   `docs/workflows/schema/audit-plan.md`. Do not write a procedure digest.
6. Rerun resolver and drift gate; report directive; stop.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Version audit: `PLANNED` | `BLOCKED`

- **Subject:** `<X.Y>` cycle <number or n/a>; <primary artifact or Not written>
- **Result:** <mode outcome; finding or baseline summary; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
