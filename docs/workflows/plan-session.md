# Plan-session procedure

Turn one approved session contract into a decision-complete implementation plan
through iterative plain-English co-authoring with the operator. The contract is
a starting prompt for product intent; `docs/workflows/schema/session-plan.md`
owns the exact artifact form. This procedure owns investigation, collaborative
shaping, review, approval, persistence, and handoff.

## Execution contract

Inputs: a `plan-session` resolver directive, the selected contract and exact
bytes, the active guide chain, prior session as-built records in the active
version, baseline/state, live repository, and current primary documentation.

The contract is the planning prompt: verify its claims against live code and
prior as-built records, honor its intent, and let in-session operator
direction supersede its text. Contracts are never edited during or after
planning; divergences settle in the plan, and the executed session's as-built
record closes the loop. Do not rewind to contract or topology authoring for
this session.

Output: one approved plan at `docs/session-plans/X.Y/<session>.md` whose digest
matches the contract and whose settled steps give the executor a concrete
starting blueprint. The plan is decision-dense at approval; execution may still
reshape through live operator discussion without returning here.

## Reconcile the bundle

1. Require the resolver directive to name `plan-session`; otherwise report it
   and return to `start-session`.
2. Read the contract and session-plan schema, then reconcile every dependency,
   boundary, decision, acceptance claim, evidence category, baseline effect, and
   operator gate against current repository evidence and live code. Use
   `repo-mapper` (Codegraph CLI: `callers`, `callees`, `impact`, `query`) for
   material relationship, consumer, dependency, or blast-radius claims. Keep
   conceptual discovery on Explore, semantic search, and grep. Investigate as
   needed, but do not draft the full plan yet.
3. Treat the contract's approved execution bundle as fixed. Do not split it
   because work has phases, touches different owners, needs producer/consumer
   ordering, or contains a resumable review pause.
4. If a recorded split trigger fires or live evidence appears to invalidate the
   bundle, pause and discuss with the operator in this session. Do not rewrite
   the contract and do not return to topology planning as an ordinary path.
   Continue co-authoring the plan under the operator's settled direction;
   backlog or a later session is an extremely rare, operator-driven cut only.

## Co-author the plan

Iterative discussion with the operator is the default. Do not research silently
and present a complete schema plan for approval.

1. Present a short plain-English overview of what the contract implies this
   session will build — destination, boundaries, and major unknowns — so the
   operator forms a mental model before any section detail.
2. Walk the plan one logical section at a time with the operator. Suggested
   order: destination and scope; key decisions; interfaces and control flow;
   ordered work; success criteria and proof; delivery and handoff. For each
   section, discuss in plain English, adjust from live evidence and operator
   direction, and confirm before moving on. Stay in prose; do not jump ahead
   to a complete schema document. Size each Ordered work step for one
   execution chat; do not place close-out, adversarial review, push, or PR
   opening inside Ordered work — those belong under End of session Delivery.
   When `UX gate` is Yes, size a dedicated UX Ordered work step that invokes
   `ux-check` and completes the operator pause; never nest that gate under
   close-out Delivery. Per-step commit after green gates and `primitive-checker` is
   part of Ordered work under `start-session`, not End of session Delivery.
3. Resolve every contract planning decision (`PD-N` and consequential choices)
   during this walk. Do not escalate ordinary local implementation details;
   surface choices that change behavior, ownership, risk, or scope. For every
   framework-sensitive interface or runtime claim, use `docs-researcher` for
   current primary documentation and examples. If feasibility remains unproved,
   present bounded alternatives in the current section discussion instead of
   freezing one as exact.
4. Stop before fixed-schema drafting until every section above is settled with
   the operator and both share a full mental model of the session.

## Assemble and review

1. Only after co-authoring is complete, assemble the fixed-schema plan from the
   settled conversation. Produce every required plan marker, heading, mapping,
   interface, control-flow statement, edge/failure behavior, ordered work item,
   and command-plus-output success criterion. No Blocking prerequisite or
   unresolved placeholder may remain.
2. Run the planning approval gate: invoke `adversarial-review` against the
   complete draft, contract, schema, and source evidence. That invocation uses
   `holistic-reviewer` as the integrative seat for one review pass. Reconcile
   every verified finding. Do not automatically relaunch adversarial-review. Do
   not persist reviewer transcripts or superseded drafts.

## Approve, persist, and stop

1. Present a short plain-English summary with the complete reviewed plan and
   obtain operator approval while the repository remains unchanged.
2. Persist the approved plan with approval date, exact contract digest,
   `Execution status: Pending`, and every schema-required section.
   Do not save or treat a harness-native plan as a second lifecycle artifact.
3. Run the resolver and drift gate again, report the new directive, and stop.
   Execution begins through a fresh `start-session`; overwrite a re-approved
   plan in place rather than appending history or creating a separate prompt.

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## Plan session: `APPROVED` | `BLOCKED`

- **Subject:** Session `<id>`; plan `<path or Not written>`
- **Result:** <approval or stop reason; ≤2 sentences>
- **Action:** <fresh start-session action or continue co-authoring>
- **Blocker:** <exact blocker or `None`>
```
