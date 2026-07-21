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

<!-- shared-policy-revision: 28 -->

Use Claude Code Plan mode and the native task list. Require the lifecycle
resolver directive to name `plan-audit-remediation` as the handler. Otherwise
report it and return control to `start-session`; never select a sibling handler
or create a separate prompt/remediation execution artifact here.

Read `docs/DESIGN_PRINCIPLES.md`, `docs/workflows/schema/session-contract.md`,
`docs/workflows/schema/session-plan.md`,
`docs/PRE_PR_DESIGN_REVIEW.md`, and `docs/VERSION_AUDIT.md` in full and in that
order. Then read the resolver directive, current baseline, audit plan
and `AF-NNN` ledger, `docs/CODE_HEALTH_BASELINE.md`, master plan, SCRATCHPAD,
relevant backlog, Graphify output, and live code.

For every open Floss or Campaign, diagnose the principle-level ownership,
interface, change-axis, or coverage problem. Define the end-state, compare two
decompositions, record the rejected alternative, and require characterization
before structural moves. Metrics do not justify fragmenting a cohesive deep
function. Group findings into independently shippable sub-versions, map every
finding to one or more contracts, and give every contract dependencies,
behavior locks, acceptance gates, baseline effect, design-review evidence, and
normal close-out.

Discuss the extension's intended shape with Ryan in plain English before
drafting sub-versions or contracts. Give the complete extension,
contract set, ledger, and evidence to a fresh read-only high `gpt-5.6-sol`
adversarial reviewer and reconcile every finding; the review budget is a hard cap of one
mandatory pass plus at most one rerun after material reconciliation, with
later findings reconciled by planner judgment and disclosed at approval.
Present a short plain-English summary
alongside the reviewed extension before requesting Ryan's approval. Do not
write files before approval. After approval in execution mode, append the
roadmap rows, reconcile the contract index/files, mark mapped findings Planned,
set the audit to Remediation in progress, and update SCRATCHPAD. Do not write
session implementation plans.
Rerun the resolver, report its new directive, run the drift check, and stop —
planning outcomes are session-terminal; execution begins in a fresh
`start-session`. All Floss and Campaign findings block archive; Watch remains
non-actionable only with an explicit trigger.
