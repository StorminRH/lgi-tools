# Version-audit procedure

Three resolver-dispatched entry modes: plan an audit, plan remediation, execute
or resume an approved audit. Same classification, baseline, remediation, and
archive rules in every mode.

## Execution contract

Input: resolver directive plus owning approved artifacts. Directly requested
periodic also needs an approved `Audit mode: Periodic` plan.

Output: exactly one `PLANNED`, `REMEDIATION_PLANNED`, `REMEDIATION_REQUIRED`,
`COMPLETE`, or `BLOCKED`. Planning persists only approved artifacts. Execution
replaces the baseline and may archive only via resolver verified
`archive-needed`. No merge, deployment, production, or destructive-recovery
authority.

Baseline form: `docs/workflows/schema/code-health-baseline.md`. Findings,
rationale, cycles, approvals, and remediation mappings live in the
version-tagged audit plan.

## Entry mode: plan-version-audit

1. Require resolver `plan-version-audit` for lifecycle Version close. Explicit
   operator request may select Periodic (never archives).
2. Read baseline, this procedure, master plan, contracts, session plans,
   changelog, SCRATCHPAD, and relevant open `[Backlog]` GitHub Issues.
3. Design measurements, commands, artifact inventory, hotspot/drift questions,
   baseline replacement, verification, and any version-close archive destination.
4. Present the shape; invoke `adversarial-review` on the complete plan and
   evidence; obtain operator approval. Do not auto-relaunch.
5. Persist Approved cycle-1 plan with full audited ref and procedure digest.
6. Rerun resolver and drift gate; report directive; stop.

## Entry mode: plan-audit-remediation

1. Require resolver `plan-audit-remediation`. Read baseline, audit plan/ledger,
   master plan, schemas, SCRATCHPAD, and live code for open findings.
2. For every open Floss or Campaign, diagnose violated ownership, interface,
   change-axis, or coverage principle. Define end-state and characterization
   evidence; do not copy a metric.
3. Apply plan-version topology audit to the full finding set. Fewest safe
   bundles; map every open AF id; map no unaudited scope.
4. Present topology; invoke `adversarial-review` on topology and evidence;
   obtain approval before mutation.
5. Update roadmap topology, then contracts/index; mark mapped findings Planned;
   set Remediation in progress. Do not create session plans.
6. Rerun resolver and drift gate; report directive; stop.

## Entry mode: version-audit

Require resolver `version-audit`, then run the approved plan and every numbered
step below. A restart advances cycle and audited ref and repeats the full audit;
never a targeted diff.

## Step 0 — Validate the transition

1. Run `python3 tools/cli.py lifecycle resolve --pretty`.
2. Require handler `version-audit`. Else `BLOCKED` with the full directive as
   evidence. Explicit periodic may run while sessions remain only from an
   approved `Audit mode: Periodic` plan; it never archives.
3. Verify plan `Procedure digest` equals SHA-256 of current
   `docs/workflows/version-audit.md`; mismatch → `plan-version-audit`.
4. On complete-restart: verify every mapped remediation sub-version has terminal
   merge evidence; advance `Audit cycle`; set `Audited ref` to canonical `main`;
   set `Audit status: Approved`.
5. Read the approved audit plan, baseline, contracts, session plans, changelog,
   and SCRATCHPAD shipped evidence.
6. Record previous baseline Snapshot and Metrics before overwrite.

## Step 1 — Measure

Run and record numbers from the approved audit plan. Exact commands live in
that plan. `fallow:health` may exit nonzero — record it; it is not gating
`pnpm fallow`. Remove `coverage/` after final checks.

## Step 2 — Re-rank hotspots

Hotspot = interface breadth + unrelated change axes + churn, not mere length.
Record ranking and fix directions in the audit plan. “Make it smaller” is not
enough.

## Step 3 — Review drift no PR-level gate sees

- **Boundary drift:** zone growth, new `allow` entries, composition inside a
  participating slice.
- **Override staleness:** every Fallow override/suppression is a loan. Remove
  stale; classify live with rationale and date.
- **Duplication baseline:** each accepted clone group is boring shape or leaked
  knowledge. Never accept growth silently.
- **Rails gaps:** repeated failures → narrowest useful rail, tripwire, or
  durable principle.
- **Docs truth:** reconcile prose with reality, including `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `.github/` templates, `.env.example`, and
  `/legal`.
- **Lifecycle truth:** contracts, approved session plans, close-out evidence, and
  master-plan terminal statuses must agree.

## Step 4 — Classify, record, and route

One bucket per finding:

1. **Floss:** bounded improvement, no structural campaign. Periodic: may enter
   backlog. Version-close: actionable; remediate before archive.
2. **Campaign:** bounded structural work with its own sub-version. Define
   interface end-state, characterization tests, done conditions.
3. **Watch:** pressure without enough evidence. Baseline carries the exact
   metric/trigger that promotes to Floss or Campaign. Countable trigger = one
   fenced `watch-trigger` under its carrier
   (`docs/workflows/schema/code-health-baseline.md`).

Audit-plan ledger:

```markdown
| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-001 | 1 | Campaign | one decision leaks across routes | one app-layer owner | X.Y.N | Open |
```

Ids monotonic within the version. Status: `Open`, `Planned`, `Delivered`,
`Verified`, or `Watch`. Failed delivered outcome → reuse id, return to Open.

## Step 5 — Overwrite the baseline

Replace `docs/CODE_HEALTH_BASELINE.md` in full using only
`docs/workflows/schema/code-health-baseline.md`. Full audit: measure every
registered row; `Measurement scope: Full audit`; advance Snapshot to audited
ref. Preserve frozen `Version-start`; update every `Current` and derived
`Delta`.

## Step 6 — Remediate, repeat, or archive

Periodic: stop once baseline, backlog, campaign, and audit-plan evidence agree.

Version close with any Floss or Campaign:

1. set each actionable finding Open; set `Audit status: Remediation required`;
2. update SCRATCHPAD to audit remediation planning;
3. run resolver, report directive, return control to `start-session`;
4. stop — no archive;
5. after `plan-audit-remediation` maps work, use normal session plans, branches,
   PRs, design review, and close-out;
6. in every mapped sub-version's delivering PR, mark its finding Delivered so
   the marker is already authoritative when that PR merges; when all rows are
   terminal on `main`, rerun the resolver and let its directive start the next
   full cycle.

Clean version close:

1. run master-plan version-close checks against actual terminal/deferred
   decisions;
2. mark Delivered → Verified only when this fresh cycle proves each required
   outcome;
3. every audit gate pass; baseline Code ref equals `Audited ref`; set
   `**Audit status:** Complete`;
4. follow resolver `archive-needed`: archive master plan, contracts, session
   plans, session-as-builts, and audit plan as one version bundle;
5. keep `docs/CODE_HEALTH_BASELINE.md` active;
6. update SCRATCHPAD to next master-plan handoff or `awaiting master plan`;
7. run workflow-state resolver and `python3 tools/cli.py policy check`.

Never archive before baseline replacement is verified.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Version audit: `PLANNED` | `REMEDIATION_PLANNED` | `REMEDIATION_REQUIRED` | `COMPLETE` | `BLOCKED`

- **Subject:** `<X.Y>` cycle <number or n/a>; <primary artifact or Not written>
- **Result:** <mode outcome; finding or baseline summary; ≤2 sentences>
- **Action:** <next lifecycle action>
- **Blocker:** <exact blocker or `None`>
```
