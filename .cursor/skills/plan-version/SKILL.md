---
name: plan-version
description: Convert a master version plan into the fewest safe session contracts. Use when beginning lifecycle planning for a new master version or the lifecycle resolver selects plan-version.
---

# Plan a version

Turn one master-version outcome set into the fewest session contracts that
still let the operator look at `development` throughout execution. The master
plan's goals, required outcomes, invariants, cleanup, and genuine
dependencies are fixed. Its proposed sub-version, session, branch, and PR
headings are provisional until this skill completes.

Session count is the number of bundles that cannot share one execution, not
the number of features. Ordered work inside a session carries the breakdown
(five, ten, or twenty steps). `plan-session` sequences those steps as
lookable slices on `development`.

Inputs: a `plan-version` resolver directive, active master plan, live
`origin/development`, current baseline and state, relevant open issues, and
artifact schemas.

Output: an operator-approved roadmap topology, then one schema-complete
contract and index entry per approved bundle. Session implementation plans
are `plan-session`.

## 1. Build the outcome ledger

Done when every master-plan goal, invariant, cleanup, dependency, acceptance
outcome, UX gate, and operator decision has a ledger row, and no delivery
heading was taken as a boundary.

1. Require the resolver directive to name `plan-version`; otherwise report it
   and return to `start-session`.
2. Read the master plan, live code and tests, baseline, prior as-builts in
   the active version, relevant open issues, and
   `docs/workflows/schema/session-contract.md`.
3. Extract the ledger from those outcomes. Count the features or capabilities
   the version actually needs. That count is the work, not the session count.

## 2. Record and challenge the current topology

Done when every proposed boundary has a hard reason, or has been combined.

1. Count the current proposed sub-versions, sessions, planning cycles, and
   close-out cycles.
2. Map dependencies, overlapping file or decision owners, verification
   gates, pauses, external waits, rollback boundaries, and risk domains.
3. Combine every adjacent or tightly coupled slice. Different directories,
   document types, roadmap headings, implementation layers, producer or
   consumer order, plumbing before UX, checker before fixtures, or a
   resumable review pause are not split reasons. Those become Ordered work
   steps inside one session.
4. Keep a boundary only for a real wait or soak, a decision that changes
   later implementation, an independent rollback or deployment boundary,
   unbounded discovery, a materially different high-risk domain, a
   genuinely unreviewable app-facing pile, or explicitly approved parallel
   work.
5. For every surviving boundary complete: `This cannot be Ordered work
   inside the adjacent session because …`. Combine it when the answer is
   not compelling.

## 3. Produce the fewest safe bundles

Done when the proposed session count is the minimum that the hard reasons
support, and both reviewers returned `CLEAN` on that proposal.

1. Propose the fewest safe bundles. The default is one session for a
   coherent outcome set, with many Ordered work steps, each landing on
   `development`.
2. For each bundle show covered ledger items, internal phases written as
   lookable slices (not backend then interface), shared owners,
   verification, operator looks on `development`, split triggers, and any
   genuine size or risk concern.
3. Present current versus proposed counts and a complete current-to-proposed
   bundle map.
4. Launch a fresh `structure-reviewer` and a fresh `behavior-reviewer` in
   parallel against the proposal, fixed outcomes, and source evidence.
   Launch them by those type names and omit Task `model`. The review must
   attempt every sensible merge and reject boundaries justified only by
   headings or ordinary implementation order. Continue when both return
   `CLEAN`, or every accepted finding is corrected and re-reviewed clean.

## 4. Approve before writing

Done when the operator has approved the topology, the master plan and
contracts are on `origin/development`, and any short-lived source branch
is gone.

1. Present the fixed outcomes, current and proposed counts, bundle map,
   internal phases, owner and gate overlaps, stop and split triggers, the
   hard reason for every boundary, and any genuinely oversized bundle
   (`CLEAN` only).
2. Obtain operator approval for the revised topology while the repository
   remains unchanged.
3. After approval, update the master plan's delivery topology first.
4. At topology approval, run
   `python3 tools/cli.py lifecycle capture-version-start` and apply its
   promoted Snapshot/Metrics output to the live code-health baseline when
   this adoption opens a new master version. Skip when the baseline's
   `Version-start ref` already matches the committed Code ref.
5. Reconcile stale unexecuted contracts and index entries next.
6. Create one schema-complete contract per approved bundle last. A contract
   may cover several roadmap sections. Delivery unit is land-each-Ordered-
   work-step-on-`development`. Internal phases name lookable slices.
7. Land and clean those commits onto `development` using `start-session`
   section 3.
8. Run `python3 tools/cli.py lifecycle check-evidence` and
   `python3 tools/cli.py test`, rerun the resolver, report the new
   directive, and stop. Material topology or contract changes require
   renewed approval.

## Return

Render this form in chat. Use exactly these four bullets. Leave the result
out of a code fence, and write no second summary in front of it.

## Version topology: `APPROVED` | `BLOCKED`

- **Subject:** Master `<X.Y>`; roadmap `<path>`
- **Result:** <approval or stop reason; delivery counts; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
