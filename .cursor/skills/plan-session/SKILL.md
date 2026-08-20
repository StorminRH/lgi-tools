---
name: plan-session
description: Turn one approved lifecycle session contract into a reviewed, decision-complete implementation plan and persist it after operator approval. Use when the lifecycle resolver selects plan-session or the operator asks to plan a named approved session contract.
---

# Plan a lifecycle session

Turn one approved session contract into a decision-complete implementation plan
through iterative plain-English co-authoring with the operator. The contract is
a starting prompt for product intent. `docs/workflows/schema/session-plan.md`
owns the artifact form. `start-session` owns execute branches and land and
clean.

Inputs: a `plan-session` resolver directive, the selected contract and exact
bytes, prior session as-built records, baseline/state, and live
`origin/development`.

The contract is the planning prompt. Verify its claims against live code.
Contracts stay frozen during and after planning; divergences settle in the
plan. Split-trigger or bundle invalidation pauses for the operator. Topology
authoring is not an ordinary return path.

Output: one approved plan at `docs/session-plans/X.Y/<session>.md` whose digest
matches the contract, landed on `origin/development`. Execution may still
reshape through live operator discussion without returning here. Each Ordered
work step is one later `start-session` chat that lands on `development`.

## 1. Reconcile the bundle

Done when every contract `DEP-N`, `IS-N`, `OOS-N`, `HC-N`, `PD-N`, `AC-N`,
`V-N`, and `G-N` has a live-code verdict, and the bundle still holds.

1. Require the resolver directive to name `plan-session`; otherwise report it
   and return to `start-session`.
2. Read the contract and session-plan schema. Reconcile every dependency,
   boundary, decision, acceptance claim, evidence category, baseline effect,
   and operator gate against live `origin/development`. Investigate as needed.
   Leave the full schema draft for after co-authoring.
3. Treat the contract's approved execution bundle as fixed. Phases, owners,
   producer/consumer order, and a resumable review pause are internal
   structure, not split reasons.
4. If a recorded split trigger fires or live evidence appears to invalidate
   the bundle, pause and discuss with the operator.

Launch `repo-mapper` when the contract implies a code change whose callers,
callees, or blast radius are unknown. Launch `docs-researcher` when a claim
depends on React, Next.js, Convex, Base UI, React Flow, Vitest, or a peer.
Name those seats and omit Task `model`.

## 2. Co-author the plan

Done when the operator has settled destination and scope, key decisions,
interfaces and control flow, ordered work, success criteria and proof, and
delivery and handoff.

Iterative discussion with the operator is the default. Research in the open.

1. Present a short plain-English overview of what the contract implies this
   session will build: destination, boundaries, and major unknowns.
2. Walk the plan one logical section at a time with the operator. Suggested
   order: destination and scope; key decisions; interfaces and control flow;
   ordered work; success criteria and proof; delivery and handoff.
3. Size Ordered work as many thin steps as the bundle needs (five, ten,
   twenty). Each step is one `start-session` execute chat: the work, the
   local test suite, `structure-reviewer` and `behavior-reviewer`, then land
   and clean onto `development`. Sequence those steps as lookable slices.
   The operator should be able to exercise a change on `development` often,
   not after a long backend run with the interface last. A step that has no
   user-facing result yet still lands; the next step that does is the next
   look. Close-out, promote, `thermos`, and `no-comments` stay out of
   Ordered work. When `UX gate` is Yes, include `ux-check` after there is
   something on `development` to look at. That step is not the first look.
4. After every app-facing land, the execute chat pauses for the operator to
   look at `development` (Preview, or laptop `pnpm dev` when they choose).
   Their disposition is the gate to the next Ordered work step.
5. Resolve every contract planning decision (`PD-N`) during this walk.
   Surface choices that change behavior, ownership, risk, or scope.
6. Record delivery as land-on-`development`. The plan's `Branch` is the land
   line `development` and `ends in PR` is `no`. `start-session` cuts
   `lifecycle/<session>-ow-<n>` from that tip at execute time. Promote when
   app-facing files versus `staging` are around 100. That promote is
   close-out, not this session's land.

## 3. Assemble and review

Done when the draft matches the schema, every section from the walk is
filled, and both reviewers returned `CLEAN` on that draft.

1. Assemble the fixed-schema plan from the settled conversation. Every
   prerequisite is `Verified`. Every placeholder is resolved.
2. Launch a fresh `structure-reviewer` and a fresh `behavior-reviewer` in
   parallel against the draft, contract, schema, and source evidence. Launch
   them by those type names and omit Task `model`. Plans are report-only:
   revise the draft on `FINDINGS`, then re-launch both. Continue when both
   return `CLEAN`, or every accepted finding is corrected and re-reviewed
   clean. Leave reviewer transcripts and superseded drafts unpersisted.

## 4. Approve, persist, and land

Done when the operator has approved the reviewed plan, the file is on
`origin/development`, and any short-lived source branch is gone.

1. Present a short summary with the complete reviewed plan and obtain
   operator approval while the repository remains unchanged.
2. Persist the approved plan with approval date, exact contract digest,
   `Execution status: Pending`, and every schema-required section.
3. Land and clean that commit onto `development` using `start-session`
   section 3. Persist on `development` itself, or on a short-lived branch
   cut from `origin/development` and then landed. The next execute chat
   cuts `lifecycle/<session>-ow-1` from that tip.
4. Run the resolver and drift gate again, report the new directive, and
   stop. Execution begins through a fresh `start-session`.

## Return

Render this form in chat. Use exactly these four bullets. Leave the result
out of a code fence, and write no second summary in front of it.

## Plan session: `APPROVED` | `BLOCKED`

- **Subject:** Session `<id>`; plan `<path or Not written>`
- **Result:** <approval or stop reason; ≤2 sentences>
- **Action:** <fresh start-session action or continue co-authoring>
- **Blocker:** <exact blocker or `None`>
