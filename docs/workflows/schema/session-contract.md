# Session contract schema

Canonical form for LGI.tools session contracts. Numbered second-level headings
below are the required sections; the lifecycle resolver derives titles from them.

A contract is a concise, implementation-agnostic product-boundary prompt and
acceptance bar. Planning may diverge into the plan; do not rewrite frozen
contract bytes. An approved session plan records
`sha256:<64 lowercase hexadecimal characters>` of the contract's exact bytes;
any byte change makes that plan stale until reconciled and re-approved.

Start every contract with this frame:

```markdown
## Session X.Y.N.M — Title

**Sub-version:** X.Y.N
**Master plan:** `docs/VERSION_X_Y_PLAN.md` §X.Y.N
**UX gate:** No
**Execution profile:** Frontier autonomous coding agent
**Delivery unit:** One agent session, one shared sub-version branch, one sub-version PR
**Roadmap coverage:** §X.Y.N outcome or ordered outcome set
**Internal phases:** 1. First outcome; 2. Second outcome; 3. Integration and proof
**Split triggers:** Only the rare concrete conditions that invalidate the bundle
```

`UX gate` is exactly `Yes` or `No` (`Yes` when the session changes user-facing
behavior or appearance). `Execution profile` uses the exact value above.
`Delivery unit` is exactly
`One agent session, one shared sub-version branch, one sub-version PR` or
`One agent session, one shared sub-version branch, one PR per session`. Every
session in a sub-version shares one lifecycle branch; the choice is
sub-version-wide. `Roadmap coverage`, `Internal phases`, and `Split triggers`
are non-empty. Split triggers name only rare invalidating conditions — not
ordinary review or a resumable pause.

Version contract index: exactly three columns mapping identifiers to files:

```markdown
| Session | Sub-version | Contract |
| --- | --- | --- |
| X.Y.N.1 | X.Y.N | `X.Y.N.1.md` |
```

Audit-remediation contracts also name applicable `AF-NNN` finding IDs and
principle-level outcomes. Map every open actionable finding to at least one
contract; do not absorb unaudited scope.

Within numbered sections, use stable identifiers unique within the contract:
dependency (`DEP-N`, §2), done condition (`DC-N`, §3), in scope (`IS-N`, §4),
out of scope (`OOS-N`, §5), hard constraint (`HC-N`, §6), planning decision
(`PD-N`, §7), acceptance (`AC-N`, §8), verification (`V-N`, §9), operator gate
(`G-N`, §10). Include each numbered heading exactly once, with these titles and
contiguous numbering.

## 1. Objective

State the one session outcome from the version plan and why it belongs in the
named sub-version.

## 2. Current context and dependencies

Record bundle-relevant prerequisites, settled product facts, cross-session
dependencies, and ordering constraints as `DEP-N` items.

## 3. Done conditions

List required finished product or system states as `DC-N` items (outcomes, not
commands). Each §8 claim names the `DC-N` it proves.

## 4. In scope

Bound behavior, contracts, data, documents, and workflow outcomes this session
may change. Give every boundary an `IS-N` identifier.

## 5. Out of scope

Name nearby roadmap intent, behavior, or cleanup this session must not absorb.
Give every exclusion an `OOS-N` identifier.

## 6. Hard constraints

Record slice-specific product invariants, fixed version-plan decisions,
compatibility requirements, and other non-negotiables as `HC-N` items. Skip
generic repository fences.

## 7. Decisions the session plan must resolve

Name each implementation or design choice that needs live-code investigation as
a `PD-N` item. State the decision to confront; do not prejudge the answer.

## 8. Acceptance criteria

Express `AC-N` observable claims; each names the `DC-N` condition(s) it proves.

## 9. Verification

Name only `V-N` slice-specific evidence categories and roadmap-mandated
exceptional gates. Do not copy mutable repository-wide commands.

## 10. UX/operator gates

Restate the practical consequence of the `UX gate` marker. Name any additional
explicit operator pause as a `G-N` item. When the marker is Yes, a dedicated
Ordered work step under `start-session` invokes `ux-check`.

## 11. Baseline/hotspot boundary

State expected baseline direction, any known hotspot or campaign boundary from
the version plan, and what planning must verify against the current baseline.

## 12. Close-out behavior

Record the slice-relevant delivery fork: in-branch commit vs sub-version
completion, and when the execution marker may become `Complete`. Close-out
consumes a completed UX Ordered work disposition; it does not re-run that pause.
