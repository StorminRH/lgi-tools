---
name: start-session
description: Resolve, dispatch, and run the next approved lifecycle action from live roadmap, contract, plan, and repository state. Use when the operator asks to start, continue, resume, or run a planned lifecycle session.
---

# Start a lifecycle session

Use only when the operator invokes planned lifecycle work. The resolver owns
lifecycle state and handler selection; this skill owns branch selection,
pre-dispatch validation, dispatch, resumption, and return behavior.

Inputs: current `origin/main`, live roadmap/contract/plan state, the resolver
directive, and a worktree whose local changes have an explicit disposition.

Output: one dispatched handler result followed by a fresh resolver directive,
or a stop at the directive's named pause. Planning outcomes are terminal unless
the operator approved a one-time bootstrap transition. When the handler is
`start-session`, output is one Ordered work (OW) step plus `OW_HANDOFF` (or a
pause/block), not the full session through close-out.

## 1. Resolve and select the branch

1. Run `python3 tools/cli.py lifecycle resolve --pretty` and report the
   directive's action, reason, authority, primary artifact, branch, and pause.
   Do not infer a stage from the current branch.
2. Stop when the worktree contains unexplained changes. Preserve authorized
   work. In-progress lifecycle work is explained when the current branch is
   the directive's lifecycle branch and the dirty files belong to that
   session.
3. Fetch `origin/main`, resolve the active sub-version from that ref, and use
   the directive's exact `lifecycle/<sub-version>` branch.
4. Resume and fast-forward that branch when it exists remotely; otherwise create
   it from current `origin/main`.
5. Rerun the resolver on the selected branch — that second directive is the
   dispatch contract.
6. Run its `preDispatchGate`. A recognized pre-PR, reconciled, or
   version-opening release identity may proceed; every other failure blocks.

## 2. Dispatch

1. If `handler` is null, stop at the named pause.
2. Otherwise invoke only the named skill. Do not select a sibling or
   reconstruct its steps here.
3. Follow that skill in order. Honor the directive's authority and every
   operator pause.
4. Planning handlers stay read-only until approval, persist only their
   canonical artifact afterward, rerun the resolver, and stop. Execution begins
   with a fresh start-session unless the operator authorized a bootstrap
   transition in the approved session plan.

## 3. Execute an approved session

When the handler is `start-session`, read only what is not already in
context: this session's approved contract and plan, and prior as-builts in
the active version (Successor notes and Final surfaces). Do not re-read
auto-loaded agent guides. Open the master plan or baseline only when this
session's contract or plan names them. Reconcile digests, prerequisites,
interfaces, branch, and assumptions against live code. Correct mechanical
drift in scope.

The approved plan is the starting execution prompt, not an immutable script.
Never return this session to `plan-session`, and never rewrite the contract.
When live evidence invalidates a named plan interface or step, pause and
discuss with the operator in plain English. Present the conflict and bounded
alternatives, settle the replacement, continue under that direction, and record
the divergence for the as-built. Do not invent a replacement, and
do not default to backlog or deferral;
those cuts are rare and operator-driven only.

If the last Ordered work handoff (or the operator) already says Ordered work
is complete and close-out should run, return `OW_HANDOFF` with the close-out
handoff prompt below.

Otherwise take the next incomplete Ordered work step from `### Ordered work`
(1-based; absent a handoff prompt, start at step 1 unless the operator names
a later step). Execute only that step plus any attached operator pause. The
docs-researcher gate applies. When the contract or plan `UX gate` is Yes, the
plan must include a dedicated Ordered work step that invokes `ux-check` and
completes the operator pause before awaiting close-out. Close-out consumes
that disposition. Maintain an in-context proof ledger with one result for
every atomic proof row owned by that step.

After the step's focused proof, invoke `gate-runner` with the cheap local
packet and those focused evidence commands:

```bash
pnpm typecheck
pnpm lint
pnpm exec fallow dead-code --fail-on-issues
pnpm exec fallow dupes --fail-on-issues
pnpm exec fallow health --fail-on-issues
```

Require a green Gate result packet for every command. Failures return
`BLOCKED`. Do not launch `adversarial-review` here — that belongs to close-out.

On green gates, launch a fresh `primitive-checker` and a fresh
`holistic-reviewer` in parallel against this step's working-tree diff. Launch
them the same way as `adversarial-review` §3: named `subagent_type`, omit Task
`model` (do not pass `inherit` or a slug). On `FINDINGS`, fix, re-prove,
re-run `gate-runner`, and re-launch both reviewers. On `CLEAN` from both (or every accepted finding
corrected and re-reviewed clean), commit the verified OW scope
(implementation and tests). Do not push from the OW chat. Do not rewrite the
frozen session plan. Do not change `Execution status`. Do not start the next
Ordered work step or close-out in this chat.

Stop with `OW_HANDOFF` and a copy-paste handoff prompt. Mid-session progress
and next-agent notes live in that prompt, not in git. When more Ordered work
remains:

```text
Continue planned session <id> on `<branch>` via start-session.
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
Completed OW 1..<k> (commit <sha>). Next: Ordered work step <k+1> — <title from plan>.
Next-agent notes: <gotchas, open operator dispositions, paths to reopen, or None>.
Do not replan; do not close-out; execute only that step, then gate-runner + primitive-checker + holistic-reviewer + commit + handoff.
```

When this was the last Ordered work step:

```text
Planned session <id> Ordered work is complete on `<branch>` (final OW commit <sha>).
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
Run close-out in planned mode only (no further OW).
Next-agent notes: <gotchas, open operator dispositions, or None>.
```

## 4. Stop and resume

Stop on a named operator gate, an unresolved in-session design discussion,
failed mandatory check, unexplained worktree state, missing authority, or after
a completed Ordered work step (`OW_HANDOFF`). On resumption, re-enter through
this skill, select the same branch, rerun the resolver and pre-dispatch
gate, and continue at the next incomplete Ordered work step only.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Start session: `DISPATCHED` | `PAUSED` | `BLOCKED` | `OW_HANDOFF`

- **Subject:** `<resolver action>` via `<handler or None>` on `<branch or Not selected>`
- **Result:** <dispatch, pause, block, or completed OW step summary; ≤2 sentences>
- **Action:** <next operator or lifecycle step; for `OW_HANDOFF`, point at the handoff prompt below>
- **Blocker:** <exact blocker or `None`>

Exception — `OW_HANDOFF` only: after the four bullets, append exactly one
fenced copy-paste handoff prompt (the non-final or last-OW template above).
No other outcome may append chat content after the four bullets.
