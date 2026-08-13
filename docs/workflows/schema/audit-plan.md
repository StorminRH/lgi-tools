# Audit plan schema

Canonical form for LGI.tools version-tagged audit plans at
`docs/version-audits/X.Y/PLAN.md`. Skills own procedure. This file owns the
machine-parsed markers and findings ledger. The lifecycle resolver validates
those fields; it does not hash this file.

Start every Version close plan with this frame:

```markdown
# Audit plan — Version X.Y

**Audit status:** Approved
**Audit cycle:** 1
**Audited ref:** `<40 lowercase hexadecimal characters>`
**Audit mode:** Version close
```

Marker vocabularies:

- `Audit status` — exactly `Approved`, `Remediation required`,
  `Remediation in progress`, or `Complete`.
- `Audit cycle` — a positive integer.
- `Audited ref` — a full lowercase 40-character commit SHA.
- `Audit mode` — exactly `Version close` or `Periodic`. Lifecycle routing
  consumes only `Version close`.

When any finding exists, include this ledger. Column titles and order are
fixed:

```markdown
## Audit findings

| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-001 | 1 | Campaign | one decision leaks across routes | one app-layer owner | X.Y.N | Open |
```

- `ID` — `AF-` plus three digits, monotonic within the version.
- `First seen` — the audit cycle that first recorded the finding.
- `Class` — exactly `Floss`, `Campaign`, or `Watch`.
- `Status` — exactly `Open`, `Planned`, `Delivered`, `Verified`, or `Watch`.
- `Watch` class requires `Watch` status; other classes must not use `Watch`.
- `Planned`, `Delivered`, and `Verified` rows name a mapped remediation
  sub-version; they must not use an empty cell, `—`, or `-`.

Do not write a procedure-file path or procedure digest on new plans. Historical
plans may still carry those lines; the resolver ignores them.
