# Start-session procedure

Use only when the operator invokes planned lifecycle work. The resolver owns
lifecycle state and handler selection; this procedure owns branch selection,
pre-dispatch validation, dispatch, resumption, and return behavior.

## Execution contract

Inputs: current `origin/main`, live roadmap/contract/plan state, the resolver
directive, and a worktree whose local changes have an explicit disposition.

Output: one dispatched handler result followed by a fresh resolver directive,
or a stop at the directive's named pause. Planning outcomes are terminal unless
the operator approved a one-time bootstrap transition. When the handler is
`start-session`, output is one Ordered work step plus `OW_HANDOFF` (or a
pause/block), not the full session through close-out.

## Resolve and select the branch

1. Run `python3 tools/cli.py lifecycle resolve --pretty` and report the
   directive's action, reason, authority, primary artifact, branch, and pause.
   Do not infer a stage from the current branch.
2. Stop when the worktree contains unexplained changes. Preserve authorized
   work; never discard it. In-progress lifecycle work is explained when
   SCRATCHPAD `OW progress` names that session on the directive branch.
3. Fetch `origin/main`, resolve the active sub-version from that ref, and use
   the directive's exact `lifecycle/<sub-version>` branch.
4. Resume and fast-forward that branch when it exists remotely; otherwise create
   it from current `origin/main`.
5. Rerun the resolver on the selected branch — that second directive is the
   dispatch contract.
6. Run its `preDispatchGate`. A recognized pre-PR, reconciled, or
   version-opening release identity may proceed; every other failure blocks.

## Dispatch

1. If `handler` is null, stop at the named pause.
2. Otherwise invoke only the named skill. That adapter points to exactly one
   canonical procedure; do not select a sibling or reconstruct its steps here.
3. Follow the owning procedure in order. Honor the directive's authority and
   every operator pause.
4. Planning handlers stay read-only until approval, persist only their
   canonical artifact afterward, rerun the resolver, and stop. Execution begins
   with a fresh start-session unless the operator authorized a bootstrap
   transition in the approved session plan.

## Execute an approved session

When the handler is `start-session`, read the approved contract and plan, prior
session as-built records in the active version, master-plan context, agent-guide
chain, baseline, and SCRATCHPAD. Reconcile digests, prerequisites, interfaces,
branch, and assumptions against live code and current primary documentation.
Correct mechanical drift in scope.

The approved plan is the starting execution prompt, not an immutable script.
Never return this session to `plan-session`, and never rewrite the contract.
When an installed framework or runtime limit, live evidence, or clearer path
invalidates a named plan interface or step, pause and discuss with the operator
in plain English. Present the conflict and bounded alternatives, settle the
replacement, continue under that direction, and record the divergence for the
as-built. Do not unilaterally invent a replacement, and do not default to backlog or deferral;
those cuts are rare and operator-driven only.

If SCRATCHPAD already shows all Ordered work complete for this session
(`n/n complete — awaiting close-out`), return `OW_HANDOFF` with the close-out
handoff prompt below. Do not implement further OW steps.

Otherwise take the next incomplete Ordered work step from `### Ordered work`
and SCRATCHPAD `OW progress` (1-based; absent progress means step 1). Execute
only that step plus any attached operator pause. Before writing or editing
production or test code for the step, launch `docs-researcher` for every
material external technology and require a Documentation brief; skip only for
docs-only, SCRATCHPAD, policy-only, or other pure non-code edits. When the
contract or plan `UX gate` is Yes, the plan must include a dedicated Ordered work step that
invokes `ux-check` and completes the operator pause before
`n/n complete — awaiting close-out`; that step owns the UI gate, and close-out
does not re-run it. Maintain an in-context proof ledger with one result for
every atomic proof row owned by that step.

After the step's focused proof, invoke `gate-runner` with those focused
evidence commands, then:

```bash
FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm verify
```

Require a green Gate result packet for every command. Failures return
`BLOCKED`; diagnose and fix here, re-run `gate-runner`, and do not hand off
while red. Do not launch `adversarial-review` here — that belongs to close-out.

On green gates, launch a fresh `primitive-checker` and a fresh
`holistic-reviewer` in parallel against this step's working-tree diff and named
surfaces. On `FINDINGS` from either seat, fix, re-prove, re-run `gate-runner`,
and re-launch both reviewers — do not hand off while dirty. On `CLEAN` from
both (or every accepted finding corrected and re-reviewed clean), update
`docs/SCRATCHPAD.md` **Now** with:

- **OW progress:** `k/n complete` — next step title, or `n/n complete —
  awaiting close-out` when this was the last step
- **OW completed:** one short line per finished step (surfaces, focused proof,
  verify pass pointer, commit SHA)
- **Next-agent notes:** gotchas, open operator dispositions, paths to reopen

Then commit the verified OW scope (implementation, tests, and SCRATCHPAD OW
fields) in the repository's conventional plain-English style. Do not push from
the OW chat.

Do not rewrite the frozen session plan. Do not change `Execution status`
(close-out owns that). Do not start the next Ordered work step or close-out in
this chat.

Stop with `OW_HANDOFF` and a copy-paste handoff prompt. When more Ordered work
remains:

```text
Continue planned session <id> on `<branch>` via start-session.
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
SCRATCHPAD: docs/SCRATCHPAD.md (OW progress + next-agent notes).
Completed OW 1..<k> (commit <sha>). Next: Ordered work step <k+1> — <title from plan>.
Do not replan; do not close-out; execute only that step, then gate-runner + primitive-checker + holistic-reviewer + commit + handoff.
```

When this was the last Ordered work step:

```text
Planned session <id> Ordered work is complete on `<branch>` (final OW commit <sha>).
Plan: docs/session-plans/...
Contract: docs/session-contracts/...
SCRATCHPAD: docs/SCRATCHPAD.md (OW progress shows awaiting close-out).
Run close-out in planned mode only (no further OW).
```

## Stop and resume

Stop on a named operator gate, an unresolved in-session design discussion,
failed mandatory check, unexplained worktree state, missing authority, or after
a completed Ordered work step (`OW_HANDOFF`). Preserve completed evidence. On
resumption, re-enter through this procedure, select the same deterministic
branch, rerun the resolver and pre-dispatch gate, treat SCRATCHPAD OW fields as
the disposition for in-progress lifecycle worktree changes, and continue at the
next incomplete Ordered work step only — do not replan and do not re-run green
completed steps unless live state invalidated them.

## Return the result

After the dispatched handler stops, apply
`docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Start session: `DISPATCHED` | `PAUSED` | `BLOCKED` | `OW_HANDOFF`

- **Subject:** `<resolver action>` via `<handler or None>` on `<branch or Not selected>`
- **Result:** <dispatch, pause, block, or completed OW step summary; ≤2 sentences>
- **Action:** <next operator or lifecycle step; for `OW_HANDOFF`, point at the handoff prompt below>
- **Blocker:** <exact blocker or `None`>
```

When the outcome is `OW_HANDOFF`, render the four bullets, then a single fenced
copy-paste handoff prompt (the non-final or last-OW template above) so the
operator can open a new chat. That trailing fence is the only chat-result
exception allowed for this procedure.
