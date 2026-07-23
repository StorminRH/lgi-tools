# Plan-session procedure

Turn one approved session contract into a decision-complete implementation plan.
The contract owns the product boundary; `docs/workflows/schema/session-plan.md`
owns the exact artifact form. This procedure owns investigation, judgment,
review, approval, persistence, and handoff.

## Execution contract

Inputs: a `plan-session` resolver directive, the selected contract and exact
bytes, the active guide chain, baseline/state, live repository, and current
primary documentation.

Output: one approved plan at `docs/session-plans/X.Y/<session>.md` whose digest
matches the contract and whose steps leave no material implementation decision
to the executor.

## Reconcile the bundle

1. Require the resolver directive to name `plan-session`; otherwise report it
   and return to `start-session`.
2. Read the contract and session-plan schema, then reconcile every dependency,
   boundary, decision, acceptance claim, evidence category, baseline effect, and
   operator gate against Codegraph and live code.
3. Treat the contract's approved execution bundle as fixed. Do not split it
   because work has phases, touches different owners, needs producer/consumer
   ordering, or contains a resumable review pause.
4. Return to topology planning only when a recorded split trigger fires or live
   evidence reveals a material scope conflict. Record the exact trigger; never
   manufacture a new session as an ordinary implementation choice.

## Draft and review

1. Discuss the intended implementation shape with the operator in plain English
   before fixed-schema drafting.
2. Resolve every contract planning decision from live evidence. Keep ordinary
   local implementation choices with the agent; surface only consequential
   decisions that change behavior, ownership, risk, or scope.
3. Produce every required plan marker, heading, mapping, interface, control-flow
   statement, edge/failure behavior, ordered work item, and command-plus-output
   success criterion. No Blocking prerequisite or unresolved placeholder may
   remain.
4. Give the complete draft, contract, and evidence to one fresh read-only
   high-effort adversarial reviewer. Reconcile every finding and permit at most
   one rerun after a material architecture, scope, or verification change. Do
   not persist reviewer transcripts or superseded drafts.

## Approve, persist, and stop

1. Present a short plain-English summary with the complete reviewed plan and
   obtain operator approval while the repository remains unchanged.
2. Persist the approved plan with approval date, exact contract digest,
   `Execution status: Pending`, and every schema-required section.
3. Run the resolver and drift gate again, report the new directive, and stop.
   Execution begins through a fresh `start-session`; overwrite a re-approved
   plan in place rather than appending history or creating a separate prompt.

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## Plan session: `APPROVED` | `BLOCKED`

- **Session:** `<id>`
- **Contract:** `<path and digest>`
- **Plan:** `<path or Not written>`

### Review and approval

- **Implementation shape:** <plain-English summary>
- **Contract coverage:** <complete mapping summary or Not reached>
- **Adversarial review:** <review result and finding disposition or Not reached>
- **Operator approval:** <approval evidence or Not approved>

### Next state

- **Resolver directive:** <complete fresh directive or Not reached>
- **Handoff:** <fresh start-session action or planning correction>
- **Blocker:** <exact blocker or None>
```
