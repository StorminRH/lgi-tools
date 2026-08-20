---
name: plan-session
description: Turn one approved lifecycle session contract into a reviewed, decision-complete implementation plan and persist it after operator approval. Use when the lifecycle resolver selects plan-session or the operator asks to plan a named approved session contract.
---

# Plan a lifecycle session

Turn one approved session contract into a decision-complete implementation plan
through iterative plain-English co-authoring with the operator. The contract is
a starting prompt for product intent; `docs/workflows/schema/session-plan.md`
owns the exact artifact form.

Inputs: a `plan-session` resolver directive, the selected contract and exact
bytes, prior session as-built records, baseline/state, and live repository.

The contract is the planning prompt. Verify its claims against live code.
Contracts are never edited during or after planning; divergences settle in the
plan. Do not rewind to contract or topology authoring for this session.

Output: one approved plan at `docs/session-plans/X.Y/<session>.md` whose digest
matches the contract. Execution may still reshape through live operator
discussion without returning here.

## 1. Reconcile the bundle

1. Require the resolver directive to name `plan-session`; otherwise report it
   and return to `start-session`.
2. Read the contract and session-plan schema, then reconcile every dependency,
   boundary, decision, acceptance claim, evidence category, baseline effect, and
   operator gate against live code. Investigate as needed, but do not draft the
   full plan yet.
3. Treat the contract's approved execution bundle as fixed. Do not split it
   because work has phases, touches different owners, needs producer/consumer
   ordering, or contains a resumable review pause.
4. If a recorded split trigger fires or live evidence appears to invalidate the
   bundle, pause and discuss with the operator. Do not rewrite the contract and
   do not return to topology planning as an ordinary path.

## 2. Co-author the plan

Iterative discussion with the operator is the default. Do not research silently
and present a complete schema plan for approval.

1. Present a short plain-English overview of what the contract implies this
   session will build — destination, boundaries, and major unknowns.
2. Walk the plan one logical section at a time with the operator. Suggested
   order: destination and scope; key decisions; interfaces and control flow;
   ordered work; success criteria and proof; delivery and handoff. Size each
   Ordered work step for one execution chat. Do not place close-out,
   adversarial review, push, or PR opening inside Ordered work. When `UX gate`
   is Yes, size a dedicated UX Ordered work step that invokes `ux-check` and
   completes the operator pause.
3. Resolve every contract planning decision (`PD-N`) during this walk. Surface
   choices that change behavior, ownership, risk, or scope. Use
   `docs-researcher` for framework-sensitive claims.
4. Stop before fixed-schema drafting until every section above is settled with
   the operator.

## 3. Assemble and review

1. Only after co-authoring is complete, assemble the fixed-schema plan from the
   settled conversation. No Blocking prerequisite or unresolved placeholder may
   remain.
2. Invoke `adversarial-review` against the complete draft, contract, schema, and
   source evidence. Continue only with `PASS`. Do not persist reviewer
   transcripts or superseded drafts.

## 4. Approve, persist, and stop

1. Present a short summary with the complete reviewed plan (`PASS` only) and
   obtain operator approval while the repository remains unchanged.
2. Persist the approved plan with approval date, exact contract digest,
   `Execution status: Pending`, and every schema-required section.
3. Run the resolver and drift gate again, report the new directive, and stop.
   Execution begins through a fresh `start-session`.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Plan session: `APPROVED` | `BLOCKED`

- **Subject:** Session `<id>`; plan `<path or Not written>`
- **Result:** <approval or stop reason; ≤2 sentences>
- **Action:** <fresh start-session action or continue co-authoring>
- **Blocker:** <exact blocker or `None`>
