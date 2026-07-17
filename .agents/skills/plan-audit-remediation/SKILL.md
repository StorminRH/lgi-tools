---
name: plan-audit-remediation
description: >-
  Internal lifecycle handler that extends an LGI.tools master version with
  approved sub-versions and session contracts for every actionable version-close
  audit finding. Normally dispatched by start-session; use directly for
  "plan audit remediation", "fix the audit before archive", "extend the
  version for audit findings", or when lifecycle resolution reports
  audit-remediation-plan-needed.
---

# Plan LGI.tools audit remediation

<!-- shared-policy-revision: 20 -->

This is the Plan-mode owner for converting a failed version-close audit into a
bounded extension of the same master version. It creates no separate remediation
prompt or execution plan: the master plan, session contracts, later approved
session plans, and audit finding ledger remain authoritative.

## Sequence

1. Run `python3 .agent-local/resolve_development_state.py --pretty` and require
   its directive to name `plan-audit-remediation` as the handler. Otherwise
   report the directive and return control to `start-session`; do not select a
   sibling handler here. Create a native Codex todo list from the steps below and
   keep one item in progress.
2. Require Codex Plan mode. Read in full, in this order:
   `docs/DESIGN_PRINCIPLES.md`, `docs/SESSION_PLANNING.md`,
   `docs/PRE_PR_DESIGN_REVIEW.md`, and `docs/VERSION_AUDIT.md`. Then read the
   lifecycle, contract schema, current `docs/CODE_HEALTH_BASELINE.md`, audit plan
   and finding ledger, master plan, SCRATCHPAD, relevant backlog, Graphify
   results, and live code.
3. For every open Floss or Campaign, diagnose the violated ownership,
   interface, change-axis, or coverage principle rather than repeating a metric.
   Define the intended interface/end-state, sketch two decompositions, record
   the rejected alternative, and put characterization tests before structural
   work. A cohesive deep function stays intact when coverage resolves the
   signal; metrics never mandate fragment extraction.
4. Group findings into independently shippable sub-versions by change axis.
   Map every open `AF-NNN` finding to one or more contracts, and map no contract
   to scope absent from the audit. Each contract states its finding ids,
   dependencies, behavior locks, end-state, verification, baseline effect,
   pre-PR design evidence, and normal branch/PR close-out.
5. Present the complete master-plan extension and contract set for Ryan's
   approval. Plan mode is read-only; do not mutate artifacts before approval.
6. After approval in execution mode, append the approved rows to the current
   master plan, reconcile `docs/session-contracts/X.Y/INDEX.md` and its contract
   files, change each mapped finding from Open to Planned, set `Audit status` to
   `Remediation in progress`, and update SCRATCHPAD to the first new session.
   Do not create session implementation plans here.
7. Rerun the resolver, report its new directive, run
   `python3 .agent-local/check_agent_drift.py`, and stop — planning outcomes
   are session-terminal. A session that planned an artifact never executes it;
   execution begins in a fresh `start-session`.

All confirmed Floss and Campaign findings block archive. Watch findings remain
non-actionable only with an exact evidence trigger. If a fresh audit reopens a
finding or adds another, repeat this skill using the next available sub-version
numbers in the same master version.
