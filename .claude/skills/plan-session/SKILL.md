---
name: plan-session
description: >-
  Internal lifecycle handler that designs and persists an approved LGI.tools
  implementation plan for one session contract. Normally dispatched by
  start-session; use directly for "plan this", "start a session on...", "design this feature",
  "let's build X", or when start-session finds no approved current plan.
---

# Plan an LGI.tools session

<!-- shared-policy-revision: 20 -->

Run the resolver and require its directive to name `plan-session` as the handler.
Otherwise report it and return control to `start-session`; never select a sibling
handler here. An explicit re-plan may proceed only after reconciling contract and
approval state. Drive `docs/SESSION_PLANNING.md` in Claude Code Plan mode. Read
`docs/DESIGN_PRINCIPLES.md` and `docs/CODE_HEALTH_BASELINE.md` first, then create
the native task list from every numbered planning step.

Reconcile the contract with Graphify, live code, dependencies, and current
primary docs. Present the fixed-schema plan—including alternatives, tests, scope
guard, and baseline effect—and wait for Ryan's approval without writing files.
After approval in execution mode, write the deterministic
`docs/session-plans/X.Y/<session>.md` path with
approval, contract-digest, and pending-execution markers. Rerun the resolver,
report its new directive, run the agent drift check, and stop — planning
outcomes are session-terminal. A session that planned an artifact never
executes it; execution begins in a fresh `start-session`. Never create a
separate prompt artifact or separate prompt file.
