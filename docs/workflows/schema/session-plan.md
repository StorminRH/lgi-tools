# Session plan schema

This file is the canonical form for approved LGI.tools session plans. A plan is
the execution prompt for one session: it binds the contract's product boundary
to a concrete implementation blueprint an executing agent can follow without
making material design choices. This schema owns both the inputs a planning
agent must reconcile and the required output shape; runtime skills own only
lifecycle, review, approval, persistence, and handoff mechanics.

**Authoring inputs — schema guidance only; do not copy this inventory into the
persisted plan.** Before drafting, reconcile:

- the resolver-selected version-plan decisions and delivery fork, contract
  index, selected contract, and exact contract bytes;
- the active agent-guide chain, current code-health state, SCRATCHPAD, and only
  the backlog entries relevant to the contracted boundary;
- Graphify orientation, the live code and tests that own the affected behavior,
  and current primary documentation for moving external APIs; and
- every inherited dependency, assumption, and boundary against live evidence.

A material conflict or blocking prerequisite returns through the lifecycle; it
is never converted into a speculative plan step.

An approved plan starts with this frame:

```markdown
# Session X.Y.N.M Implementation Plan — Title

**Plan status:** Approved
**Approved:** YYYY-MM-DD
**Contract:** `docs/session-contracts/X.Y/X.Y.N.M.md`
**Contract digest:** `sha256:<64 lowercase hexadecimal characters>`
**Planning standard:** `docs/workflows/schema/session-plan.md`
**Execution status:** Pending
**Baseline effect:** Neutral
```

The marker values are closed vocabularies:

- `Plan status` is exactly `Approved`.
- `Approved` is the approval date in `YYYY-MM-DD` form.
- `Contract` is the repository-relative path to the session's canonical
  contract.
- `Contract digest` is the lowercase SHA-256 digest of that contract's exact
  bytes, prefixed with `sha256:`.
- `Planning standard` is exactly
  `docs/workflows/schema/session-plan.md`.
- `Execution status` is exactly `Pending` or `Complete`. Close-out changes it
  to `Complete` only after the session's required delivery evidence exists.
- `Baseline effect` is exactly `Improves`, `Neutral`, or `Temporary pressure`:
  - `Improves` reduces a named hotspot, suppression, override, duplication, or
    change-amplification pressure.
  - `Neutral` protects measured surfaces and introduces no new pressure.
  - `Temporary pressure` deliberately worsens a named measured surface and
    identifies the bounded reconciliation already scheduled in the same master
    version.

The contract remains the authoritative product boundary; the plan makes that
boundary executable without expanding it. No contract section may silently
disappear during planning:

- contract Objective, `DEP-N` context, and `DC-N` done conditions feed the
  plan's Bottom line, Current state and prerequisites, Why now, Scope, and
  Success criteria;
- every `IS-N` and `OOS-N` boundary maps through the plan's Scope coverage, and
  every `HC-N` hard constraint appears in the slice-specific constraint block;
- every `PD-N` decision is answered under Resolved implementation decisions;
- every `DC-N`, `AC-N`, and `V-N` proof obligation maps to numbered success
  evidence, while the UX marker and every `G-N` gate map to exact pauses; and
- the Baseline/hotspot boundary and Close-out behavior become explicit design
  pressure, delivery, lifecycle-artifact, and handoff instructions.

Every approved plan contains each following `##` heading exactly once in this
order. Its shown `###` subsections are also required; repeated placeholder rows
and list items illustrate the expected content and may expand or contract to fit
the session.

## Bottom line (READ FIRST)

- **GOAL:** [One sentence describing the finished destination, not the work
  sequence.]
- **DONE =** [`SC-1` through `SC-N` below, plus a one-line statement of the
  observable finished result. Do not copy the commands here.]
- **OUT OF SCOPE:**
  - [The highest-risk exclusion from Contract §5 that an executor might
    otherwise absorb.]
  - [Another nearby follow-on to keep visibly outside this implementation.]

<hard_constraints>

- **Contract HC-1:** [The full contract-owned constraint and its implementation,
  verification, or delivery consequence.]
- **Contract HC-N:** [Every remaining contract-owned constraint; none may be
  omitted as indirect.]
- **Plan:** [A live-code-derived non-negotiable: fixed interface, file or data
  boundary, compatibility requirement, or required behavior.]

</hard_constraints>

Generic repository fences belong in the active agent guide and are not repeated
here. Carry every `HC-N` into this block unconditionally, including constraints
whose only consequence is verification or delivery; label additional
implementation constraints `Plan`.
The contract remains authoritative if a summary here is ever ambiguous.

**Branch:** `[exact branch name]` · **ends in PR:** `[yes/no]` · **gate:**
[the exact commit, review, operator, or merge evidence required at the session
boundary]

**Contract UX gate:** `[Yes/No]` · **required pause:** [the exact operator-review
point, or `None` when the marker is `No` and the contract names no other pause]

## Read first

- `[active agent guide]`
- `[the approved contract]`
- `[only the two to five highest-leverage files, interfaces, maps, or current
  references the executing agent must reopen before changing anything]`

This persisted list is for execution, not a history of what the planning agent
read. Do not copy the authoring-input inventory or research trail into it.

## Current state and prerequisites

| Contract input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| `DEP-1` | `Verified` | [current artifact, code, command output, or external fact] | [ordering or implementation consequence] |
| `DEP-2` | `Verified` | [evidence] | [what must happen before dependent work] |

Every applicable `DEP-N` item appears once. `Live verdict` is exactly `Verified`
or `Blocking`: `Verified` means current evidence establishes the dependency;
`Blocking` means it does not. Execution ordering belongs in the consequence
column, not in the verdict. A plan containing `Blocking`, or any other verdict,
is not approval-ready and returns through the lifecycle instead of papering the
gap over with an implementation step.

## Why now

[One short paragraph connecting the session to its prerequisite, current
failure or limitation, and the master-plan outcome it unlocks.]

## Scope (the destination)

[Describe the finished slice in behavior and contract terms: inputs, outputs,
ownership, in-scope edge cases, and what remains unchanged. This describes the
destination, not a speculative file-by-file walkthrough. Explicitly state how
Contract §§3–6 are satisfied without widening them.]

### Scope coverage

| Contract boundary | Implementation mapping or protection |
| --- | --- |
| `IS-1` | [owned surfaces and ordered steps that deliver this boundary] |
| `OOS-1` | [the concrete design, test, diff inspection, or delivery check that keeps this exclusion untouched] |

Every `IS-N` and `OOS-N` item appears once. The Bottom line highlights only the
highest-risk exclusions; this table proves full boundary coverage without
turning the plan's prose into a second contract.

## Resolved implementation decisions

- **Contract PD-1 — [decision name]: [selected answer].** [Live evidence and
  rationale.] **Rejected:** [the structurally different alternative and why it
  loses.]
- **Contract PD-2 — [decision name]: [selected answer].** [State ownership,
  error behavior, keying, sequencing, performance, or compatibility concretely.]
  **Rejected:** [the alternative and its cost.]

Every decision the contract required planning to surface has a settled answer
here. If a material decision remains open, the plan is not approval-ready.
For diagnosis-only work, this section instead defines the claim to verify, the
hypotheses and tests, the evidence to report, and the explicit no-fix boundary.

### Audit-remediation mapping

For a remediation contract, map each finding into the execution design:

| Finding | Principle-level outcome | Selected plan elements | Proving criteria |
| --- | --- | --- | --- |
| `AF-NNN` | [the contract's required design outcome] | [owned surfaces, resolved decisions, and ordered steps] | [`SC-N` identifiers] |

Use `Not applicable — this is not an audit-remediation contract` for other
sessions.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** [exact hotspot rows or `None`].
- **Live proximity evidence:** [relevant files, size/interface breadth, recent
  churn, and the resulting inside/adjacent/outside verdict].

### Preparatory refactor

[State `None` with evidence when the live structure already exposes a clean
seam. Otherwise define the smallest behavior-preserving refactor, its
characterization test, and the evidence required before feature work begins.]

### Baseline effect and update

- **Effect:** [`Improves`, `Neutral`, or `Temporary pressure`, matching the
  header marker] — [principle-level reason].
- **Required update:** [exact baseline rows and measurements to refresh, or
  `None` with the reason no measured surface changes].

## Implementation blueprint

### Owned surfaces

- `[path or module]` — [the decision or behavior it owns after this session].
- `[path or module]` — [the exact responsibility added, removed, or preserved].

### Interfaces and contracts

- `[symbol, schema, command, document section, or route]` — [exact signature or
  shape, preconditions, outputs, error behavior, and caller ownership].
- [Include draft interface comments for every new or changed production export.
  State explicitly when the session adds or changes no export or public
  interface.]

### Control and data flow

[Trace the changed path from entry point to result, naming validation,
persistence, cache, external-service, and failure boundaries that matter. State
explicitly when no runtime data flow changes.]

### Edge and failure behavior

- [Named edge case] → [required result and owning layer].
- [Named failure or unavailable dependency] → [required result and evidence].

### Ordered work

1. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or
   behavior holds]. Prove the step with [focused evidence].
2. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or
   behavior holds]. Prove the step with [focused evidence].
3. **[Integration/reconciliation step].** Connect the changed owners, remove or
   repoint superseded surfaces, and name the evidence that proves no parallel
   owner remains.

Each step names concrete surfaces and its resulting contract. Avoid open-ended
instructions such as "update relevant files," "add tests as needed," or
"handle edge cases."

## Success criteria (agent-runnable — show the output)

- **SC-1 — Contract DC-1 / AC-1 / V-1.** `[focused command]` → [the exact
  passing result or observed behavior].
- **SC-2 — Contract DC-2 / AC-2 / V-2.** `[current repository gate]` → [the
  expected zero-error or green result].
- **SC-3 — Contract DC-3 / AC-3 / V-3 / G-1.** `[inspection, route, fixture, or
  generated artifact]` → [the concrete output that proves the user-visible or
  contract-level result and reaches the named operator pause].

Success criteria pair every command with the output that must be shown. A bare
statement that tests pass is not acceptance evidence. Every `DC-N` and `AC-N`
maps to at least one numbered criterion, every `V-N` is represented by runnable
proof, and every `G-N` appears in the delivery sequence. `DONE =` references
these identifiers instead of duplicating their commands.

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints` boundary
  held; confirm the baseline verdict and contract UX pause were honored.
- **Delivery:** [exactly commit/push in-branch, open a PR, merge, or stop with a
  non-code artifact; include the required gate and operator pause].
- **Lifecycle artifacts:** [name the plan marker, roadmap, changelog, baseline,
  SCRATCHPAD, or archive updates that this session actually owns; omit those it
  does not].
- **Handoff:** [the exact resolver rerun, next-session pointer, or terminal pause
  required after delivery].

The plan is overwritten on re-approval rather than appended as an execution
log. It may make the contract concrete but never expand the product scope the
contract owns. Persist only the final approved design. Do not include reviewer
transcripts, review-pass counts, superseded alternatives, revision history, or
research chronology. A constraint, rationale, or tradeoff that still affects
execution belongs in its owning plan section; everything else is discarded.
