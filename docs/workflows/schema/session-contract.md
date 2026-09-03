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
**Delivery unit:** One agent session, land each Ordered work step on development
**Roadmap coverage:** §X.Y.N outcome or ordered outcome set
**Internal phases:** 1. First movement inside the feature; 2. Next movement; 3. Later movement
**Split triggers:** Only the rare concrete conditions that invalidate the bundle
```

`UX gate` is exactly `Yes` or `No` (`Yes` when the session changes user-facing
behavior or appearance). `Execution profile` uses the exact value above.
`Delivery unit` for new contracts is exactly
`One agent session, land each Ordered work step on development`.
Completed 4.0 contracts may still carry
`One agent session, one shared sub-version branch, one sub-version PR` or
`One agent session, one shared sub-version branch, one PR per session`.
`start-session` cuts `lifecycle/<session>-ow-<n>` from `development` per
Ordered work step. `Roadmap coverage`, `Internal phases`, and `Split triggers`
are non-empty. Internal phases name movements inside this feature. They are
not extra sessions and not the only times the operator looks. Split triggers
name only rare invalidating conditions, not ordinary review or a resumable
pause.

Version contract index: exactly three columns mapping identifiers to files:

```markdown
| Session | Sub-version | Contract |
| --- | --- | --- |
| X.Y.N.1 | X.Y.N | `X.Y.N.1.md` |
```

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
explicit operator pause as a `G-N` item. The operator looks during Ordered
work, not when the session ends. Mark a visual look on about every other
step, and on any step that presents something they can see. When the marker
is Yes, a dedicated Ordered work step under `start-session` also invokes
`ux-check` once there is something to look at. That step is not the first
look.

## 11. Baseline/hotspot boundary

State expected pressure on known hotspots from the version plan. Version-close
audit and code-health baseline tracking are retired.

## 12. Close-out behavior

Each Ordered work step already landed on `development`. Close-out does not
open a land PR. Record when the plan marker may become `Complete`, and that
promote starts at 80 app-facing files versus `staging` (shown as n/100).
The resolver then sends Start Session to close-out. The last Ordered work
step of the version's last session archives the master plan after any due
promote. Close-out consumes recorded operator looks and any `ux-check`
disposition; it does not re-run those pauses. Promote and release open an
Origin draft, comments, GitHub mirror on promote, freeze, review with `origin pr diff`, batch, then one
Depot `dispatch`.
