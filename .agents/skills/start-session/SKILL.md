---
name: start-session
description: >-
  Public lifecycle entry that resolves and runs the next LGI.tools development
  stage from the master roadmap,
  session contracts, approved per-session plans, scratchpad, health baseline,
  and live repository state. Use when Ryan says "start the next session", "run
  session X", "work from the plan", "continue the version", or invokes
  `$start-session`. Missing contracts or plans are routed to the appropriate
  planning skill before implementation.
---

# Start an LGI.tools session

<!-- shared-policy-revision: 29 -->

The resolver is the sole mechanical owner of lifecycle semantics, current-state
validation, and handler selection. The session contract and plan schemas own
artifact meaning. Treat
`docs/DESIGN_PRINCIPLES.md` as the constitution, `docs/CODE_HEALTH_BASELINE.md`
as current health, SCRATCHPAD as observed handoff, and live code as current fact.

## 1. Resolve before acting

Run `python3 .agent-local/resolve_development_state.py --pretty`. Read its
`directive` as the complete dispatch contract; do not maintain another
stage-to-skill routing table. Before acting, report the directive's action,
reason, authority, primary artifact, and pause in plain language.

After reporting the directive and before dispatch, run the directive's
`preDispatchGate`. It currently resolves to `python3
.agent-local/check_release_consistency.py --check`. Both the pre-PR and
reconciled signatures are valid rest states; any other release identity blocks
dispatch as lifecycle drift.

If `handler` is null, stop at the named pause. Otherwise follow only the named
handler skill, create the native Codex todo list from that handler and its owning
document, and keep exactly one item in progress. Planning directives require
Plan mode and remain read-only until Ryan approves; their handler persists the
canonical artifact afterward. Never maintain a separate prompt file.

Every handler returns control here after its approved artifact or delivery
outcome. Rerun the resolver instead of predicting the next handler, then report
and dispatch the new directive or stop at its pause. Exception: planning
outcomes are session-terminal — after a planning handler persists its approved
artifact, report the resolver's new directive and stop instead of dispatching
it; execution begins in a fresh `start-session`, whichever runtime runs it.

## 2. Execute an approved session plan

When the directive names `start-session` as its handler, read the active
instruction chain, constitution, baseline, master-plan context,
contract/index, approved session plan, SCRATCHPAD, and relevant backlog entries.
Follow Graphify-first exploration and verify moving API assumptions from current
primary documentation.

Reconcile the contract digest, branch/worktree, prerequisites, named interfaces,
and plan assumptions against live code. Mechanical drift may be corrected during
the approved work;
material product, scope, or design conflict returns to `plan-session` for Ryan's
approval. Then convert the approved plan's ordered work and verification gates
into the runtime todo list and execute only that scope.

Honor every pause. User-facing work requires `ux-check` evidence and Ryan's own
browser review. Finish through `close-out`, which runs the pre-PR design gate and
returns its delivery outcome here. Re-resolve after close-out; do not infer
whether the next action is another session, audit planning, remediation, audit
restart, or archival.
