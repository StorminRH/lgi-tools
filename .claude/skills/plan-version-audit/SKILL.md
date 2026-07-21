---
name: plan-version-audit
description: >-
  Internal lifecycle handler that creates an approved execution plan for an
  LGI.tools version-close audit or on-demand health pass. Normally dispatched by
  start-session; use directly for "plan the version audit", "prepare a health
  pass", "the version is complete", or a missing audit plan.
---

# Plan an LGI.tools version audit

Run the resolver and require its directive to name `plan-version-audit` as the
handler for lifecycle-driven Version close. Otherwise report it and return
control to `start-session`; never select a sibling handler here. An explicit
on-demand Periodic plan remains allowed and never archives. Use Claude Code Plan mode
and sequence `docs/VERSION_AUDIT.md` with the resolver directive. Read
`docs/DESIGN_PRINCIPLES.md` and the current
`docs/CODE_HEALTH_BASELINE.md` first. A version-close mode requires every roadmap
row terminal; an explicit on-demand run may be Periodic and never archives.
If a stale procedure digest interrupts an existing remediation cycle, preserve
its cycle history, `AF-NNN` finding ledger, statuses, and mapped sub-versions.

Create a native Claude Code task list for reconciliation, measurement design, hotspot review,
classification, baseline replacement, verification, and conditional archival.
Discuss the audit's intended shape with Ryan in plain English before drafting
the plan.
Present a plan naming mode, version/ref, commands, artifact inventory, baseline
overwrite, and archive destination when applicable. Give the complete plan and
its evidence to a fresh read-only Claude subagent for high-effort adversarial
review, reconcile every finding, then
present it; the review budget is a hard cap of one mandatory pass plus at most
one rerun after material reconciliation, with later findings reconciled by
planner judgment and disclosed at approval. Present a short plain-English summary alongside the formal audit
plan before requesting Ryan's approval. Wait for approval, then write a new
`docs/version-audits/X.Y/PLAN.md` with `Audit status: Approved`,
`Audit cycle: 1`, the full `Audited ref`,
`Audit mode: Periodic` or `Audit mode: Version close`, and the required
procedure-digest markers in
execution mode. For stale-plan reconciliation, update the approved procedure
without erasing execution evidence. Rerun the resolver, report its new
directive, run the drift check, and stop — planning outcomes are
session-terminal; execution begins in a fresh `start-session`.
