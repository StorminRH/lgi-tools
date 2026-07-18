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

<!-- shared-policy-revision: 23 -->

Drive `docs/SESSION_PLANNING.md`; do not restate it. Treat
`docs/DESIGN_PRINCIPLES.md` as the constitution,
`docs/CODE_HEALTH_BASELINE.md` as current state, and the selected session
contract as the product boundary.

## Sequence

1. Run the lifecycle resolver and require its directive to name `plan-session`
   as the handler. Otherwise report the directive and return control to
   `start-session`; do not select a sibling handler here. An explicit re-planning
   request may proceed only after reconciling the current contract and approval
   state.
2. Require Codex Plan mode for plan creation. Read every document required by
   `docs/SESSION_PLANNING.md`, beginning with the constitution and baseline.
3. Create a native Codex todo list from the planning document's numbered steps;
   keep one item in progress and reopen invalidated checks.
4. Reconcile the contract with Graphify, live code, dependencies, and current
   primary documentation. Produce the fixed-schema plan, including design
   alternatives, tests, scope guard, and baseline effect.
5. Use the task-scoped `gpt-5.6-sol` assistance policy in `AGENTS.md` as useful
   during authoring. After the complete draft exists, launch a fresh read-only
   xhigh worker to adversarially review the draft, contract, and cited
   evidence. Reconcile every finding; rerun review if the response materially
   changes architecture, scope, or verification.
6. Present the reviewed plan and wait for Ryan's approval. Do not persist it in Plan
   mode.
7. After approval in execution mode, write the deterministic
   `docs/session-plans/X.Y/<session>.md` with the required approval, contract
   digest, and pending execution markers.
8. Rerun the resolver, report its new directive, run
   `python3 .agent-local/check_agent_drift.py`, and stop — planning outcomes
   are session-terminal. A session that planned an artifact never executes it;
   execution begins in a fresh `start-session`.

Overwrite a re-approved plan in place; never append planning history or create
a separate prompt artifact.
