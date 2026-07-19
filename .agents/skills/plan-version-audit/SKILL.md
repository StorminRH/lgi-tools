---
name: plan-version-audit
description: >-
  Internal lifecycle handler that creates the approved execution plan for an
  LGI.tools version-close audit or on-demand periodic health pass. Normally
  dispatched by start-session; use directly for "plan the version audit", "prepare a
  health pass", "the version is complete", or when lifecycle resolution says
  an audit plan is needed.
---

# Plan an LGI.tools version audit

<!-- shared-policy-revision: 26 -->

Plan from `docs/VERSION_AUDIT.md` and `docs/DEVELOPMENT_LIFECYCLE.md` without
copying their procedure. `docs/DESIGN_PRINCIPLES.md` is the constitution and
`docs/CODE_HEALTH_BASELINE.md` supplies the previous comparison.

## Sequence

1. Run the lifecycle resolver and require its directive to name
   `plan-version-audit` as the handler for a lifecycle-driven Version close.
   Otherwise report the directive and return control to `start-session`; do not
   select a sibling handler here. An explicit on-demand request may instead
   select `Periodic`, which never archives the version.
   If a stale procedure digest interrupted an existing remediation cycle,
   preserve its audit-cycle history, `AF-NNN` finding ledger, statuses, and
   mapped sub-versions; reconcile the procedure rather than replacing evidence.
2. Require Codex Plan mode. Read the constitution and baseline first, then the
   audit procedure, master plan, contracts, session plans, changelog, SCRATCHPAD,
   backlog, and relevant live configuration.
3. Create a native Codex todo list for context reconciliation, measurement
   design, hotspot review, classification, baseline replacement, verification,
   and conditional archival.
4. Discuss the audit's intended shape with Ryan in plain English before
   drafting the plan. Produce an approval-ready audit plan naming the mode,
   exact version/ref,
   metrics and commands, artifact inventory, likely drift questions, baseline
   overwrite, verification, and—only for version close—archive destination.
5. Use task-scoped `gpt-5.6-sol` workers under `AGENTS.md` as useful to explore
   audit surfaces, design measurement workflows, and draft bounded sections.
   Give the complete plan and its evidence to a fresh read-only high
   adversarial reviewer, then reconcile every finding. The review budget is a
   hard cap of one mandatory pass plus at most one rerun after material
   reconciliation; later findings are reconciled by planner judgment and
   disclosed at approval.
6. Present a short plain-English summary alongside the reviewed audit plan
   before requesting Ryan's approval; Plan mode remains read-only.
7. After approval in execution mode, overwrite a new plan with `Audit status:
   Approved`, `Audit cycle: 1`, the full `Audited ref`, approval date, version,
   mode, procedure, and procedure-digest markers. When reconciling a stale
   in-progress plan, update only the approved procedure/scope while preserving
   its cycle evidence and finding ledger.
8. Rerun the resolver, report its new directive, run the agent drift check, and
   stop — planning outcomes are session-terminal. A session that planned an
   artifact never executes it; execution begins in a fresh `start-session`.
