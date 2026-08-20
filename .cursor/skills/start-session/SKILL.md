---
name: start-session
description: Resolve, dispatch, and run the next approved lifecycle action from live roadmap, contract, plan, and repository state. Use when the operator asks to start, continue, resume, or run a planned lifecycle session.
---

# Start a lifecycle session

Use only when the operator invokes planned lifecycle work. The resolver owns
lifecycle state and handler selection. This skill owns branch selection,
pre-dispatch validation, dispatch, resumption, land-on-development, and
return behavior.

`development` is the entry tip for every branch this skill cuts.

Inputs: current `origin/development`, live roadmap/contract/plan state, the
resolver directive, and a worktree whose local changes have an explicit
disposition.

Output: one dispatched handler result followed by a fresh resolver directive,
or a stop at the directive's named pause. Planning outcomes are terminal
unless the operator approved a one-time bootstrap transition. When the
handler is `start-session`, output is one Ordered work (OW) step landed on
`development` plus `OW_HANDOFF`, or a pause/block. Close-out is a later chat.

## 1. Resolve and select the branch

Done when the worktree is on the selected branch, the second resolver
directive is the dispatch contract, and `preDispatchGate` passed.

1. Run `python3 tools/cli.py lifecycle resolve --pretty` and report the
   directive's action, reason, authority, primary artifact, branch, and pause.
   Do not infer a stage from the current branch.
2. Stop when the worktree contains unexplained changes. Preserve authorized
   work. In-progress work is explained when HEAD is this step's OW branch and
   the dirty files belong to that step.
3. Fetch `origin/development` and `origin/staging`.
4. Name and select the work branch from current `origin/development`:
   - Handler `start-session`: `lifecycle/<session>-ow-<n>` for the next
     incomplete Ordered work step (`n` is 1-based). Create it from
     `origin/development` when it is missing. Resume it when it exists and
     its tip is not already on `origin/development`. A step whose tip is
     already on `origin/development` is landed; take the next incomplete
     step.
   - Any other handler: the directive's `lifecycle/<sub-version>` branch,
     created from `origin/development` when missing, otherwise resumed and
     rebased onto `origin/development`.
5. Rerun the resolver on the selected branch. That second directive is the
   dispatch contract.
6. Run its `preDispatchGate`. A recognized pre-PR, reconciled, or
   version-opening release identity may proceed. Every other failure blocks.

## 2. Dispatch

Done when the named handler has run to its own stop, or this skill has
stopped at a null handler.

1. If `handler` is null, stop at the named pause.
2. Otherwise invoke only the named skill. Do not select a sibling or
   reconstruct its steps here.
3. Follow that skill in order. Honor the directive's authority and every
   operator pause.
4. Planning handlers stay read-only until approval, persist only their
   canonical artifact afterward, rerun the resolver, and stop. Execution
   begins with a fresh start-session unless the operator authorized a
   bootstrap transition in the approved session plan.

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
alternatives, settle the replacement, continue under that direction, and
record the divergence for the as-built. Do not invent a replacement, and do
not default to backlog or deferral. Those cuts are rare and operator-driven
only.

If the last Ordered work handoff, or the operator, already says Ordered work
is complete and close-out should run, return `OW_HANDOFF` with the close-out
handoff prompt below.

Otherwise take the next incomplete Ordered work step from `### Ordered work`
(1-based; absent a handoff prompt, start at step 1 unless the operator names
a later step). Execute only that step plus any attached operator pause.
When the contract or plan `UX gate` is Yes, the plan must include a dedicated
Ordered work step that invokes `ux-check` and completes the operator pause
before awaiting close-out. Close-out consumes that disposition. Maintain an
in-context proof ledger with one result for every atomic proof row owned by
that step.

### Author

Done when the step's code is written against a Documentation brief, a
Repository map, and `typescript-best-practices`.

Before writing or editing code, launch `docs-researcher`, then `repo-mapper`.
Name those seats and omit Task `model`. Generation waits on the
Documentation brief and the Repository map. Then invoke
`typescript-best-practices`. Then write. A docs-only or policy-only step
skips this prelude.

### Prove, review, and land

Done when the OW commit is on `origin/development`, the local test suite
was green after the last review, and the handoff reports the app-facing
count versus `staging`.

1. After the step's focused proof, invoke `gate-runner` with the local test
   suite from AGENTS.md Seats plus those focused evidence commands. Require a
   green Gate result packet for every command. Failures return `BLOCKED`.
2. On a green suite, launch a fresh `structure-reviewer` and a fresh
   `behavior-reviewer` in parallel against this step's working-tree diff.
   Launch them by those type names and omit Task `model`.
3. After both reviewers return, run the local test suite again.
4. On `FINDINGS`, fix, run the local test suite, re-launch both reviewers,
   and run the local test suite again. Repeat until both return `CLEAN`, or
   every accepted finding is corrected and re-reviewed clean, and the suite
   after that last review is green.
5. Commit the verified OW scope, implementation and tests. Leave the frozen
   session plan and `Execution status` untouched.
6. Fetch `origin/development`. Rebase the OW branch onto it when development
   has moved, and re-run the local test suite after that rebase. Fast-forward
   `origin/development` to this commit (`git push origin HEAD:development`).
   Push the OW branch. No pull request. No Depot wait.
   `adversarial-review` belongs to close-out.
7. Count app-facing files in
   `git diff --name-only origin/staging...origin/development`. App-facing
   means runtime, tests, CI, and committed config. Documentation and policy
   are excluded: `.cursor/skills`, `.cursor/agents`, `AGENTS.md`,
   `CONTRIBUTING.md`, `docs/`, changelog, PR templates, `.fallowrc.json`,
   unless those files are the ask. Report `app-facing <n>/100` in the
   handoff. At or over 100, the handoff names that a promote is due before
   more app-facing work.

Do not start the next Ordered work step or close-out in this chat.

Stop with `OW_HANDOFF` and a copy-paste handoff prompt. Mid-session progress
and next-agent notes live in that prompt, not in git. When more Ordered work
remains:

```text
Continue planned session <id> via start-session. Next branch: `lifecycle/<id>-ow-<k+1>` from origin/development.
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
Landed OW 1..<k> on development (<sha>). App-facing vs staging: <n>/100.
Next: Ordered work step <k+1> — <title from plan>.
Next-agent notes: <gotchas, open operator dispositions, paths to reopen, or None>.
Do not replan; do not close-out; execute only that step, then local test suite + structure-reviewer + behavior-reviewer + commit + land on development + handoff.
```

When this was the last Ordered work step:

```text
Planned session <id> Ordered work is complete. Last OW landed on development (<sha>).
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
App-facing vs staging: <n>/100.
Run close-out in planned mode only (no further OW).
Next-agent notes: <gotchas, open operator dispositions, or None>.
```

## 4. Stop and resume

Stop on a named operator gate, an unresolved in-session design discussion,
failed mandatory check, unexplained worktree state, missing authority, or
after a completed Ordered work step (`OW_HANDOFF`). On resumption, re-enter
through this skill, select the same OW branch when that step is not yet on
`origin/development`, rerun the resolver and pre-dispatch gate, and continue
at the next incomplete Ordered work step only.

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
