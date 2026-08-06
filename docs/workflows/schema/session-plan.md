# Session plan schema

Canonical form for approved LGI.tools session plans. A plan is the starting execution prompt for one session: bind the contract product boundary to a decision-dense implementation blueprint. At approval, leave no open material design choices for unilateral invention; during execution, live operator discussion may reshape interfaces or steps without returning to `plan-session`. `docs/workflows/plan-session.md` owns investigation, review, approval, persistence, and handoff.

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
- `Proof standard` — exactly `Atomic`. Bind each success criterion to separately executable proof rows with one required observable per row. Plans before session `4.0.2.2.2` are a frozen legacy exception: the resolver does not require the `Proof standard` marker or atomic proof rows for them; close-out proves their criteria under the plan's written evidence form.
- `Execution status` — `Pending` or `Complete`. Close-out sets `Complete` only after required delivery evidence exists.
- `Baseline effect` — `Improves`, `Neutral`, or `Temporary pressure`:
  - `Improves` — reduces a named hotspot, suppression, override, duplication, or change-amplification pressure.
  - `Neutral` — protects measured surfaces; introduces no new pressure.
  - `Temporary pressure` — deliberately worsens a named measured surface and names the bounded reconciliation already scheduled in the same master version.

Keep the contract as the product boundary; make it executable without expanding it. Map every contract item — no silent drops:

- Objective, `DEP-N`, `DC-N` → Bottom line, Current state, Why now, Scope, Success criteria
- every `IS-N` / `OOS-N` → Scope coverage; every `HC-N` → hard_constraints
- every `PD-N` → Resolved implementation decisions
- every `DC-N`, `AC-N`, `V-N` → Success criteria; UX marker and every `G-N` → exact pauses
- Baseline/hotspot and Close-out → design pressure, Delivery, Lifecycle artifacts, Handoff

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

Do not repeat generic repository fences from the active agent guide. Carry every `HC-N` here, including verification- or delivery-only constraints; label additional implementation constraints `Plan`. The contract wins if a summary here is ambiguous.

**Branch:** `[exact branch name]` · **ends in PR:** `[yes/no]` · **gate:** [exact commit, review, operator, or merge evidence required at the session boundary]

**Contract UX gate:** `[Yes/No]` · **required pause:** [exact operator-review point, or `None` when the marker is `No` and the contract names no other pause]

## Read first

- `[active agent guide]`
- `[the approved contract]`
- `[only the two to five highest-leverage files, interfaces, maps, or current references to reopen before changing anything]`

Execution list only — not a planning research trail.

## Current state and prerequisites

| Contract input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| `DEP-1` | `Verified` | [artifact, code, command output, or external fact] | [ordering or implementation consequence] |
| `DEP-2` | `Verified` | [evidence] | [what must happen before dependent work] |

List every applicable `DEP-N` once. `Live verdict` is `Verified` or `Blocking`. Put ordering in the consequence column. A plan with `Blocking` (or any other verdict) is not approval-ready — return through the lifecycle.

## Why now

[One short paragraph: prerequisite, current failure or limitation, and the master-plan outcome this session unlocks.]

## Scope (the destination)

[Finished slice in behavior and contract terms: inputs, outputs, ownership, in-scope edge cases, what stays unchanged. Destination, not a speculative file walkthrough. State how Contract §§3–6 are satisfied without widening them.]

### Scope coverage

| Contract boundary | Implementation mapping or protection |
| --- | --- |
| `IS-1` | [owned surfaces and ordered steps that deliver this boundary] |
| `OOS-1` | [design, test, diff inspection, or delivery check that keeps this exclusion untouched] |

List every `IS-N` and `OOS-N` once. Bottom line highlights only highest-risk exclusions; this table proves full boundary coverage.

## Resolved implementation decisions

- **Contract PD-1 — [decision name]: [selected answer].** [Live evidence and rationale.] **Rejected:** [structurally different alternative and why it loses.]
- **Contract PD-2 — [decision name]: [selected answer].** [Ownership, error behavior, keying, sequencing, performance, or compatibility.] **Rejected:** [alternative and its cost.]

Settle every decision the contract required planning to surface. An open material decision means not approval-ready. For diagnosis-only work, define the claim, hypotheses and tests, evidence to report, and the explicit no-fix boundary.

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
- `[path or module]` — [responsibility added, removed, or preserved].

### Interfaces and contracts

- `[symbol, schema, command, document section, or route]` — [signature or shape, preconditions, outputs, error behavior, caller ownership].
- [Draft interface comments for every new or changed production export. State explicitly when the session adds or changes no export or public interface.]

### Control and data flow

[Changed path from entry to result: validation, persistence, cache, external-service, and failure boundaries that matter. State explicitly when no runtime data flow changes.]

### Edge and failure behavior

- [Named edge case] → [required result and owning layer].
- [Named failure or unavailable dependency] → [required result and evidence].

### Ordered work

1. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or behavior holds]. Prove with [focused evidence].
2. **[Outcome-sized step].** Change `[named surfaces]` so [specific invariant or behavior holds]. Prove with [focused evidence].
3. **[Integration/reconciliation step].** Connect changed owners, remove or repoint superseded surfaces, and name evidence that no parallel owner remains.

Each numbered step is one execution chat under `start-session`: implement (after the docs gate when touching production or test code), prove it, run `gate-runner`, launch `primitive-checker`, update SCRATCHPAD OW fields, commit, and hand off. Do not list close-out, adversarial review, push, or PR opening as Ordered work — **End of session** Delivery owns those. When `Contract UX gate` is Yes, include one dedicated Ordered work step whose outcome is `ux-check` evidence plus the named `G-N` operator disposition; close-out consumes that disposition and does not re-own the pause. Per-step commit after green gates and a clean `primitive-checker` verdict is part of Ordered work. Name concrete surfaces and resulting contracts. Avoid open-ended instructions ("update relevant files," "add tests as needed," "handle edge cases").

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

Proof identifiers are unique and contiguous within each criterion (`SC-1.1`, `SC-1.2`, …). Each proof row has one runnable command or focused inspection and one required observable; do not combine unrelated behaviors. A passing command name or bare "tests pass" is not acceptance evidence. Map every `DC-N` and `AC-N` to at least one numbered criterion, represent every `V-N` with runnable proof, and place every `G-N` in the delivery sequence. `DONE =` references `SC-N` identifiers instead of duplicating evidence actions.

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints` boundary held; confirm the baseline verdict and, when `Contract UX gate` is Yes, that the dedicated UX Ordered work step completed the contract UX pause before Delivery.
- **Delivery:** [exactly push in-branch after OW commits, open a PR, merge, or stop with a non-code artifact; assume the UX Ordered work disposition is already recorded when the marker is Yes].
- **Lifecycle artifacts:** [plan marker, roadmap, changelog, baseline, SCRATCHPAD, or archive updates this session owns; omit the rest].
- **Handoff:** [exact resolver rerun, next-session pointer, or terminal pause after delivery]. Per-OW chat handoffs are owned by `docs/workflows/start-session.md` and SCRATCHPAD OW fields; this Handoff is the post-close-out session-boundary pointer only.

Overwrite on re-approval; do not append an execution log. Make the contract concrete; never expand its product scope. Persist only the final approved design. Drop reviewer transcripts, review-pass counts, superseded alternatives, revision history, and research chronology. Keep execution-affecting constraints, rationales, and tradeoffs in their owning sections. Record in-session reshapes after approval in the session as-built — do not rewrite this frozen prompt mid-execution.
