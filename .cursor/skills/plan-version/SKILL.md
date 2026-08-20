---
name: plan-version
description: Group a master version into a few feature-sized session contracts. Use when beginning lifecycle planning for a new master version or the lifecycle resolver selects plan-version.
---

# Plan a version

Group one master version into a few major features. Each feature is one
session contract. `plan-session` later turns that contract into many Ordered
work steps. The operator looks at `development` during those steps, not
because a session ended.

A session is a feature a player or operator would name. On a 4.0-shaped
Atlas version that might be four contracts: how the map draws and behaves,
paste, blank-map authoring, and one more if a fourth feature is real.
Numbered slices (`4.0.1`, `4.0.2`, `4.0.3`) collapse into those features
when they belong together.

The master plan's goals, required outcomes, invariants, cleanup, and genuine
dependencies are fixed. Its proposed sub-version, session, branch, and PR
headings are provisional until this skill completes.

Inputs: a `plan-version` resolver directive, active master plan, live
`origin/development`, relevant open issues, and artifact schemas.

Output: an operator-approved feature grouping, then one schema-complete
contract and index entry per feature. Session implementation plans are
`plan-session`.

When talking with the operator, write in plain English and invoke `unslop`
on what you say.

## 1. Build the feature ledger

Done when every master-plan goal, invariant, cleanup, dependency, acceptance
outcome, UX gate, and operator decision sits under a named feature, and no
delivery heading was taken as a feature.

1. Require the resolver directive to name `plan-version`; otherwise report it
   and return to `start-session`.
2. Read the master plan, live code and tests, prior as-builts in the
   active version, relevant open issues, and
   `docs/workflows/schema/session-contract.md`.
3. Name the major features the version actually ships. That list is the
   session count you will argue for. Plumbing, layers, and review pauses
   are not features.

## 2. Co-author the grouping

Done when the operator has settled which features exist and which old
headings fold into which feature.

1. Present a short grouping: each proposed feature, what it includes, and
   which numbered slices or roadmap headings fold into it.
2. Walk the grouping with the operator. Challenge a heading that is only a
   layer, a wait, or a review checkpoint. Propose a merge when two headings
   are one feature. Split only when they are two features.
3. Keep a second session only for a real wait or soak, a decision that
   changes later implementation, an independent rollback or deployment
   boundary, unbounded discovery, a materially different high-risk domain,
   or explicitly approved parallel work. A look on `development` is not a
   session boundary.

## 3. Review the grouping

Done when both reviewers returned `CLEAN` on the settled grouping.

1. For each feature show covered ledger items, the headings it absorbs,
   internal phases as movements inside the feature, and split triggers.
2. Present current heading count versus proposed feature count and a
   complete heading-to-feature map.
3. Launch a fresh `structure-reviewer` and a fresh `behavior-reviewer` in
   parallel against the grouping, fixed outcomes, and source evidence.
   Launch them by those type names and omit Task `model`. The review must
   reject a session that exists only to host a look or a layer. Continue
   when both return `CLEAN`, or every accepted finding is corrected and
   re-reviewed clean.

## 4. Approve before writing

Done when the operator has approved the grouping, the master plan and
contracts are on `origin/development`, and any short-lived source branch
is gone.

1. Present the feature list, the heading-to-feature map, and the hard
   reason for every remaining split (`CLEAN` only).
2. Obtain operator approval while the repository remains unchanged.
3. After approval, update the master plan's delivery topology first.
4. Reconcile stale unexecuted contracts and index entries next.
5. Create one schema-complete contract per approved feature last. Delivery
   unit is land-each-Ordered-work-step-on-`development`. Internal phases
   name movements inside the feature. They are not extra sessions.
6. Land and clean those commits onto `development` using `start-session`
   section 3.
7. Run `python3 tools/cli.py lifecycle check-evidence` and
   `python3 tools/cli.py test`, rerun the resolver, report the new
   directive, and stop. Material grouping or contract changes require
   renewed approval.

## Return

Render this form in chat. Use exactly these four bullets. Leave the result
out of a code fence, and write no second summary in front of it.

## Version topology: `APPROVED` | `BLOCKED`

- **Subject:** Master `<X.Y>`; roadmap `<path>`
- **Result:** <approval or stop reason; feature count; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
