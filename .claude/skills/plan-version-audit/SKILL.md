---
name: plan-version-audit
description: >-
  Internal lifecycle handler that creates an approved execution plan for an
  LGI.tools version-close audit or on-demand health pass. Normally dispatched by
  start-session; use directly for "plan the version audit", "prepare a health
  pass", "the version is complete", or a missing audit plan.
---

# Plan an LGI.tools version audit

<!-- shared-policy-revision: 16 -->

Run the resolver and require its directive to name `plan-version-audit` as the
handler for lifecycle-driven Version close. Otherwise report it and return
control to `start-session`; never select a sibling handler here. An explicit
on-demand Periodic plan remains allowed and never archives. Use Claude Code Plan mode
and sequence `docs/VERSION_AUDIT.md` with
`docs/DEVELOPMENT_LIFECYCLE.md`. Read `docs/DESIGN_PRINCIPLES.md` and the current
`docs/CODE_HEALTH_BASELINE.md` first. A version-close mode requires every roadmap
row terminal; an explicit on-demand run may be Periodic and never archives.
If a stale procedure digest interrupts an existing remediation cycle, preserve
its cycle history, `AF-NNN` finding ledger, statuses, and mapped sub-versions.

Create a native Claude Code task list for reconciliation, measurement design, hotspot review,
classification, baseline replacement, verification, and conditional archival.
Present a plan naming mode, version/ref, commands, artifact inventory, baseline
overwrite, and archive destination when applicable. Wait for Ryan's approval,
then write a new `docs/version-audits/X.Y/PLAN.md` with `Audit status: Approved`,
`Audit cycle: 1`, the full `Audited ref`,
`Audit mode: Periodic` or `Audit mode: Version close`, and the required
procedure-digest markers in
execution mode. For stale-plan reconciliation, update the approved procedure
without erasing execution evidence. Rerun the resolver, report its new
directive, run the drift check, and stop — planning outcomes are
session-terminal; execution begins in a fresh `start-session`.
