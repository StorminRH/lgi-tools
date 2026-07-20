---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approval-ready
  LGI.tools implementation plan for one session contract. Normally dispatched
  by start-session; use directly for "plan this", "start a session on...", "design this
  feature", "let's build X", "make an implementation plan", or when
  start-session finds that the current session has no approved plan. Includes
  mandatory adversarial review of every complete draft before approval.
---

# Plan an LGI.tools session

<!-- shared-policy-revision: 28 -->

Use `docs/workflows/schema/session-plan.md` as the canonical authoring guide and
output schema; do not restate it. Treat the active agent guide and current
code-health state as standing context, and the selected session contract as the
product boundary.

## Sequence

1. Run the lifecycle resolver and require its directive to name `plan-session`
   as the handler. Otherwise report the directive and return control to
   `start-session`; do not select a sibling handler here. An explicit re-planning
   request may proceed only after reconciling the current contract and approval
   state.
2. Require Codex Plan mode for plan creation. Read and reconcile the schema's
   authoring inputs before drafting.
3. Create a native Codex todo list from this sequence and the schema's
   authoring, drafting, review, approval, and persistence gates; keep one item
   in progress and reopen invalidated checks.
4. Reconcile the contract with Graphify, live code, dependencies, and current
   primary documentation. Discuss the plan's intended shape with Ryan in
   plain English before drafting. Then produce a complete schema-conforming plan
   with no missing required section, mapping, marker, or unresolved placeholder.
5. Use the task-scoped `gpt-5.6-sol` assistance policy in `AGENTS.md` as useful
   during authoring. After the complete draft exists, launch a fresh read-only
   high worker to adversarially review the draft, contract, and cited
   evidence. Reconcile every finding; rerun review at most once, and only when
   the reconciliation materially changes architecture, scope, or verification.
   The review budget is a hard cap of one mandatory pass plus at most one
   rerun. Reconcile review findings into the final design or stop on a material
   conflict; never persist review history, transcripts, pass counts, or
   superseded draft content in the plan.
6. Present a short plain-English summary alongside the reviewed plan before
   requesting Ryan's approval. Do not persist it in Plan mode.
7. After approval in execution mode, write the deterministic
   `docs/session-plans/X.Y/<session>.md` with the required approval, contract
   digest, planning-schema, and pending execution markers.
8. Rerun the resolver, report its new directive, run
   `python3 .agent-local/check_agent_drift.py`, and stop — planning outcomes
   are session-terminal. A session that planned an artifact never executes it;
   execution begins in a fresh `start-session`.

Overwrite a re-approved plan in place; never append planning history or create
a separate prompt artifact.
