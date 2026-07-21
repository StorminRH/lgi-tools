---
name: start-session
description: >-
  Public lifecycle entry that resolves and runs the next LGI.tools stage from
  its roadmap, contracts, approved
  session plans, scratchpad, health baseline, and live repository state. Use for
  "start the next session", "run session X", "work from the plan", or
  "continue the version", or invoke `/start-session` directly. Missing
  artifacts route to the owning planning skill.
---

# Start an LGI.tools session

The resolver is the sole mechanical owner of lifecycle semantics, current-state
validation, and handler selection. The session contract and plan schemas own
artifact meaning. Treat
`docs/DESIGN_PRINCIPLES.md` as the constitution and
`docs/CODE_HEALTH_BASELINE.md` as current health. Contracts are product intent,
SCRATCHPAD is observed handoff, and live code is current fact.

Run `python3 .agent-local/resolve_development_state.py --pretty` and treat its
`directive` as the complete dispatch contract; never maintain another
stage-to-skill table. Report the action, reason, authority, primary artifact,
branch, and pause before acting. A null `handler` stops at the named pause. Otherwise follow
only the named handler skill, create the native Claude Code task list from its
owning document, and keep one task active. Plan mode directives stay read-only
until Ryan approves and the handler persists its canonical artifact. Never
create a separate prompt file.

After reporting the directive and before dispatch, run its `preDispatchGate`,
currently `python3 .agent-local/check_release_consistency.py --check`. The
recognized release-identity signatures — pre-PR, reconciled, and the new-version
opening transient — are accepted; any other identity blocks dispatch as lifecycle
drift.

The resolver owns the branch name: cut it at the start of the action, never at the
end of the previous one. The directive's `branch` field is that authority — for an
execute session it names the sub-version the branch must embed, so open a
`<runtime>/<sub-version>-<slug>` branch (never `main`) before executing and make any
carried post-merge lifecycle reconciliation that branch's first commit, then run
`check_release_consistency.py --check --expect reconciled`. A `rider` stage — a null
handler on a `rider/*` branch — is an unversioned flow-track one-off: do the declared
change and stop; never bump `APP_VERSION`, the changelog, or the roadmap, and dispatch
no lifecycle handler.

Every handler returns control here after its artifact or delivery outcome.
Rerun the resolver instead of predicting the next handler, then report and
dispatch the new directive or stop at its pause. Exception: planning outcomes
are session-terminal — after a planning handler persists its approved
artifact, report the resolver's new directive and stop instead of dispatching
it; execution begins in a fresh `start-session`, whichever runtime runs it.

When the directive names `start-session` as its handler, read the instruction
chain, constitution, baseline, master-plan context, contract/index,
approved session plan, SCRATCHPAD, and relevant backlog entries. Follow
Codegraph-first exploration; verify moving APIs from current primary docs.
Reconcile the contract digest, branch/worktree, and prerequisites. Material
scope/design conflicts require re-planning; otherwise execute only the approved
plan through its verification tasks. User-facing work requires `ux-check`
evidence plus Ryan's browser review. Finish through `close-out`, then re-resolve
instead of inferring the next session, audit, remediation, or archive action.
