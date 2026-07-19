---
name: plan-version
description: >-
  Internal lifecycle handler that turns an LGI.tools master version plan into
  approved, ordered session contracts. Normally dispatched by start-session;
  use directly when Ryan says
  "plan the version", "break this roadmap into sessions", "generate session
  contracts", "extrapolate the master plan", or when lifecycle resolution says
  contracts are missing or stale.
---

# Plan an LGI.tools version

<!-- shared-policy-revision: 24 -->

This is a thin Plan-mode orchestrator. `docs/DEVELOPMENT_LIFECYCLE.md` and
`docs/SESSION_CONTRACTS.md` own the procedure and artifact schemas;
`docs/DESIGN_PRINCIPLES.md` is the constitution and
`docs/CODE_HEALTH_BASELINE.md` is current health state.

## Sequence

1. Run `python3 .agent-local/resolve_development_state.py --pretty` and require
   its directive to name `plan-version` as the handler. Otherwise report the
   directive and return control to `start-session`; do not select a sibling
   handler here.
2. Read the constitution and baseline first, then the lifecycle, contract
   model, active master plan, SCRATCHPAD, and relevant backlog items.
3. Create a native Codex todo list from the lifecycle's contract-generation
   phase and keep exactly one item in progress.
4. In Codex Plan mode, reconcile roadmap intent with live repository state and
   propose the ordered contract/index set. Include dependencies, acceptance
   gates, hotspot contact, and at most one selected health campaign.
5. Use task-scoped `gpt-5.6-sol` workers under `AGENTS.md` as useful during
   authoring. Give the complete draft to a fresh read-only xhigh adversarial
   reviewer with its source evidence, then reconcile every finding.
6. Present a short plain-English summary alongside the reviewed decomposition
   before requesting Ryan's approval. Plan mode is read-only; do not create or
   rewrite contract files before approval.
7. After approval in execution mode, write or reconcile only the deterministic
   `docs/session-contracts/X.Y/INDEX.md` and contract paths. Do not create a
   session implementation plan here.
8. Rerun the resolver, report its new directive, run
   `python3 .agent-local/check_agent_drift.py`, and stop — planning outcomes
   are session-terminal. A session that planned an artifact never executes it;
   execution begins in a fresh `start-session`.

Material changes to an approved contract require re-approval. Deferred work
goes to `docs/backlog.md`; never conceal it in a later contract.
