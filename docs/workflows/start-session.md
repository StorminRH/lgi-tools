# Start-session procedure

Use this procedure only when the operator invokes planned lifecycle work. The
resolver owns lifecycle state and handler selection; this procedure owns branch
selection, pre-dispatch validation, dispatch, resumption, and return behavior.

## Execution contract

Inputs: current `origin/main`, live roadmap/contract/plan state, the resolver
directive, and a worktree whose local changes have an explicit disposition.

Output: one dispatched handler result followed by a fresh resolver directive,
or a stop at the directive's named pause. Planning outcomes are terminal unless
the operator has explicitly approved a one-time bootstrap transition.

## Resolve and select the branch

1. Run `python3 .agent-local/resolve_development_state.py --pretty` and report
   the directive's action, reason, authority, primary artifact, branch, and
   pause. Do not infer a stage from the current branch.
2. Stop when the worktree contains unexplained changes. Preserve explicitly
   authorized work before moving it; never discard or overwrite it.
3. Fetch `origin/main`, resolve the active sub-version from that current ref,
   and use the directive's exact `lifecycle/<sub-version>` branch.
4. Check the remote for that exact branch. Resume and fast-forward it when it
   exists; otherwise create it from current `origin/main`.
5. Rerun the resolver on the selected branch. This second directive is the
   authoritative dispatch contract.
6. Run its `preDispatchGate`. A recognized pre-PR, reconciled, or version-opening
   release identity may proceed; every other failure blocks dispatch.

## Dispatch

1. If `handler` is null, stop at the named pause.
2. Otherwise invoke only the named skill. That adapter points to exactly one
   canonical procedure; do not select a sibling handler or reconstruct its
   steps here.
3. Follow the owning procedure in order. Honor the directive's authority and
   every operator pause.
4. Planning handlers remain read-only until approval, persist only their
   canonical artifact afterward, rerun the resolver, and stop. Execution begins
   with a fresh start-session invocation unless the operator explicitly
   authorized a bootstrap transition in the approved session plan.

## Execute an approved session

When the handler is `start-session`, read the approved contract and plan,
master-plan context, agent-guide chain, baseline, SCRATCHPAD, and relevant
backlog. Reconcile their digests, prerequisites, interfaces, branch, and
assumptions against live code and current primary documentation. Correct
mechanical drift in scope; return a material scope or design conflict to
`plan-session` for approval.

Execute the approved ordered work and its proof. A UI gate invokes `ux-check`
and pauses for operator review. Finish through `close-out`, passing the original
planned directive so close-out selects planned mode. Rerun the resolver after
the handler returns and report its complete next directive without predicting
the following stage.

## Stop and resume

Stop on a named operator gate, material contract conflict, failed mandatory
check, unexplained worktree state, or missing authority. Preserve completed
evidence. On resumption, re-enter through this procedure, select the same
deterministic branch, rerun the resolver and pre-dispatch gate, and reopen only
work invalidated by changed state.
