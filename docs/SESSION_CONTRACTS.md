# Session Contracts and Plans

Session contracts and approved session plans are the canonical executable
specifications for LGI.tools work. They replace separately maintained agent
prompts while keeping product intent separate from live-code implementation
design.

The artifact state machine lives in `docs/DEVELOPMENT_LIFECYCLE.md`.
`docs/DESIGN_PRINCIPLES.md` is the architectural constitution.

## Source model

- The active master version plan owns sequence, delivery status,
  cross-session dependencies, gates, and standing product decisions.
- A session contract owns one session's objective, scope, constraints,
  decisions, acceptance criteria, and close-out fork.
- An approved session plan owns the current implementation design derived from
  that contract and live repository state.
- `docs/SCRATCHPAD.md` owns observed state and the handoff from work that
  actually ran.
- `docs/CODE_HEALTH_BASELINE.md` owns current health evidence and campaign
  state.

No artifact copies another artifact's full contents. Plans reference contracts;
contracts reference the master plan; all defer to the active agent guides and
constitution for standing policy.

## From master plan to contracts

Use `plan-version` in Plan mode to extrapolate an approved master version plan
into session contracts. The skill proposes the complete decomposition before
writing, with both plain-English checkpoints: it discusses the intended shape
of the decomposition with Ryan in plain English before drafting, and presents
a short plain-English summary alongside the formal proposal before requesting
approval. Approval authorizes it to create or reconcile:

```text
docs/session-contracts/X.Y/INDEX.md
docs/session-contracts/X.Y/<full-session-id>.md
```

The index contains exactly three columns:

| Session | Sub-version | Contract |
| --- | --- | --- |
| X.Y.N.1 | X.Y.N | `X.Y.N.1.md` |

It maps ids and paths only. The master plan remains the single owner of delivery
status. Contract generation must also read the code-health baseline: every
contract names any hotspot it touches and preserves the version's selected
health campaign or explicit no-campaign decision.

## Contract shape

Every contract carries one machine-readable header marker near the top,
exactly `**UX gate:** Yes` or `**UX gate:** No`. It drives the operator-review
pause; inline prose elsewhere in the contract may discuss the gate freely, but
the header line is the single instance checkers read.

Every contract contains, in this order where practical:

1. Objective
2. Current context and dependencies
3. Done conditions
4. In scope
5. Out of scope
6. Hard constraints
7. Decisions the session plan must resolve
8. Acceptance criteria
9. Verification
10. UX/operator gates
11. Baseline/hotspot boundary
12. Close-out behavior

Audit-remediation contracts also name their `AF-NNN` finding ids and the
principle-level required outcome. Every open actionable finding maps to at least
one contract, and no remediation contract silently absorbs unaudited scope.

Use Markdown headings rather than model-specific XML. Write observable criteria
and runnable checks. Contracts describe **what must be true**, not a speculative
file-by-file implementation.

When a master-plan change materially changes a contract, `plan-version` presents
the new contract for approval. An already-approved session plan derived from the
old contract becomes stale; never silently bend it around the new scope.

## From contract to session plan

Use `plan-session` in Plan mode. It follows `docs/SESSION_PLANNING.md`, checks the
contract against live code and current external documentation, and presents the
detailed implementation plan before writing anything. Both plain-English
checkpoints apply: after loading context and before drafting, it discusses the
plan's intended shape with Ryan in plain English; before requesting approval,
it also presents a short plain-English summary alongside the formal plan so
the outcome, main tradeoff, success evidence, and scope boundary are clear at
a glance.

After Ryan approves and the runtime returns to execution mode, persist the plan
at:

```text
docs/session-plans/X.Y/<full-session-id>.md
```

Every approved plan begins with:

```markdown
# Session X.Y.N.M Implementation Plan — Title

**Plan status:** Approved
**Approved:** YYYY-MM-DD
**Contract:** `docs/session-contracts/X.Y/X.Y.N.M.md`
**Contract digest:** `sha256:<digest-at-approval>`
**Planning standard:** `docs/SESSION_PLANNING.md`
**Execution status:** Pending
**Baseline effect:** Neutral
```

Then include the output schema owned by `docs/SESSION_PLANNING.md`. The plan is
overwritten on re-approval; it is not an append-only execution log. The digest
is the lowercase SHA-256 of the contract's exact bytes. Marker vocabularies are
exact: `Execution status` is `Pending` or `Complete`; `Baseline effect` is
exactly one of `Improves`, `Neutral`, or `Temporary pressure`, classified per
`docs/SESSION_PLANNING.md` Step 7. Close-out changes the
execution marker to `Complete` only when the session's required delivery
evidence exists; the next agent can then select the next indexed contract.

## Starting a session

Use `start-session`. It runs the document-driven resolver, reports the returned
directive's action, reason, authority, primary artifact, and pause, and dispatches
only its named handler. A null handler stops for direction. A stage handler owns
one procedure and returns control after its outcome; `start-session` reruns the
resolver rather than allowing that handler to select a sibling. Planning
outcomes are session-terminal: after a planning handler persists its approved
artifact, `start-session` reports the new directive and stops — execution
begins in a fresh `start-session`.

For an execution directive, completed plans are skipped and the selected
approved plan plus matching contract digest are reconciled with the branch,
worktree, dependencies, and live code. Any material contradiction stops for
re-planning; otherwise the approved plan becomes the implementation todo list.

The existence of a high-level contract is not implementation approval. Only a
session plan with the approval markers above is executable.

## Version completion

When all master-plan rows are terminal, no session is selected. The resolver
directive enters audit planning or execution; after completed audit remediation
it directs a full audit restart. Any Floss or Campaign lets the resolver select
remediation planning for the same master version; Watch alone may remain
non-blocking with an explicit trigger. Contracts and plans stay active until a
clean audit finishes, then archive with the master and audit plan.

Historical prompt anthologies remain archived and are never operational input.
