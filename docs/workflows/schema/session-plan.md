# Session plan schema

Canonical form for approved LGI.tools session plans. A plan is the
starting execution prompt for one session: bind the contract product
boundary to a decision-dense implementation blueprint. At approval, leave no
open material design choices for unilateral invention; during execution, live
operator discussion may reshape interfaces or steps without returning to
`plan-session`. The `plan-session` skill owns investigation, review,
approval, persistence, and handoff.

An approved plan starts with this frame:

```markdown
# Session X.Y.N.M Implementation Plan — Title

**Plan status:** Approved
**Approved:** YYYY-MM-DD
**Contract:** `docs/session-contracts/X.Y/X.Y.N.M.md`
**Contract digest:** `sha256:<64 lowercase hexadecimal characters>`
**Planning standard:** `docs/workflows/schema/session-plan.md`
**Proof standard:** Atomic
**Execution status:** Pending
**Baseline effect:** Neutral
```

Marker vocabularies:

- `Plan status` — exactly `Approved`.
- `Approved` — `YYYY-MM-DD`.
- `Contract` — repository-relative contract path.
- `Contract digest` — lowercase SHA-256 of that contract's exact bytes, prefixed with `sha256:`.
- `Planning standard` — exactly `docs/workflows/schema/session-plan.md`.
- `Proof standard` — exactly `Atomic`. Bind each success criterion to separately executable proof rows with one required observable per row. Plans before session `4.0.2.2.2` are a frozen legacy exception.
- `Execution status` — `Pending` or `Complete`. Close-out sets `Complete` only after required delivery evidence exists.
- `Baseline effect` — `Improves`, `Neutral`, or `Temporary pressure`.

Map every contract item — no silent drops:

- Objective, dependency (`DEP-N`), done condition (`DC-N`) → Bottom line, Current state, Why now, Scope, Success criteria
- in scope (`IS-N`) / out of scope (`OOS-N`) → Scope coverage
- hard constraint (`HC-N`) → hard_constraints
- planning decision (`PD-N`) → Resolved implementation decisions
- acceptance (`AC-N`), verification (`V-N`) → Success criteria
- operator gate (`G-N`) → exact pauses

Every approved plan contains each following `##` heading exactly once in this order. Shown `###` subsections are required; placeholder rows expand or contract to fit the session.

## Bottom line (READ FIRST)

- **GOAL:** [One sentence: finished destination, not the work sequence.]
- **DONE =** [`SC-1` through `SC-N` below, plus one-line observable finished result. Do not copy commands here.]
- **OUT OF SCOPE:**
  - [Highest-risk Contract §5 exclusion an executor might absorb.]
  - [Nearby follow-on to keep visibly outside this implementation.]

<hard_constraints>

- **Contract HC-1:** [Full constraint and its implementation, verification, or delivery consequence.]
- **Contract HC-N:** [Every remaining contract-owned constraint; omit none.]
- **Plan:** [Live-code-derived non-negotiable: fixed interface, file or data boundary, compatibility, or required behavior.]

</hard_constraints>

Carry every `HC-N` here. Label additional implementation constraints `Plan`. The contract wins if a summary here is ambiguous.

**Branch:** `[exact branch name]` · **ends in PR:** `[yes/no]` · **gate:** [exact commit, review, operator, or merge evidence required at the session boundary]

**Contract UX gate:** `[Yes/No]` · **required pause:** [exact operator-review point, or `None` when the marker is `No` and the contract names no other pause]

## Read first

- `[active agent guide]`
- `[the approved contract]`
- `[only the two to five highest-leverage files to reopen before changing anything]`

## Current state and prerequisites

| Contract input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| `DEP-1` | `Verified` | [artifact, code, command output, or external fact] | [ordering or implementation consequence] |
| `DEP-2` | `Verified` | [evidence] | [what must happen before dependent work] |

List every applicable `DEP-N` once. `Live verdict` is `Verified` or `Blocking`. A plan with `Blocking` is not approval-ready.

## Why now

[One short paragraph: prerequisite, current failure or limitation, and the master-plan outcome this session unlocks.]

## Scope (the destination)

[Finished slice in behavior and contract terms. Destination, not a speculative file walkthrough.]

### Scope coverage

| Contract boundary | Implementation mapping or protection |
| --- | --- |
| `IS-1` | [owned surfaces and ordered steps that deliver this boundary] |
| `OOS-1` | [design, test, diff inspection, or delivery check that keeps this exclusion untouched] |

List every `IS-N` and `OOS-N` once.

## Resolved implementation decisions

- **Contract PD-1 — [decision name]: [selected answer].** [Live evidence and rationale.] **Rejected:** [structurally different alternative and why it loses.]
- **Contract PD-2 — [decision name]: [selected answer].** [Ownership, error behavior, keying, sequencing, performance, or compatibility.] **Rejected:** [alternative and its cost.]

Settle every decision the contract required planning to surface.

### Audit-remediation mapping

For a remediation contract, map each finding:

| Finding | Principle-level outcome | Selected plan elements | Proving criteria |
| --- | --- | --- | --- |
| `AF-NNN` | [contract's required design outcome] | [owned surfaces, resolved decisions, ordered steps] | [`SC-N` identifiers] |

Otherwise: `Not applicable — this is not an audit-remediation contract`.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** [exact hotspot rows or `None`].
- **Live proximity evidence:** [files, size/interface breadth, recent churn, and inside/adjacent/outside verdict].

### Preparatory refactor

[`None` with evidence when a clean seam already exists. Otherwise: smallest behavior-preserving refactor, characterization test, and evidence required before feature work.]

### Baseline effect and update

- **Effect:** [`Improves`, `Neutral`, or `Temporary pressure`, matching the header marker] — [principle-level reason].
- **Required update:** [exact baseline rows and measurements to refresh, or `None` with reason].

## Implementation blueprint

### Owned surfaces

- `[path or module]` — [decision or behavior it owns after this session].

### Interfaces and contracts

- `[symbol, schema, command, document section, or route]` — [signature or shape, preconditions, outputs, error behavior, caller ownership].
- [Draft interface comments for every new or changed production export. State explicitly when the session adds or changes no export.]

### Control and data flow

[Changed path from entry to result. State explicitly when no runtime data flow changes.]

### Edge and failure behavior

- [Named edge case] → [required result and owning layer].
- [Named failure or unavailable dependency] → [required result and evidence].

### Ordered work

1. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or behavior holds]. Prove with [focused evidence].
2. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or behavior holds]. Prove with [focused evidence].
3. **[Integration/reconciliation step].** Connect changed owners, remove or repoint superseded surfaces.

Each numbered step is one execution chat under `start-session`. Size as many
thin lookable slices as the bundle needs. Sequence so the operator can
exercise a change on `development` often, not after a long backend run with
the interface last. Close-out, promote, `thermos`, and `no-comments` stay
out of Ordered work. After every app-facing land, the execute chat pauses
for the operator look on `development`. When `Contract UX gate` is Yes,
include a dedicated Ordered work step whose outcome is `ux-check` evidence
plus the named `G-N` operator disposition, after there is something to look
at. That step is not the first look. Name concrete surfaces.

## Success criteria (agent-runnable — show the output)

- **SC-1 — Contract DC-1 / AC-1 / V-1.** [One observable outcome.]

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-1.1` | `[focused command or inspection]` | [One exact output, state transition, or behavior.] |

- **SC-2 — Contract DC-2 / AC-2 / V-2.** [One observable outcome.]

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-2.1` | `[current repository gate]` | [One expected zero-error or green result.] |

- **SC-3 — Contract DC-3 / AC-3 / V-3 / G-1.** [One observable outcome.]

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-3.1` | `[inspection, route, fixture, or generated artifact]` | [One concrete user-visible or contract-level result.] |
  | `SC-3.2` | `[operator-gate evidence]` | [Named pause reached and disposition recorded.] |

Proof identifiers are unique and contiguous within each criterion (`SC-1.1`, `SC-1.2`, …). Each proof row has one runnable command or focused inspection and one required observable. A passing command name is not acceptance evidence. Map every `DC-N` and `AC-N` to at least one numbered criterion, represent every `V-N` with runnable proof, and place every `G-N` in the delivery sequence.

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints` boundary held.
- **Delivery:** [land each Ordered work step on `development` through
  `start-session`; no land PR].
- **Lifecycle artifacts:** [plan marker, roadmap, changelog, baseline, as-built, or archive updates this session owns; omit the rest].
- **Handoff:** [exact resolver rerun, next-session pointer, or terminal pause after delivery]. Per-OW chat handoffs are owned by the `start-session` skill.

Overwrite on re-approval; do not append an execution log. Record in-session reshapes after approval in the session as-built — do not rewrite this frozen prompt mid-execution.
