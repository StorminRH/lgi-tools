---
name: plan-audit-remediation
description: Convert open version-audit findings into approved remediation sub-versions and session contracts. Use when a completed audit requires remediation planning or the lifecycle resolver selects plan-audit-remediation.
---

# Plan audit remediation

Convert open Floss or Campaign findings into approved remediation topology and
contracts. Same classification, baseline, remediation, and archive rules as the
`version-audit` skill.

Planning persists only approved artifacts. Do not create session implementation
plans. No merge, deployment, production, or destructive-recovery authority.

## Procedure

1. Require resolver `plan-audit-remediation`. Read baseline, the audit plan
   ledger (`docs/workflows/schema/audit-plan.md`), master plan, schemas,
   and live code for open findings.
2. For every open Floss or Campaign, diagnose violated ownership, interface,
   change-axis, or coverage principle. Define end-state and characterization
   evidence; do not copy a metric.
3. Apply plan-version topology audit to the full finding set. Fewest safe
   bundles; map every open AF id; map no unaudited scope.
4. Present topology; invoke `adversarial-review` on topology and evidence;
   obtain approval before mutation.
5. Update roadmap topology, then contracts/index; mark mapped findings Planned;
   set Remediation in progress. Do not create session plans.
6. Rerun resolver and drift gate; report directive; stop.

After mapping, later sessions use normal session plans, branches, PRs, design
review, and close-out. In every mapped sub-version's delivering PR, mark its
finding Delivered so the marker is already authoritative when that PR merges.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Version audit: `REMEDIATION_PLANNED` | `BLOCKED`

- **Subject:** `<X.Y>` cycle <number or n/a>; <primary artifact or Not written>
- **Result:** <mode outcome; finding or baseline summary; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
