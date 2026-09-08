# Candidate change record — format 2

Commit the candidate outcome, rationale and release material before freezing the
review head. A candidate remains `Candidate` in git. Final proof belongs in the
[Linear delivery receipt](delivery-receipt.md); delivery never requires a
bookkeeping commit. Unversioned records retain the historical contract in
[session-as-built.md](session-as-built.md). Unknown explicit formats fail closed.

```markdown
# Session 4.1.1.1 As-Built — Player-facing title

**Record format:** 2
**Record status:** Candidate
**Recorded:** 2026-09-08
**Scope:** session
**Delivery ID:** LGI-119-promotion-1
**Receipt issue:** https://linear.app/lgitools/issue/LGI-119
**Contract:** docs/session-contracts/4.1/4.1.1.1.md
**Contract digest:** sha256:<exact file bytes, lowercase hex>
**Plan:** docs/session-plans/4.1/4.1.1.1.md
**Plan digest:** sha256:<exact file bytes, lowercase hex>
**Criteria:** SC-1, SC-2
**Branch:** development
**PR:** https://github.com/StorminRH/lgi-tools/pull/123
**Review roles:** structure-reviewer, behavior-reviewer
**Prior deliveries:** None.
**Record standard:** docs/workflows/schema/session-as-built-v2.md

## Delivered outcome

Describe the behavior available after this candidate is delivered.

- [LGI-119-handoff] Changed: Resume work from its current Linear handoff.
```

The local validator is `python3 tools/cli.py delivery check-record PATH`.
It checks artifact readiness without contacting Linear or GitHub. Delivery-time
validation also compares the exact record bytes with the frozen GitHub head.
The session filename, contract and plan identify the same session; digests bind
exact bytes. Criteria list every plan SC-N once in order. Record the selected
review roles before freeze, including every destination role required by the
[review authorization policy](review-policy.md). Each selected role must be
declared in that policy. Delivery validates these requirements against policy
collected from GitHub at the authoritative base commit. Local record parsing
checks role syntax and uniqueness without contacting GitHub.

Ordinary records use `Scope: ordinary` and `None.` for Contract, Plan, both
digests and Criteria. One coherent ordinary record can cover several issues.
Partial promotions use `Scope: partial`, the same `None.` fields, and a
`Partial scope` marker such as `4.1.1.1: OW1, OW2`. They claim only delivered
behavior; the final session record binds the complete plan and criteria.

Delivery IDs and bracketed outcome IDs are stable and unique across active
records. A final record names earlier partial Delivery IDs in `Prior deliveries`
and emits only its additional outcome IDs. Earlier outcome bullets stay in their
original record; a prior reference is not a second delivered outcome. The release
checker rejects duplicate outcome/Delivery IDs and missing prior references.

Only Delivered outcome is required as a section. Add Final surfaces, Discovered
work or Successor notes when useful. An optional Divergences from plan section
retains structured `Plan statement`, `Built instead`, `Why` and `Authority`
items. Authority begins with `Operator:` or `Evidence:` and records authority
that existed during execution. Omit empty sections. The v2 validator is
self-contained, so archive snapshots need no additional schema file dependency.
