# Plan-version procedure

Plan the minimum safe delivery topology for one master-version outcome set. The
master plan's goals, required outcomes, invariants, cleanup, and genuine
dependencies are fixed inputs; its proposed sub-version, session, branch, and PR
headings are provisional until this procedure completes.

## Execution contract

Inputs: a `plan-version` resolver directive, active master plan, live repository,
current baseline and state, relevant backlog, and artifact schemas.

Output: an operator-approved roadmap topology followed by one schema-complete
contract and index entry per approved frontier-agent execution bundle. Do not
create session implementation plans here.

## Build the outcome ledger

1. Require the resolver directive to name `plan-version`; otherwise report it
   and return to `start-session`.
2. Read the master plan, live code and tests, baseline, SCRATCHPAD, relevant
   backlog, and contract schema. Use Codegraph and current primary documentation
   for moving implementation assumptions.
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
4. Give the proposal and source evidence to one fresh read-only high-effort
   adversarial reviewer. The reviewer must hold outcomes fixed, attempt every
   sensible merge, and reject boundaries justified only by headings or ordinary
   implementation order. Reconcile every finding; permit at most one rerun after
   material reconciliation.

## Approve before writing

1. Present the fixed outcomes, current/proposed counts, bundle map, internal
   phases, owner/gate overlaps, stop and split triggers, hard reason for every
   boundary, and any genuinely oversized bundle in plain English.
2. Obtain operator approval for the revised topology while all repository
   artifacts remain unchanged.
3. After approval, update the master plan's delivery topology first.
4. Reconcile stale unexecuted contracts and index entries second.
5. Create one schema-complete contract per approved bundle last. A contract may
   cover several roadmap sections and must include the execution frame.
6. Rerun the resolver and agent drift check, report the new directive, and stop.
   Material topology or contract changes require renewed approval.

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## Version topology: `APPROVED` | `BLOCKED`

- **Master version:** `<X.Y>`
- **Roadmap:** `<path>`
- **Contract index:** `<path or Not written>`

### Topology and approval

- **Outcome coverage:** <complete coverage summary>
- **Delivery counts:** <current counts → approved counts>
- **Execution bundles:** <approved bundle and internal-phase summary>
- **Boundary decisions:** <surviving boundaries and reasons, or None>
- **Adversarial review:** <review result and finding disposition or Not reached>
- **Operator approval:** <approval evidence or Not approved>

### Next state

- **Artifacts:** <created, reconciled, or Not written>
- **Resolver directive:** <complete fresh directive or Not reached>
- **Handoff:** <next lifecycle action>
- **Blocker:** <exact blocker or None>
```
