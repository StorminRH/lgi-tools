# Plan-version procedure

Plan the minimum safe delivery topology for one master-version outcome set. The
master plan's goals, required outcomes, invariants, cleanup, and genuine
dependencies are fixed inputs; its proposed sub-version, session, branch, and PR
headings are provisional until this procedure completes.

## Execution contract

Inputs: a `plan-version` resolver directive, active master plan, live repository,
current baseline and state, relevant open `[Backlog]` GitHub Issues, and
artifact schemas.

Output: an operator-approved roadmap topology followed by one schema-complete
contract and index entry per approved frontier-agent execution bundle. Do not
create session implementation plans here.

## Build the outcome ledger

1. Require the resolver directive to name `plan-version`; otherwise report it
   and return to `start-session`.
2. Read the master plan, live code and tests, baseline, SCRATCHPAD, relevant
   open `[Backlog]` GitHub Issues, and contract schema. Use `repo-mapper`
   (Codegraph CLI: `callers`, `callees`, `impact`, `query`) only for material
   relationship, consumer, dependency, or blast-radius claims; keep conceptual
   discovery on Explore, semantic search, and grep. Use current primary
   documentation when moving implementation assumptions depend materially on
   external behavior.
3. Extract an outcome ledger that preserves every goal, invariant, required
   cleanup, dependency, acceptance outcome, UX gate, and operator decision
   without accepting roadmap delivery headings as boundaries.

## Record and challenge the current topology

1. Count the current proposed sub-versions, sessions, branches, PRs, planning
   cycles, review cycles, and close-out cycles.
2. Map dependencies, overlapping file/decision owners, verification gates,
   pauses, external waits, rollback boundaries, and risk domains.
3. Attempt to combine every adjacent or tightly coupled slice. Different
   directories, document types, roadmap headings, implementation layers,
   producer/consumer order, plumbing before UX, checker before fixtures, or a
   resumable review pause are not split reasons.
4. Keep a boundary only for a real wait or soak, a decision that changes later
   implementation, an independent rollback/deployment boundary, unbounded
   discovery, a materially different high-risk domain, a genuinely unreviewable
   diff, or explicitly approved parallel branches.
5. For every surviving boundary complete: `This cannot be an internal phase of
   the adjacent execution bundle because …`. Combine it when the answer is not
   compelling.

## Produce the minimum safe bundles

1. Propose the fewest safe frontier-agent bundles. The default is one autonomous
   agent, one context-rich session, one branch, and one reviewable PR.
2. For each bundle show covered outcome-ledger items, internal phases, shared
   owners, verification, pause/stop behavior, split triggers, and any genuine
   size or risk concern.
3. Present current versus proposed counts and a complete current-to-proposed
   bundle map.
4. Run the planning approval gate: invoke `adversarial-review` against the complete proposal,
   fixed outcomes, and source evidence. The review must
   attempt every sensible merge and reject boundaries justified only by headings
   or ordinary implementation order. Reconcile every verified finding from that
   one review pass. Continue only with `PASS` (`BLOCKED` stops;
   `CORRECTIONS_REQUIRED` requires operator-controlled re-review after fixes —
   do not auto-relaunch).

## Approve before writing

1. Present the fixed outcomes, current/proposed counts, bundle map, internal
   phases, owner/gate overlaps, stop and split triggers, hard reason for every
   boundary, and any genuinely oversized bundle in plain English (`PASS` only).
2. Obtain operator approval for the revised topology while the repository remains
   unchanged.
3. After approval, update the master plan's delivery topology first.
4. At topology approval, run `python3 tools/cli.py lifecycle capture-version-start` and
   apply its promoted Snapshot/Metrics output to `docs/CODE_HEALTH_BASELINE.md`
   when this adoption opens a new master version; skip when the baseline's
   `Version-start ref` already matches the committed Code ref.
5. Reconcile stale unexecuted contracts and index entries next.
6. Create one schema-complete contract per approved bundle last. A contract may
   cover several roadmap sections and must include the execution frame.
7. Run `python3 tools/cli.py policy check` and `python3 tools/cli.py test`, rerun
   the resolver, report the new directive, and stop. Material topology or
   contract changes require renewed approval.

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## Version topology: `APPROVED` | `BLOCKED`

- **Subject:** Master `<X.Y>`; roadmap `<path>`
- **Result:** <approval or stop reason; delivery counts; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
```