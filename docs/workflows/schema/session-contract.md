# Session contract schema

This file is the canonical form for LGI.tools session contracts. Its numbered
second-level headings are the single source of the required contract sections;
the lifecycle resolver derives the required section titles from those headings.

The artifact chain has three distinct levels:

1. The **version plan** owns the complete roadmap, ordering, cross-session
   decisions, and sub-version delivery outcomes.
2. A **session contract** records the slice-relevant projection of that roadmap.
   It owns the session's product boundary and acceptance bar while preserving,
   not re-owning, the version plan's dependencies, ordering, and delivery fork.
3. An approved **session plan** reconciles that contract with live code and
   turns it into the descriptive execution prompt: settled decisions, exact
   owners and interfaces, control flow, edge behavior, ordered work, runnable
   proof, and delivery handoff.

A contract is intentionally concise and implementation-agnostic. It prevents a
planning session from silently changing product intent while investigating the
live repository. If it merely repeats the version plan, or if it prescribes
files and implementation steps the planning phase has not investigated, it is
not doing its job.

A contract starts with this frame:

```markdown
## Session X.Y.N.M — Title

**Sub-version:** X.Y.N
**Master plan:** `docs/VERSION_X_Y_PLAN.md` §X.Y.N
**UX gate:** No
**Execution profile:** Frontier autonomous coding agent
**Delivery unit:** One agent session, one shared sub-version branch, one sub-version PR
**Roadmap coverage:** §X.Y.N outcome or ordered outcome set
**Internal phases:** 1. First outcome; 2. Second outcome; 3. Integration and proof
**Split triggers:** Only the concrete conditions that require stopping or replanning
```

`UX gate` is exactly `Yes` or `No`. It is the machine-readable authority for
the operator's local browser-review pause. A contract uses `Yes` when the
session changes user-facing behavior or appearance and `No` otherwise.

`Execution profile` and `Delivery unit` use the exact values shown above. Every
session in a sub-version works on the same lifecycle branch; only the final
session opens the sub-version PR.
`Roadmap coverage`, `Internal phases`, and `Split triggers` are non-empty.
Roadmap coverage may name several approved roadmap sections. Internal phases
are ordered work inside the session, not new delivery boundaries. Split
triggers name only conditions that invalidate the approved bundle, such as an
external wait, a material scope conflict, a genuinely unreviewable combined
diff, or an operator decision that changes later work. An ordinary review or
operator pause that can resume on the same branch is not a split trigger.

The version's contract index contains exactly three columns and maps identifiers
to contract files only:

```markdown
| Session | Sub-version | Contract |
| --- | --- | --- |
| X.Y.N.1 | X.Y.N | `X.Y.N.1.md` |
```

The master plan remains the owner of sequence, dependencies, and delivery
status. A contract owns product scope and observable acceptance criteria, not
speculative implementation steps.

An audit-remediation contract also names its applicable `AF-NNN` finding IDs
and the principle-level outcomes it must deliver. Every open actionable finding
maps to at least one contract; a remediation contract does not absorb unaudited
scope.

An approved session plan records the lowercase SHA-256 digest of the contract's
exact bytes as `sha256:<64 lowercase hexadecimal characters>`. Any contract-byte
change makes that plan stale until it is reconciled and approved again.

Within the numbered sections, use stable item identifiers wherever the plan must
prove complete coverage:

- `DEP-N` for a dependency or ordering input in §2;
- `DC-N` for a done condition in §3;
- `IS-N` for an in-scope boundary in §4;
- `OOS-N` for an out-of-scope boundary in §5;
- `HC-N` for a hard constraint in §6;
- `PD-N` for a planning decision in §7;
- `AC-N` for an acceptance claim in §8;
- `V-N` for a slice-specific evidence category in §9; and
- `G-N` for an additional operator gate in §10.

Identifiers are unique within the contract and survive plan reconciliation so
the approved plan can show that no boundary, decision, proof obligation, or
pause disappeared.

Every contract contains each of the following numbered headings exactly once,
with these unique titles and contiguous numbering in this canonical order. The
template is unusable when it has zero parseable numbered headings, duplicate
titles, or non-contiguous numbering; a contract that omits a required heading is
not planning- or execution-ready.

## 1. Objective

State the one session outcome extracted from the version plan and why it belongs
in the named sub-version. Do not prescribe its implementation.

## 2. Current context and dependencies

Record the bundle-relevant projection of inherited prerequisites, settled product
facts, cross-session dependencies, and ordering constraints as `DEP-N` items.
The version plan remains authoritative. Leave live-code findings and
implementation assumptions to the planning phase, which verifies every item.

## 3. Done conditions

List the required finished product or system states as `DC-N` items. These are
outcomes, not commands. Each acceptance claim in §8 names the `DC-N` state it
proves, and the session plan turns those claims into runnable evidence.

## 4. In scope

Bound the behavior, contracts, data, documents, and workflow outcomes this
session may change. Name a concrete file only when that file is itself the
contracted artifact, not as a speculative implementation choice. Give every
boundary an `IS-N` identifier.

## 5. Out of scope

Name nearby roadmap intent, behavior, or cleanup that this session must not
absorb. The session plan highlights the exclusions most likely to tempt an
executor but does not redefine this boundary. Give every exclusion an `OOS-N`
identifier so the plan can show how it remains protected.

## 6. Hard constraints

Record slice-specific product invariants, fixed version-plan decisions,
compatibility requirements, and other non-negotiable boundaries. Do not repeat
generic repository fences or settle implementation choices assigned to
planning. Give every constraint an `HC-N` identifier.

## 7. Decisions the session plan must resolve

Name every implementation or design choice that requires live-code
investigation. State the decision to confront without prejudging its answer;
the approved plan must resolve each `PD-N` item explicitly.

## 8. Acceptance criteria

Express `AC-N` observable claims, each naming the `DC-N` condition or conditions
it proves. Keep claims independent of a speculative test seam; the session plan
maps each one to exact commands, fixtures, inspections, and expected output.

## 9. Verification

Name only the `V-N` slice-specific evidence categories and roadmap-mandated
exceptional gates needed to prove the acceptance claims, including UX or
external-system proof when applicable. Do not copy mutable repository-wide
commands or generic fences. The session plan resolves current standing commands
from live authority and owns their exact sequencing and expected results.

The relationship is strict: `DC-N` defines the required end state, `AC-N`
defines the observable claim that proves it, and `V-N` identifies the kind of
evidence required. These sections are not three independently worded acceptance
lists.

## 10. UX/operator gates

Repeat the practical consequence of the `UX gate` marker and name any additional
explicit operator pause required by the version plan or product decision as a
`G-N` item. The session plan carries the marker and every item into its exact
delivery sequence.

## 11. Baseline/hotspot boundary

State the expected baseline direction, any hotspot or campaign boundary already
known from the version plan, and what planning must verify against the current
baseline. Live proximity evidence and the exact update belong in the plan.

## 12. Close-out behavior

Record the slice-relevant delivery fork inherited from the roadmap: whether the
session commits in-branch or completes a sub-version, when its execution marker
may become `Complete`, and which review or operator gates apply. The version
plan remains authoritative; the session plan supplies exact branch, command,
artifact, and handoff details.
