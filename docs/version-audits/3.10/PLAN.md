# Version 3.10 "Hull Integrity + SKIN" Whole-Version Close Audit Plan

**Audit status:** Complete
**Approved:** 2026-07-27
**Version:** 3.10
**Audit mode:** Version close
**Audit cycle:** 4
**Audited ref:** `c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd`
**Procedure:** `docs/workflows/version-audit.md`
**Procedure digest:** `sha256:12cf58a8efdafe30ad3e026d30bf00fa48646338df94b8d3da3d50bdd11c0175`

> **Expected shape: a short close, plausibly single-cycle.** v3.10 was a
> hardening version — docs/lifecycle consolidation, boundary/layer completion,
> flow contracts, operability, and presentation adoption — whose entire thesis
> was converting intended design into enforced design. Grounding (2026-07-27,
> clean `main` @ `ba48288`) shows the mechanical surface healthy: 22 configured
> Fallow zones with full production coverage, empty duplication baseline, zero
> threshold overrides, empty pending-changelog inbox (README only), all three
> carried Watch triggers below threshold, `check_watch_triggers` clean, and
> `check_baseline_claims` reporting only the expected three stale Current cells
> the baseline replacement will overwrite. The known open questions are
> judgment reviews, not gate failures: the source-suppression count doubled
> (21 → 42) across the version, and one whole-version Fallow clone group
> appeared against an empty accepted baseline. The baseline replacement
> **preserves** the frozen `Version-start` column (procedure Step 5; the
> 3.10.0.2.2 HC-1 write-once rule; `check_baseline_claims` enforces it against
> `origin/main`), so no checker transition is required for a clean close.
> Unless a review confirms an actionable defect, the realistic path is cycle 1
> → clean close → archive; if any Floss/Campaign is confirmed, the standard
> remediation branch applies. This plan was adversarially reviewed (Composer
> 2.5 execution seat + Grok 4.5 High holistic seat, 2026-07-27); both
> BLOCKER/MAJOR findings sets are reconciled into this text.

## 1. Scope and comparison frames

- **Cycle-1 audited ref:** `ba4828841a53de992e995c034a470efed50e3d6d` — current
  canonical `main`, v3.10.4.3, the squash of version-final PR #311. Unlike the
  v3.9 close there is no one-PR reconciliation lag: the final planned PR carried
  terminal roadmap rows, the PR-numbered as-built record, `APP_VERSION`, and the
  published changelog entry (the A10 rule). The worktree is clean on `main`.
  One expected residue: `docs/SCRATCHPAD.md`'s "Now" block still reads
  "NEXT = planned close-out" — SCRATCHPAD is a RECORD document and the audit
  updates it as its own output (Step 6), so this is expected state, not a
  finding, unless reconciliation exposes a substantive untruth.
- **Version-start ref (whole-version lens):**
  `f35cdb35f73513600991ce1162001369046cb11a` (v3.9 cycle-2 close, 3.9.5.2,
  2026-07-20; a verified ancestor of `main`). Use it for whole-version shape
  (`git archive`) and the pinned `FALLOW_AUDIT_BASE` run.
- **Previous baseline (delta + churn):** `2026-07-20 / 3.9.5.2 / f35cdb3` — the
  current `docs/CODE_HEALTH_BASELINE.md`. Because the previous baseline ref
  **is** the version-start ref, the two churn lenses coincide for this version:
  one frame, expressed both as `--since=2026-07-20` and as
  `f35cdb3..ba48288` (29 commits), cross-checked against each other.
- **The audited ref advances across cycles** (v3.8/v3.9 rule). Any confirmed
  actionable finding remediates through a normal sub-version PR; cycle 2 audits
  the advanced canonical `main`, and the final baseline `Code ref` equals that
  clean-cycle audited ref.
- **Intentional terminal decisions, not gaps:** the operator-approved Phase 4
  survey BL routes (scroll-aware section links; primitive-serving CSS
  relocation), every survey `EX` exemption, the security-tranche non-goals
  (LGI-01/02/04–07/09–12 keep their recorded backlog triggers), the master
  plan's explicit non-goals, the deferred `fast-uri` advisory, and the
  3.10.0.2.2 PD-2 deferral of the version-adoption `Version-start` write
  mechanism (owned by the v3.11 opening, not this close — see §4).

## 2. Step 0 — Transition validation and pre-overwrite capture

- Confirm the resolver directive names `version-audit` as its handler before
  any execution step; this plan never selects a sibling handler. Distinguish
  initial close audit, complete restart after remediation, and the verified
  archive transition by the directive's action.
- Verify this plan's `Procedure digest` is the SHA-256 of the current exact
  `docs/workflows/version-audit.md`
  (`12cf58a8efdafe30ad3e026d30bf00fa48646338df94b8d3da3d50bdd11c0175`); a
  mismatch returns to `plan-version-audit`. The value moved twice around cycle
  2: `6b291e99…` at cycle 1, `2e788e7e…` after the Step-6 delivered-marker
  wording change that opened cycle 2, and the current value after AF-017's
  in-cycle fix removed the duplicated watch-trigger grammar from Step 4.
- On a complete-restart directive: verify every mapped remediation sub-version
  has terminal merge evidence, advance `Audit cycle`, set `Audited ref` to
  current canonical `main`, rerun every measurement and gate. A targeted diff
  is never an audit restart.
- Read, in order: `docs/workflows/pre-pr-design-review.md`; the current
  `docs/CODE_HEALTH_BASELINE.md`; this approved plan; the completed
  `docs/VERSION_3_10_PLAN.md` and its close claims; the version's contract
  index, contracts, session plans, as-built records, changelog entries, and
  SCRATCHPAD shipped evidence.
- **Record the outgoing baseline in full before overwrite (Step 0.6):** its
  Snapshot identity and every Metrics row value, so the new baseline's Current
  cells and any dispute about prior state compute against a captured prior,
  not a remembered one.

## 3. Artifact reconciliation

- Reconcile all 15 terminal roadmap rows against git and the 15
  `content/changelog/v3.10.md` sub-version headings, the 19 contracts mapped by
  `docs/session-contracts/3.10/INDEX.md`, the 19 approved session plans under
  `docs/session-plans/3.10/`, the 11 as-built records under
  `docs/session-as-built/3.10/` (binding floor `3.10.2.1.1` — sessions before
  the floor predate the record form; the resolver's
  `AS_BUILT_BINDING_FLOOR = (3, 10, 2, 1)` accepts this), and SCRATCHPAD
  shipped evidence.
- **Known reconciliation details to disposition (not pre-judged):**
  - `docs/session-plans/3.10/3.10.2.1-e2e-type-safety-brief.md` is a 20th file
    in the session-plans directory that is not an approved session plan;
    confirm it is a sanctioned supplementary brief and record how it archives.
  - The 3.10.1.2 delivery exception (three sequential PRs after the 522-file
    single PR exceeded both review bots' caps) and the 3.10.0.2-era rider PRs
    (#278/#279/#280) are operator-approved deviations; verify their recorded
    evidence rather than re-litigating them.
  - Two delivery rows absorbed sibling roadmap sections (§3.10.1.3 into
    3.10.1.2; §3.10.3.2 into 3.10.3.1); the roadmap states this — confirm the
    changelog and as-built records agree.
- **New tracked v3.10 artifacts the reconciliation and archive must account
  for:** `docs/version-audits/3.10/PHASE_4_ADOPTION_SURVEY.md` (43 AD rows —
  every row must be terminal) and `PHASE_4_PUNCH_LEDGER.md` (operator
  resolution declared), `docs/architecture-map.md` (generated — verify the
  drift test owns it), the live `docs/workflows/` + `docs/workflows/schema/`
  canonical set (live guidance, **never archived** with the version), and the
  Phase 0 retirements (`DEVELOPMENT_LIFECYCLE.md`, `SESSION_CONTRACTS.md`,
  `DESIGN_PRINCIPLES.md`, `PRIMITIVE_LEDGER.md` gone from the live set with
  archive copies recorded).
- Validate the master plan's version-close claim set against actual terminal
  decisions: the **Phase 4 ship claim** (universal adoption + effective rails +
  clean re-audit), the Phase-wide constraints, and the Explicit non-goals.
  Obsolete checklist text never overrides terminal roadmap truth.

## 4. Measurement design (Step 1)

Run and record every procedure Step-1 metric with a reproducible command at the
audited ref. Grounded current values shown so drift is visible; execution
re-measures.

- Production TS/TSX files **806**, test files **428**, production LOC
  **79,515** — the exact Step-1 `find`/`wc` commands. Version-start shape via
  `git archive f35cdb3 | tar -x -C <tmp>`, measured under identical rules.
- Largest production files — `find … -print0 | xargs -0 wc -l | sort -rn |
  head -17` (17 so the `total` line does not displace the 16th row), each row
  classified.
- Four coverage percentages from a fresh full-Postgres `pnpm test:coverage`.
  **Kill any long-running dev server first** (local Postgres connection
  exhaustion breaks DB suites) and regenerate coverage immediately before any
  Fallow verdict is trusted (stale-coverage CRAP gotcha).
- Fallow health score + above-threshold function count (`pnpm fallow:health`;
  expected nonzero exit — record the report, not a gate failure).
- Threshold overrides **0** (empty array), source suppressions **42** (up from
  21 — see §5), whole-version clone groups via
  `FALLOW_AUDIT_BASE=f35cdb3 pnpm fallow` (baseline row currently records 1;
  accepted-duplication baseline empty), pending-changelog inbox **empty**.
- Churn: `git log --since=2026-07-20 --name-only --pretty=format: -- src convex
  | sort | uniq -c | sort -rn | head -25`, cross-checked against the
  `f35cdb3..ba48288` range form.

**Every known-wide surface the current baseline names — reproducible commands
(zero rows must yield `0`, never error):**

| Surface | Reproducible command / definition | Grounded |
| --- | --- | ---: |
| Auth query-hub exports | `test -f src/features/auth/queries.ts && grep -c '^export' … \|\| echo 0` | 0 |
| `PricingContextValue` fields / `usePricing()` sites | `grep -rn` definition/call counts (expect 0 / 0) | 0 / 0 |
| Planner concern-context fields + concern-hook consumers | member counts per interface in `planner-contexts.tsx`; hook grep call/file count | 5/10/18/6/13; 22/11 at last audit |
| Telemetry query breadth (AF-006) | `grep -c '^export' src/data/telemetry/queries.ts`; fan-in `grep -rl … src convex \| wc -l` | 25 exports |
| ESI refresh-job exports (AF-007) | `grep -c '^export' src/data/esi-refresh-jobs/queries.ts` | 13 |
| Auth contract paths (AF-008) | count the three named files via the baseline's `files(globs:…)` set | 3 |
| ESI dataset registry entries | registry entry count in `src/composition` registry aggregation (command pinned at execution from the census test's input) | 13 at last audit |
| Freshness leaf breadth | exported functions + production importers | 3 / 15 at last audit |
| Cron shell declarations | `defineCronRoute` declaration count | 7 |
| Real-Postgres harness consumers | `grep -rl createDbTestHarness src \| wc -l` | 18 at last audit |
| Dataset declaration census | table count + index-test count from `dataset-declarations.test.ts` inputs | 56 / 14 at last audit |
| API contract completeness | route count / contract-module count from the endpoint gate | 52 / 17 at last audit |
| EVE type-image resolver breadth | exports / functions / production importers of `type-images.ts` | 8 / 6 / 16 at last audit |

**New v3.10 wide surfaces — measured and recorded as audit evidence only, not
as new registered baseline rows.** The strict schema's registered metric set is
frozen for the version (`check_baseline_claims` errors on any added
`Version-start` key against `origin/main`; the 3.10.0.2.2 contract's HC-1
write-once rule), so no schema or baseline row is added during this close.
Registration of any of these surfaces, together with the PD-2 adoption-time
`Version-start` capture mechanism, is routed to the v3.11 opening; execution
verifies that deferral is recorded where the v3.11 planning inputs will read it
(backlog or master-plan handoff note) and classifies it as a finding only if
the deferral has no recorded home.

1. **Fallow boundary coverage** — configured zone entries via
   `python3 -c "import json;print(len(json.load(open('.fallowrc.json'))['boundaries']['zones']))"`
   (grounded **22**; note `pnpm exec fallow list --boundaries` reports the
   *expanded* zone count, 49 — record both, define the metric as configured
   entries) plus a zero-unclassified/zero-violation proof from the boundary
   audit output (`pnpm fallow` boundary results at the audited ref).
2. **Vendor resilience registry** — declared integrations in
   `src/composition/vendor-resilience-registry.ts` (census test's entry count).
3. **Capability instrumentation** — instrumented operations recorded by the
   capability census (38 at 3.10.3.1) and owned SLIs (5, `src/data/telemetry/sli.ts`).
4. **Adoption census** — primitive families under the repeatable Phase 4
   census and remaining allowlisted legacy CSS families (expected small or
   zero after 3.10.4.2/4.3).

- Run `python3 .agent-local/check_baseline_claims.py --check` and
  `check_watch_triggers.py --check` before and after the baseline replacement
  (before: three stale-Current warnings expected; after: clean).

## 5. Review and classification (Steps 2–3)

- **Re-rank hotspots** by interface breadth, change axes, churn, amplification,
  and cohesion defense — not file length. Candidates the version's own work
  makes interesting: the composition band (`src/composition/*` registries), the
  mutation pipeline + problem mapper seam, `src/data/telemetry/` (AF-006 —
  3.10.3.1 deliberately extended it and predicted staying below trigger),
  `globals.css` (should have **shrunk** ~1,145 page-scoped lines; verify),
  planner components touched by the punch list, and `src/lib/esi/dispatch.ts`.
  Reaffirm protected modules: `tree-resolver.ts`, `convex/engine.ts`, the
  ESI gate, `api-client.ts`, `env.ts`, PricingProvider concern boundaries
  (AF-005), the mutation pipeline (AF-001). Every hotspot row states a
  direction of fix.
- **Suppression growth review (21 → 42).** Enumerate all 42
  `eslint-disable` / `@ts-expect-error` / `fallow-ignore` sites, attribute each
  new one to its introducing sub-version, and classify each as a justified
  narrow loan (with rationale visible at the site) or a finding. A doubled
  count across a hardening version deserves explicit judgment, not silence.
- **Clone-group review.** The baseline row records one whole-version clone
  group against an empty accepted baseline. Re-run pinned Fallow, classify the
  group (boring shape vs leaked knowledge), and either remediate, accept with
  rationale, or record the trigger that would promote it.
- **Rails review.** Confirm every v3.9 rail still bites, plus the v3.10 set:
  22-zone deny-by-default boundaries with cycles at `error`, `server-only`
  rails + enumeration test, the problem-contract gates, same-origin 403
  enforcement + discovery test, ownership/RLS census, vendor-resilience census
  + bare-`fetch` ban + SDK-home rails, capability-required option, the
  architecture-map drift test, and the Phase 4 adoption census + CSS-family
  checker with its recorded exemptions. Rails-gaps: any repeated failure that
  escaped v3.10 becomes the narrowest useful rail or durable principle.
- **Docs truth.** Sweep workspace + committed public documents (`README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `.github/` templates, `.env.example`,
  `/legal`) against the live app. v3.10-specific checks: no prose anywhere
  claims deny-by-default forbids *intra*-zone imports (the 3.10.3.3 "between
  zones" wording gotcha); the retired Phase 0 documents stay retired with no
  live references; `docs/architecture-map.md` matches its generator;
  `docs/workflows/` procedures describe the delivery pipeline actually in
  force.
- **Lifecycle truth.** §3's reconciliation set agrees end-to-end; the resolver,
  release-consistency, doc-refs, pending-changelog, tooling-parity, and drift
  gates are green at the audited ref.
- **Classify** every finding as exactly one of Floss / Campaign / Watch
  (Watch only with a countable trip-form trigger in the closed grammar).
  Version close: every Floss/Campaign is actionable before archive; Watch is
  the only non-blocking classification. Do not implement structural campaigns
  inside the audit.

## 6. Outputs

- Replace `docs/CODE_HEALTH_BASELINE.md` in full per
  `docs/workflows/schema/code-health-baseline.md`: advance the Snapshot
  identity (Date, App version, `Code ref` = the cycle's audited ref,
  `Measurement scope: Full audit`), **preserve every `Version-start` key and
  value byte-for-byte from `origin/main`** (procedure Step 5 "Preserve the
  master version's frozen `Version-start` cells"; HC-1 write-once;
  `check_baseline_claims` errors on any Version-start key or value drift),
  update every `Current` cell from fresh measurement, and derive every `Delta`
  per the schema's rules. Watch carriers per §7 decisions. No prose anywhere
  in the baseline. `check_baseline_claims.py --check` must be clean after the
  replacement.
- Maintain the findings ledger below; new v3.10 findings receive monotonic ids
  from **AF-016** (AF-001–005 closed with v3.8; AF-009 closed in 3.9.2.2;
  AF-010–015 Verified in the archived v3.9 cycle-2 close).
- Reconcile `docs/backlog.md` entries the version's terminal decisions touch
  (Phase 4 BL citations present; LGI-03 delivered by 3.10.2.2 — its
  security-tranche entry reflects that).
- **No product API, schema, route, or UI change is planned.** The audit's
  outputs are the baseline overwrite, the audit-plan evidence, the SCRATCHPAD
  update, and — only via remediation — any classified fixes.

## 7. Verification and archive

Run, in order, after each cycle's final measurement state:

```bash
pnpm verify
pnpm test:coverage
pnpm fallow:health
FALLOW_AUDIT_BASE=f35cdb35f73513600991ce1162001369046cb11a pnpm fallow
pnpm assert:routes-present
pnpm exec tsc --noEmit --incremental false
pnpm exec fallow list --boundaries
python3 .agent-local/check_baseline_claims.py --check
python3 .agent-local/check_watch_triggers.py --check
python3 .agent-local/check_release_consistency.py --check
python3 .agent-local/check_doc_refs.py
python3 .agent-local/check_pending_changelog.py --check
python3 .agent-local/check_agent_drift.py
```

**Every listed command except `pnpm fallow:health` is a hard gate: the first
failure stops the sequence** — later gates and any archive step do not run
until the failure is diagnosed, attributed, and either classified as a finding
(cause in the audited subject) or resolved (cause in the audit's own working
state), and every invalidated measurement is reopened and rerun.
`fallow:health` may exit nonzero on existing health findings — record the
report. Remove generated `coverage/` after final evidence. Never run a local
production build. Kill any running dev server before the DB-suite-bearing
gates.

**Findings-conditional branch (Step 6):**

- *Cycle 1 — any confirmed actionable Floss/Campaign* → set
  `Audit status: Remediation required`, keep each AF Open, update SCRATCHPAD to
  audit-remediation planning, rerun the resolver, and stop for
  `plan-audit-remediation`. Do **not** archive.
- *Restart — cycle 2* → after every mapped remediation row is terminal, advance
  `Audit cycle`, set `Audited ref` to current canonical `main`, rerun every
  measurement and gate per §2. A targeted diff is never an audit restart.
- *Clean close* → every actionable finding Verified, no new actionable finding
  this cycle, every gate green, refreshed baseline `Code ref` = `Audited ref`;
  set `**Audit status:** Complete`; then follow the resolver's
  `archive-needed` directive to archive one bundle to
  `../LGI Tools Document Archive/versions/3.10/` (layout owned by
  `verify_archive.py`, matching the archived 3.8/3.9 bundles):
  - `python3 .agent-local/verify_archive.py --check --phase pre` before any
    copy or removal;
  - copy `docs/VERSION_3_10_PLAN.md`, `docs/session-contracts/3.10/`,
    `docs/session-plans/3.10/`, `docs/session-as-built/3.10/`,
    `docs/version-audits/3.10/` into the bundle;
  - `verify_archive.py --check --phase post` after the copy, before removing
    the active sources. **Known checker gap:** `verify_archive.py` fidelity-
    checks only the roadmap, `session-contracts`, `session-plans`, and
    `version-audits` — it does not verify `session-as-built`. Before removing
    any active source, run an explicit byte-identity check of the as-built
    directory (`diff -r docs/session-as-built/3.10 "<bundle>/session-as-built"`)
    and record its empty output as archive evidence; classify the checker gap
    through the normal rails-gap review (likely a one-line bundle-list
    extension routed to remediation or the v3.11 opening). Only after both
    proofs pass, remove the active sources.
  - Keep `docs/CODE_HEALTH_BASELINE.md` active. Update SCRATCHPAD to
    `awaiting master plan`; rerun the resolver (expect `master-plan-needed`)
    and `check_agent_drift.py`.

Audit changes (plan evidence, baseline replacement, SCRATCHPAD, archive
removal) ship through the standard PR pipeline via `close-out`; this plan
grants no merge, deployment, or destructive-recovery authority.

## Audit cycle history

| Cycle | Audited ref | Result | Baseline ref |
| ---: | --- | --- | --- |
| 1 | `ba4828841a53de992e995c034a470efed50e3d6d` | Remediation in progress — AF-016 (docs truth, Floss) mapped to `3.10.5.1` on 2026-07-27; AF-006/007/008 remain Watch; all mechanical gates green | `ba4828841a53de992e995c034a470efed50e3d6d` |
| 2 | `19fd1b841477b3bb0970ca2251ec21f7f9b9423d` | Remediation in progress — AF-016 **Verified** (all eight outcomes re-proved first-hand); one new finding **AF-017** (Floss, watch-trigger grammar drift in this procedure) fixed in-cycle by operator ruling and left **Delivered** for cycle 3 to verify; AF-006/007/008 remain Watch; every gate green | `19fd1b841477b3bb0970ca2251ec21f7f9b9423d` |
| 4 | `c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd` | **Clean close** — AF-016/017/018 all Verified, no new finding, every measurement stable, every gate green, baseline `Code ref` = `Audited ref`; AF-006/007/008 remain Watch below trigger. Version archives. | `c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd` |
| 3 | `9ce2210def5982ff815484d93bc91d8350de1aaf` | Remediation in progress — AF-017 **Verified**; **AF-018** (resolver contradicted the baseline schema's optional `Code ref` qualifier, making any clean close unreachable) surfaced by the close transition itself, fixed in-cycle and left **Delivered** for cycle 4; every measurement stable, every gate green; AF-006/007/008 remain Watch below trigger | `9ce2210def5982ff815484d93bc91d8350de1aaf` |

## Execution evidence — cycle 1 (2026-07-27)

### Step 0 — Transition and pre-overwrite capture

- Resolver directive named `version-audit` (stage `audit-ready`, mode execute);
  pre-dispatch `check_release_consistency.py --check` returned zero
  errors/warnings. Procedure digest verified byte-exact
  (`6b291e99cf3ef6a074c2273788dc20ce36de959a4693ec3a56951ea9dc5572e3`).
- Outgoing baseline captured before overwrite: Snapshot `2026-07-20 /
  3.9.5.2 / f35cdb3`, all rows recorded (762/804 files, 73,072/79,152 LOC,
  368/424 tests, coverage 86.90→87.07 / 84.25→83.99 / 82.84→83.23 /
  87.90→88.11, health 78 (B)/78 (B), suppressions 21/42, clone groups 0/1,
  overrides 0/0; wide-surface rows as republished in the replaced baseline's
  `Version-start` column).
- Worktree note: sixteen empty `"<name> 2"` directories (macOS copy artifacts
  of the 3.10.1.2 restructure day, all zero-file, never tracked) were found
  beside restructured paths and removed with `rmdir`; working-state hygiene,
  not a finding.

### Step 1 — Measurements at `ba48288`

- Files/LOC/tests: **806** production TS/TSX, **79,515** LOC, **428** test
  files. Largest files headed by `PricingProvider.tsx` 906,
  `data-ownership-registry.ts` 855, `tree-resolver.ts` 693 (all judged below).
- Fresh full-Postgres coverage: **4305 passed + 1 skipped (4306)** at
  **85.83 / 82.81 / 81.37 / 86.89** — DB suites ran (the 3.10.4.3.1 close-out's
  DB-less run was 4201 + 105 skips of the same 4306). No coverage target
  exists (explicit non-goal); the drift from 3.9.5.2's 87.07/83.99/83.23/88.11
  tracks the version's +752 tests over +6,443 LOC with heavy census/registry
  data files.
- `pnpm fallow:health`: **Health score 78 B** (hotspots −10, unit size −10,
  coupling −2.5), maintainability 91.6, **0 functions above thresholds** —
  identical grade to version start.
- Pinned `FALLOW_AUDIT_BASE=f35cdb3 pnpm fallow`: 1040 changed files, dead
  code 0, complexity 0, duplication **1 clone group** (`dup:a60cc554`,
  11 lines, `scripts/ux-capture-args.mjs:6-16` ×
  `scripts/ux-capture-args.test.mjs:57-65`), exit 0 → verdict **Pass**.
- Threshold overrides **0**; accepted-duplication baseline **empty**; source
  suppressions **42** (judged in Step 3); pending-changelog inbox **empty**.
- Churn (one frame, both lenses agree; 29 commits `f35cdb3..ba48288`):
  version-mechanics (`app-version.ts` 16) aside, the top band is the
  3.10.2.x mutation-route sweep (17 routes at 5 touches each,
  `mutation-route.ts` 5, api-contracts 4–5) — the designed one-time fan-out of
  adopting the shared pipeline shell, not organic churn.
- Known-wide surfaces (baseline rows, fresh): auth hub 0; PricingContextValue
  0 / usePricing 0; planner concern fields 5/10/18/6/13; concern-hook
  consumers 20 calls / 9 files; telemetry 25 exports / 44 fan-in production
  files (pinned command: `grep -rl "data/telemetry" src convex` excluding
  tests; the prior 50 used an unreproducible definition — recorded here, value
  shape unchanged); refresh-jobs 13; auth contract paths 3; dataset registry
  entries 13; freshness leaf 3 functions / 14 importers; cron shells 7;
  harness consumers 20; dataset census 56 tables / 14 index tests (14/14
  pass); API contracts 52 routes / 17 modules; type-images 8/6/15.
- New v3.10 surfaces (audit evidence only; registration deferred to the v3.11
  opening per PD-2 — deferral now recorded in `docs/backlog.md`
  "v3.11 opening obligations"): boundary coverage **22 configured zones / 49
  expanded / 0 unclassified**; vendor-resilience registry **15 declared
  integrations**; capability instrumentation **24 shell-required operations +
  census-pinned remainder** with **5 owned SLIs**; Phase 4 adoption census
  green with **empty temporary CSS allowlist**; `globals.css` 1,792 → 1,041
  lines (−939/+188; the plan's ~1,145 estimate was gross-line grounding — the
  measured deletion set is 939 with 188 replacement lines, census-verified
  zero unexempted residue).
- `check_baseline_claims` before replacement: exactly the three expected
  stale-Current warnings (804→806, 79,152→79,515, 424→428); after
  replacement: **clean**. `check_watch_triggers`: clean before and after —
  telemetry 25 &lt; 26, refresh-jobs 13 ≤ 15, auth contract 3 &lt; 4.

### Step 2 — Hotspot re-rank (breadth × axes × churn × amplification × cohesion)

1. **Composition census-registry band** (`data-ownership-registry.ts` 855,
   `idempotency-registry.ts`, `vendor-resilience-registry.ts`,
   `ui-adoption-registry.ts`, `table-growth-registry.ts`) — large but
   declarative single-axis row files, each consumed by one census test;
   growth is per-declared-row, deliberate. Direction of fix: if any registry
   gains a second programmatic consumer or per-row behavior, split data from
   judgment at that seam; length alone is not a trigger.
2. **`src/data/telemetry/queries.ts`** (552 LOC, 25 exports, 44 fan-in) —
   3.10.3.1 extended it deliberately and stayed below the AF-006 trigger;
   still one telemetry-read axis. Watch retained; direction on promotion:
   split read-model owners by consumer (admin ops vs SLI vs alerting).
3. **Mutation pipeline + problem mapper seam** — churn was the adoption sweep
   itself; the shell now owns ordering/same-origin/capability decisions
   (AF-001 protected). No residual pressure.
4. **`PricingProvider.tsx`** (906 LOC) — AF-005 protected concern boundaries;
   concern contexts stable (5/10/18/6/13), consumers narrowed 22 calls/11
   files → 20/9. Cohesion defense holds.
5. **`globals.css`** — pressure resolved this version (−939 lines,
   census-railed, allowlist empty).
6. **`src/platform/esi/dispatch.ts`** (447) and `tree-resolver.ts`,
   `convex/engine.ts`, `api-client.ts`, `env.ts` — protected deep modules,
   unchanged verdict.
7. Health-tool ROI suggestions (`src/lib/format/time.ts` split, 13
   dependents) rejected by judgment: a 65-LOC single-axis formatting leaf
   with high fan-in is a stable deep leaf; fragmenting it violates the design
   creed. `use-refresh-on-view.ts` (health 88.0) shows no version pressure
   signal (no churn coincidence).

No candidate reaches Floss/Campaign: no interface-breadth growth coincides
with unrelated change axes and churn anywhere this version.

### Step 3 — Drift review

- **Suppression growth (21 → 42), fully attributed:** −1 genuinely repaid
  (`JsonLd.tsx` `dangerouslySetInnerHTML` replaced, not relocated, PR #296),
  20 carried (2 relocated by the restructure, scopes unchanged), **+22 new —
  all single-line `@ts-expect-error` compile-time negative type assertions in
  `src/transport/{api-client,api-response,endpoint}.test.ts`**, introduced by
  3.10.2.1 (PRs #299/#300/#302), 22/22 with same-line rationale naming the
  contract clause, self-invalidating under `tsc` (an unused directive fails
  typecheck, which CI runs). True diagnostic suppressions fell 21 → 20;
  production sites 9 → 8. Verdict: **justified; no finding.** Two follow-ups
  recorded in the backlog (metric split at the v3.11 opening; six pre-v3.9
  rationale-free `no-explicit-any` sites as an XS repayment entry).
  Informational: `endpoint.test.ts:153`/`:161` attach the directive to an
  object-literal property line — a narrower anchor (hoisted const) would make
  the assertion unambiguous; not a defect.
- **Clone group `dup:a60cc554`:** the test's `VIEWPORTS` literal is a
  deliberate pin ("pins the complete responsive and zoom-proxy matrix") — a
  change to the matrix must consciously update the pin. Classified **boring
  shape, accepted with this rationale**; dev-tooling scope (`scripts/`), no
  accepted-baseline entry required (gating run unaffected).
- **Boundary drift:** 22 configured zones expand to 49, zero unclassified
  files, zero violations, cycles at error; no new `allow` entries beyond the
  declared reference-core exception; composition sits above slices
  (registries/pipelines/search/purge/sync all in `src/composition/`). The
  pinned run's `scripts`/`transport` "0 reachable files" warnings are scope
  artifacts of the changed-file audit view, not live-config zone failures
  (the live boundary listing shows both zones populated).
- **Override staleness:** zero threshold overrides, empty dupes baseline —
  nothing to loan-review.
- **Rails:** every v3.9 rail plus the v3.10 set is enforced by the gating
  suite re-run in §7 (boundary deny-by-default with blocking cycles,
  `server-only` rails + enumeration, problem-contract gates, same-origin 403 +
  discovery test, ownership/RLS census, vendor census + bare-`fetch` ban +
  SDK homes, required `capability` option, architecture-map byte-for-byte
  drift test, Phase 4 adoption census + CSS-family checker with recorded
  exemptions and 62/62 syntax-rail fixtures). **Rails-gap:**
  `verify_archive.py` does not fidelity-check `session-as-built`; compensated
  this close with an explicit recorded `diff -r`, and the one-line bundle-list
  extension is routed to the v3.11 opening (backlog).
- **Lifecycle truth:** 15 SHIPPED roadmap rows ↔ 15 changelog headings
  (id-set identical); 19 contracts ↔ 19 approved plans (one-to-one, all
  `Execution status: Complete`); 11 as-built records, every session from the
  `3.10.2.1.1` binding floor, each carrying its PR number (#299–#311); Phase 4
  ship claim evidenced clause-by-clause (adoption census clean, seeded-bypass
  rail proofs, width-matrix probes, punch ledger operator-resolved, re-audit
  zero residue); survey 43/43 AD rows terminal (40 A1 Delivered, 2 A2, 1 BL);
  absorbed §3.10.1.3/§3.10.3.2 agree across roadmap, changelog, and as-built.
  Reconciliation dispositions: (a) the 3.10.1.2 three-PR exception is
  recorded in roadmap/contract/plan; the PR numbers are **#294/#295/#296**
  (recorded here; git is the repository's ship record). (b) The
  `3.10.2.1-e2e-type-safety-brief.md` supplementary brief is sanctioned
  (cited as design authority by the 3.10.2.1.x plans) and **archives with the
  session-plans directory in the version bundle**. (c) The 3.10.4.3.1
  as-built's SC-9 "PR #311 is open" wording is close-out's by-design
  pre-merge authoring time; merge truth lives in git/changelog and release
  consistency is green. (d) The SCRATCHPAD "Now" block and Shipped-ledger
  stale notes are RECORD-document state this audit updates as its own Step 6
  output. (e) The PD-2 / new-surface-registration deferral had no recorded
  home outside this plan — fixed within the audit's authorized backlog
  reconciliation (see "v3.11 opening obligations"); with the home recorded,
  no finding remains.
- **Docs truth:** the sweep verified SECURITY.md, the `.github/` templates,
  `/legal`, `docs/architecture-boundaries.md` (exact 22-zone match,
  correctly "between zones" throughout), `docs/workflows/*` (pipeline as
  enforced), `AGENT_TOOLING.md`, `DATA_SOURCES.md`, and the landed 3.10.4.1
  CONTRIBUTING "lint-enforced" corrections (every cited rule exists in
  `eslint.config.mjs`). The 3.10.3.3.1 intra-zone wording fix landed in the
  zone-map legend, SVG title, and public devlog sentence with regression
  tests. **Eight surviving untruths were confirmed first-hand and are
  classified as AF-016 (Floss)** — see Step 4.

### Step 4 — Classification

**AF-016 (Floss, new, Open) — committed public/workspace documents carry
eight stale or wrong claims.** Principle: a public document that describes
the app untruthfully is a finding like any other; the version's own thesis
(intended design → enforced design) makes recorded-but-wrong prose the exact
residue a close audit exists to catch. The confirmed set:

1. `CONTRIBUTING.md:34` — "UI primitives import only from `src/lib`";
   reality: the `ui` zone declares `allow: []` (no cross-zone imports), and
   no `src/components/ui/` file imports `@/lib`.
2. `.env.example:20` — migrations attributed to `src/db/migrate.ts`, which
   does not exist (actual: `src/scripts/migrate.ts` + `migrate-url.ts`).
3. `.env.example:45-46` — names `src/platform/auth/eve-sso.ts` as the
   authoritative `EVE_SCOPES` home; it is defined in
   `eve-sso-constants.ts:26` (README already points there — the two public
   docs contradict each other).
4. `docs/architecture-map.md:18` (generator
   `src/scripts/architecture-map.ts:325`) — "Any pair with no link is
   forbidden" — the surviving public instance of the recorded intra-zone
   gotcha (no zone has a self-link, yet intra-zone imports are
   unconstrained); the devlog links readers to this file.
5. `src/features/devlog/components/ZoneMap.tsx:10` — unqualified "an empty
   cell is the deny-by-default rule made visible" header comment while the
   same file's line 185 is correct.
6. `README.md:139-140` — "Schema sources live in each feature slice";
   reality: 8 of 18 schemas in features, 9 in `src/data/<name>/`, 1 in
   `src/db/auth-schema.ts`, aggregated by `src/composition/drizzle-schema.ts`.
7. `docs/CONVEX.md:9` — cites `docs/SCALING_AUDIT_FINDINGS.md`, which does
   not exist in the live tree (archived content).
8. `README.md:111` — `pnpm build` labeled "CI/Vercel only"; CI runs no build
   step — the production build is Vercel-only, post-merge.

Required outcome: every claim corrected to live reality at its owning site;
the architecture-map fix edits the generator and regenerates both emitted
artifacts under the existing byte-for-byte drift test; no behavior change
anywhere. Bounded docs/copy work, one remediation sub-version, size S.
Related non-finding observations (README architecture-overview gap naming
none of the v3.10 layers, CONTRIBUTING invariants omitting the problem
contract and same-origin rail) may ride the same remediation at the
operator's discretion.

AF-006, AF-007, AF-008 re-checked below their triggers and still earning
their carriers (deliberate 3.10.3.1 telemetry extension stayed at 25;
refresh-jobs cohesive at 13; auth contract exactly three files). No other
new finding: suppressions, clone group, boundaries, rails, hotspots, and
lifecycle truth all closed clean above.

### Remediation mapping — cycle 1 (2026-07-27, `plan-audit-remediation`)

AF-016 maps to one execution bundle: **sub-version `3.10.5.1`, session
`3.10.5.1.1`** — roadmap §3.10.5.1 (new Phase 5), contract
`docs/session-contracts/3.10/3.10.5.1.1.md`, indexed. One bundle is the fewest
safe bundle: all eight sites share one change axis (a committed document states
something the live system does not do), no site depends on another's outcome,
and Step 4's items 4 and 5 are the same intra-zone wording defect and must move
together. The audit's two related non-finding observations were admitted to the
same bundle by explicit operator ruling on 2026-07-27 and are recorded in the
contract's DC-7/PD-3. No unaudited scope is mapped: the four v3.11 opening
obligations and the six rationale-free carried suppressions stay in
`docs/backlog.md`, and AF-006/AF-007/AF-008 stay `Watch`.

Two live figures were corrected during the mapping's adversarial review; both
are recorded here rather than by editing this plan's frozen cycle-1 evidence:

- **Step 4 item 6's schema census is stale.** Live
  `src/composition/drizzle-schema.ts` re-exports 19 modules — 8 feature slices,
  10 `src/data/<name>/` slices, and `src/db/auth-schema.ts` — and no
  `src/platform` schema exists. The finding itself stands; the remediation's
  README wording must be built from a re-run live census, never from the
  "8 of 18 / 9 in `src/data`" figure above.
- **Step 4 item 1's denial mechanism.** The `ui` zone's imports are denied by
  the `boundaries.rules` entry `{ "from": "ui", "allow": [] }`; the zone object
  itself carries patterns only. Acceptance evidence must cite the rule.

Scope fence discovered in the same review: `docs/session-plans/3.10/3.10.3.3.1.md`
quotes the pre-correction devlog wording verbatim. It is frozen RECORD and is
never rewritten to satisfy this remediation's wording sweep; the contract's
OOS-7 owns that exemption.

## Execution evidence — cycle 2 (2026-07-27)

### Step 0 — Transition and pre-overwrite capture

- Resolver directive named `version-audit` (stage `audit-restart-ready`, mode
  execute, action "Restart the complete version audit as cycle 2 for 3.10");
  pre-dispatch `check_release_consistency.py --check` returned zero
  errors/warnings. Procedure digest verified byte-exact against the current
  `docs/workflows/version-audit.md`
  (`2e788e7e609cbc6a7d00b0488caaee1d8e993e82cba8a7b95805cd668b0e8091`).
- Terminal merge evidence for the one mapped remediation sub-version
  (`3.10.5.1`) confirmed: roadmap row SHIPPED, as-built
  `docs/session-as-built/3.10/3.10.5.1.1.md` carrying `**PR:** #313`,
  `APP_VERSION` 3.10.5.1, and the published `v3.10.5.1` changelog entry.
- **Audited-ref note.** The audited ref `19fd1b84` is local `main`, one commit
  ahead of `origin/main` (`aeceea36`). That commit is the audit-adjacent
  documentation fix described below, committed locally by explicit operator
  direction on 2026-07-27 rather than shipped as its own PR; it and the audit's
  own outputs carry forward to the next PR or the next version. Every
  measurement and gate in this cycle ran against `19fd1b84`.
- Outgoing baseline captured before overwrite: Snapshot `2026-07-27 / 3.10.4.3
  / ba48288`, Metrics table as published at cycle 1.

**Entry-state defect corrected before dispatch.** Cycle 1 closed with AF-016's
remediation merged (PR #313) but its ledger row still reading `Planned`, which
left the resolver in `stage: invalid` on committed `main` ("the remediation
roadmap is terminal but findings are not Delivered"). The row was marked
`Delivered` and procedure Step 6 was amended so the marker lands *in* the
delivering PR rather than in a post-merge reconciliation step, with a
`policy-manifest.json` ordered checkpoint and a `test_agent_drift.py` case
holding the new wording. That change is what bumped this plan's procedure
digest; §2's inline citation was updated to match.

### Step 1 — Measurements at `19fd1b84`

Every value is unchanged from cycle 1, as expected: PR #313 touched three
source files for six insertions and six deletions (`app-version.ts`,
`ZoneMap.tsx` comment, `architecture-map.ts` legend string), so the shape,
coverage, and breadth surfaces could not move.

- Files/LOC/tests: **806** production TS/TSX, **79,515** LOC, **428** test
  files. Largest production files unchanged in rank: `PricingProvider.tsx` 906,
  `data-ownership-registry.ts` 855, `tree-resolver.ts` 693.
- Fresh full-Postgres `pnpm test:coverage`: **4305 passed + 1 skipped (4306)**
  across 436 test files at **85.83 / 82.81 / 81.37 / 86.89**. DB suites ran.
- `pnpm fallow:health`: **Health score 78 B** (hotspots −10.0, unit size −10.0,
  coupling −2.5), maintainability 91.6, **0 functions above thresholds**.
- Pinned `FALLOW_AUDIT_BASE=f35cdb3 pnpm fallow`: 1043 changed files, dead code
  0, complexity 0, duplication **1 clone group** (`dup:a60cc554`, unchanged),
  exit 0 → verdict **Pass**.
- Threshold overrides **0** (`"thresholdOverrides": []`); accepted-duplication
  baseline **empty**; source suppressions **42**; pending-changelog inbox
  **empty** (README only).
- Churn, version lens `f35cdb3..19fd1b84` (31 commits): unchanged top band —
  `app-version.ts` 16, then the 3.10.2.x mutation-route sweep at 5 touches per
  route. No new churn concentration.
- Known-wide surfaces (all re-measured, all matching the baseline's `Current`):
  auth hub 0; `PricingContextValue` 0 / `usePricing()` 0; planner concern
  fields 5/10/18/6/13; concern-hook consumers 20 calls / 9 files; telemetry 25
  exports / 44 fan-in; refresh-jobs 13; auth contract paths 3; dataset registry
  entries 13; freshness leaf 3 functions / 14 importers; cron shells 7;
  harness consumers 20; dataset census 56 tables / 14 index tests; API
  contracts 52 routes / 17 modules; type-images 8 exports / 15 importers.
- New v3.10 surfaces (evidence only, registration still deferred to the v3.11
  opening): boundary coverage **22 configured zones / 49 expanded / 0
  unclassified / 0 violations**; vendor-resilience registry **15 declared
  integrations**; capability instrumentation and the Phase 4 adoption census
  unchanged and green.
- Two measurement-definition traps recorded so a later cycle does not misread
  them as drift: counting `BuildSetupValue` members with a naive
  "`name:` at brace depth 0" rule yields **20** because it also counts
  `applyBuildSystem`'s multi-line `sys`/`opts` parameters — the correct member
  count is **18**; and `grep -c "table:"` on `data-ownership-registry.ts`
  yields **58** because it catches a function parameter and a `readonly table:`
  type field — the declaration count is `grep -cE "^\s+table:"` = **56**.
  Likewise the expanded zone count is the `fallow list --boundaries` header
  (**49**), not the number of printed rule rows (45).
- `check_baseline_claims` clean before **and** after the replacement (cycle 1
  already published current values, so no stale-Current warnings existed this
  cycle); `check_watch_triggers` clean before and after.

### Step 2 — Hotspot re-rank

Re-run against the same inputs, the cycle-1 ranking stands unchanged and is
re-affirmed rather than copied: the composition census-registry band remains
declarative single-axis row files; `src/data/telemetry/queries.ts` stays at 25
exports on one telemetry-read axis (AF-006 Watch retained); the mutation
pipeline seam has no residual pressure; `PricingProvider.tsx` concern contexts
are stable at 5/10/18/6/13 with consumers at 20/9; `globals.css` pressure
stayed resolved; and `tree-resolver.ts`, `convex/engine.ts`, `dispatch.ts`,
`api-client.ts`, and `env.ts` keep their protected-deep-module verdict. The
health tool's two ROI suggestions (`src/lib/format/time.ts`,
`scripts/profile-parse.mjs`) are rejected by the same judgment as cycle 1: a
65-LOC single-axis formatting leaf with high fan-in is a stable deep leaf, and
fragmenting it would violate the design creed. **No candidate reaches
Floss/Campaign:** nowhere does interface-breadth growth coincide with unrelated
change axes and churn.

### Step 3 — Drift review

- **AF-016 re-verified first-hand, all eight sites.** (1) `CONTRIBUTING.md:34`
  now states UI primitives import no other zone and cites the `.fallowrc.json`
  rule, explicitly allowing sibling primitives; (2) `.env.example:20` names
  `src/scripts/migrate.ts`; (3) `.env.example:45-46` names
  `src/platform/auth/eve-sso-constants.ts`; (4) `docs/architecture-map.md` and
  its generator `src/scripts/architecture-map.ts:325` both read "Any pair of
  **different zones** with no link is forbidden: deny-by-default applies
  between zones, and imports within a single zone are unconstrained", byte-for-
  byte identical under the drift test; (5) `ZoneMap.tsx`'s header comment and
  its line-185 SVG `<title>` both qualify the empty cell as "between two
  different zones" and state the diagonal is never restricted; (6)
  `README.md:141` now says schema sources live beside the owning slice, which
  the live census confirms — `src/composition/drizzle-schema.ts` re-exports
  **19** modules: 10 `src/data/`, 8 `src/features/`, 1 `src/db/auth-schema.ts`;
  (7) `docs/CONVEX.md` no longer cites a path, saying the scaling audit was
  "completed and archived out of tree" (the file is genuinely archived, at
  `../LGI Tools Document Archive/pre-3.8/SCALING_AUDIT_FINDINGS.md`); (8)
  `README.md:111` reads "Production build — Vercel only, after merge; never run
  locally". **Required outcome met in full → AF-016 Verified.**
- **Suppressions** hold at 42 with no new site; cycle 1's attribution (22 new
  single-line `@ts-expect-error` negative type assertions in the transport
  suites, self-invalidating under `tsc`, true diagnostic suppressions down
  21 → 20) is unchanged and its "justified, no finding" verdict stands.
- **Clone group** `dup:a60cc554` unchanged; the accepted boring-shape rationale
  (a deliberate viewport-matrix pin in dev tooling) still holds.
- **Boundary drift:** 22 configured zones / 49 expanded, zero unclassified,
  zero violations, cycles at error, no new `allow` entries.
- **Override staleness:** zero threshold overrides, empty dupes baseline.
- **Lifecycle truth:** 16 SHIPPED roadmap rows ↔ 16 changelog headings with an
  **identical id set** (verified by `diff`); 20 contracts ↔ 20 approved session
  plans one-to-one, all `**Execution status:** Complete`; 12 as-built records
  covering every session from the `3.10.2.1.1` binding floor; the 21st
  session-plans file remains the sanctioned `3.10.2.1-e2e-type-safety-brief.md`
  supplementary brief, which archives with that directory.
- **Docs truth:** the public and workspace sweep is otherwise clean. The
  retired Phase 0 documents stay retired — every surviving mention is the
  master plan's own historical account of retiring them, not a live reference.
  `check_doc_refs` exits 0; its eight warnings are unresolvable *archive*
  references inside frozen RECORD documents, including two in
  `docs/session-plans/3.10/3.10.5.1.1.md` that point at the archive root while
  the file actually sits under `pre-3.8/`. Frozen records are never rewritten
  (the OOS-7 rule), and the checker treats these as warnings, so no finding
  arises. **One new untruth was confirmed and is classified as AF-017** — see
  Step 4.
- **Rails:** every v3.9 and v3.10 rail re-ran green in the §7 battery.
  **Rails-gap (carried):** `verify_archive.py` still does not fidelity-check
  `session-as-built`; the compensating explicit `diff -r` remains required at
  archive time, and the one-line bundle-list extension stays routed to the
  v3.11 opening. **Rails-gap (new, owned by AF-017):** nothing mechanically
  ties this procedure's restatement of the watch-trigger grammar to the schema
  and checker that actually implement it.

### Step 4 — Classification

**AF-017 (Floss, new, Open) — this procedure's watch-trigger grammar omits a
subject form that the schema, the checker, and the live baseline all use.**
`docs/workflows/version-audit.md` Step 4 introduces the trigger grammar as a
specification ("this closed grammar", "The grammar is a closed set") and
enumerates the `files` metric's subject as *either* `zone:<name>` *or*
`paths:<path>,...` — two forms. But
`docs/workflows/schema/code-health-baseline.md` defines **three**, adding
`files(globs:<pattern>,...)`; `.agent-local/check_watch_triggers.py:90` accepts
it and names all three in its own error text; and the live baseline's **AF-008
carrier uses `globs:`**. A reader following the procedure alone would judge the
repository's own Watch carrier invalid.

The divergence was introduced by this version: `globs:` entered the schema and
the checker together in `eca3d994` (PR #296, the 3.10.1.2 responsibility-layer
restructure, which remapped the auth contract paths and needed a growable
pattern family), and `docs/workflows/version-audit.md` has never mentioned it
in any revision. Principle diagnosis: the grammar has **two owners** — the
schema owns the exact artifact form per `AGENTS.md`, yet the procedure restates
it normatively, so an extension to one representation silently falsified the
other. This is the "second enforcement representation" red flag from
`docs/workflows/pre-pr-design-review.md` §6.4, and it is the same class of
defect as AF-016: a committed document that describes the system untruthfully.

Required outcome: one owner for the trigger grammar. The preferred shape is to
delete the duplicated enumeration from the procedure and defer wholly to the
schema it already names in the same sentence, keeping in the procedure only the
non-mechanical judgment (trip-form semantics, warn-not-gate, "adding a metric
kind is a specification change"). Merely appending `globs:` to the procedure's
list would restore truth today while preserving the two-owner structure that
caused the drift, so it is the weaker fix. Bounded documentation work, size XS,
no behavior change. A rail keeping the two in sync — or the removal that makes
a rail unnecessary — should land with it.

AF-006, AF-007, and AF-008 were re-checked and remain below their triggers
(telemetry 25 < 26; refresh-jobs 13 ≤ 15; auth contract exactly 3 < 4), each
still earning its carrier. No other new finding: hotspots, suppressions, the
clone group, boundaries, overrides, rails, and lifecycle truth all closed clean
above.

## Execution evidence — cycle 3 (2026-07-27)

### Step 0 — Transition

- Resolver directive named `version-audit` (stage `audit-restart-ready`, action
  "Restart the complete version audit as cycle 3 for 3.10"); pre-dispatch
  `check_release_consistency.py --check` clean. Procedure digest verified
  byte-exact (`12cf58a8…`). Worktree clean at `9ce2210d`.
- The only mapped remediation from cycle 2 (AF-017) was delivered in-cycle by
  operator ruling; its commit `9ce2210d` is the audited ref.

### Step 1 — Measurements at `9ce2210d`

Identical to cycles 1 and 2 in every registered row. Provenance is exact: the
complete source delta from the cycle-1 ref is
`git diff ba48288..9ce2210d -- src convex` = **three files, +6/−6**
(`app-version.ts`, the `ZoneMap.tsx` header comment, the `architecture-map.ts`
legend string), so no measured surface could move.

- 806 production TS/TSX, 79,515 LOC, 428 test files.
- `pnpm test:coverage`: **4305 passed + 1 skipped (4306)** across 436 files at
  **85.83 / 82.81 / 81.37 / 86.89**.
- `pnpm fallow:health`: **78 B**, maintainability 91.6, **0 above threshold**.
- Pinned `FALLOW_AUDIT_BASE=f35cdb3 pnpm fallow`: 1043 changed files, dead code
  0, complexity 0, duplication 1 (`dup:a60cc554`), exit 0 → **Pass**.
- Overrides `[]`; suppressions **42**; accepted-duplication baseline empty;
  pending-changelog inbox empty; 22 configured / **49** expanded zones.
- Every known-wide surface re-measured and matching: auth hub 0;
  `PricingContextValue` 0 / `usePricing()` 0; planner concern fields
  5/10/18/6/13 (file provably untouched since cycle 1); concern-hook consumers
  20 calls / 9 files; telemetry 25 exports / 44 fan-in; refresh-jobs 13; auth
  contract paths 3; dataset registry 13; freshness 3 / 14; cron shells 7;
  harness consumers 20; dataset census 56 tables / 14 index tests; API
  contracts 52 / 17; type-images 8 / 15; vendor integrations 15.

### Steps 2–3 — Hotspots and drift

Hotspot ranking unchanged and re-affirmed; no candidate reaches
Floss/Campaign. Suppressions, the accepted clone group, boundaries (0
unclassified, 0 violations), and override staleness all re-checked clean.

**Lifecycle truth:** 16 SHIPPED roadmap rows ↔ 16 changelog headings with an
identical id set (verified by `diff`); 20 contracts ↔ 20 approved plans, all
`**Execution status:** Complete`; 12 as-built records from the binding floor;
the 21st session-plans file is the sanctioned supplementary brief.
`APP_VERSION` 3.10.5.1 matches the changelog head. Master-plan close claims
re-verified against terminal decisions: the Phase 4 adoption survey carries
**43 distinct `AD-NNN` ids, every one terminal** (the 83 raw row matches are
those ids recurring in the delivery-ledger and re-audit sections), and the
punch ledger records the operator's resolution declaration.

**AF-017 required outcome re-proved first-hand.** `docs/workflows/version-audit.md`
now contains **no** occurrence of `zone:`, `paths:`, `globs:`, `<metric>`,
`<op>`, "closed grammar", or "closed set" — the duplicated enumeration is gone,
not patched. The schema retains all three `files()` subject forms and
`check_watch_triggers.py` still accepts exactly those three, so the single
surviving owner and its checker agree, and the live AF-008 carrier parses clean.
The two-owner structure that caused the drift no longer exists, which is why no
sync rail was added. **AF-017 → Verified.**

**One new finding, AF-018, surfaced by the close transition itself and fixed
in-cycle.** With `Audit status: Complete` set, the resolver refused the archive
transition: "A Complete audit requires CODE_HEALTH_BASELINE.md to match the
Audited ref." The refusal was wrong. `resolve_development_state.py` compared the
*whole* `Code ref` table cell against the plan's `Audited ref` marker by string
equality, while `docs/workflows/schema/code-health-baseline.md` documents that
cell as "full lowercase commit SHA **and optional structured qualifier**". Every
baseline this repository has ever written carries such a qualifier, so the
documented-optional qualifier made a clean close unreachable — the defect was
latent only because no prior cycle reached `Complete`.

This is the same two-owner failure as AF-017 with the roles reversed: there the
prose contradicted the checker, here the checker contradicts the schema. Fixed
at the checker, since the schema is the artifact-form owner: the comparison now
extracts the leading 40-character SHA from the cell and compares that, leaving
the strict full-SHA requirement intact. Two tests in
`.agent-local/test_development_state.py` pin both directions — a qualified cell
whose SHA matches reaches `archive-needed`, and a qualified cell whose SHA
differs is still `invalid`. The full 50-test resolver suite passes and the live
resolver now returns the archive directive.

**Verification.** AF-018 is left **Delivered**, not Verified, at cycle 3's
close. Marking it Verified on its own cycle's evidence was considered and
rejected: `verify_archive.py --check --phase pre` correctly refused the archive
("current audit cycle contains new actionable finding AF-018"), and forcing
that gate green by reclassifying the finding would be papering over a check
rather than satisfying it. Cycle 4 is the honest resolution and is cheap — the
tree is already fully measured and stable, and its only delta is this fix plus
its two tests. Cycle 3 therefore does **not** close clean.

### Steps 5–6 — Baseline and close

Baseline replaced at `9ce2210d` with the frozen `Version-start` column
preserved byte-for-byte; `check_baseline_claims` and `check_watch_triggers`
clean after replacement. Every gate in §7 passed: `pnpm verify`, strict
`tsc --noEmit --incremental false`, `assert:routes-present` (78 routes), the
pinned Fallow run, baseline-claims, watch-triggers, release-consistency,
doc-refs, pending-changelog, and agent-drift. Baseline `Code ref` equals
`Audited ref`.

AF-017 is Verified and every Watch is below trigger, but AF-018 is new in this
cycle and Delivered rather than Verified, so `verify_archive.py --phase pre`
holds the archive and the version does not close on cycle 3. Cycle 4 re-audits
the advanced ref.

## Execution evidence — cycle 4 (2026-07-27)

Directive `audit-restart-ready` → "Restart the complete version audit as cycle 4
for 3.10"; pre-dispatch gate clean; procedure digest byte-exact (`12cf58a8…`);
worktree clean at `c60a44e6`.

**Delta since the cycle-3 ref is `.agent-local` tooling and docs only —
`git diff 9ce2210d..c60a44e6 -- src convex` is empty.** Every product
measurement is therefore provably identical, and was re-run rather than
assumed: 806 production files / 79,515 LOC / 428 test files; coverage
**85.83 / 82.81 / 81.37 / 86.89** from 4305 passed + 1 skipped; health **78 B**
with 0 above threshold; pinned Fallow 1043 files, dead code 0, complexity 0,
one accepted clone group, **Pass**; overrides `[]`; suppressions 42;
accepted-duplication baseline empty; pending-changelog inbox empty; 22
configured / 49 expanded zones, 0 unclassified, 0 violations. Every wide
surface re-measured and matching: 0 / 0-0 / 25-44 / 13 / 3 / 13 / 3-14 / 7 /
20 / 56-14 / 52-17 / 8-15 / 20-9. Hotspot ranking unchanged; lifecycle truth
unchanged and green.

**AF-018 required outcome proved first-hand by this cycle.** The live baseline
`Code ref` cell carries a qualifier (`… on \`main\` (the v3.10 cycle-4 audited
ref; clean close)`) exactly as the schema permits, and the resolver now reaches
`archive-needed` on it — the transition that was unreachable before the fix.
The full 50-test resolver suite passes, including the two new cases pinning a
matching qualified cell to `archive-needed` and a mismatched one to `invalid`.
**AF-018 → Verified.**

**No new finding this cycle.** Every gate in §7 passed: `pnpm verify`, strict
`tsc --noEmit --incremental false`, `assert:routes-present` (78 routes), the
pinned Fallow run, baseline-claims, watch-triggers, release-consistency,
doc-refs, pending-changelog, and agent-drift. Baseline replaced at `c60a44e6`
with `Version-start` preserved byte-for-byte; `Code ref` equals `Audited ref`.
AF-016, AF-017, and AF-018 are all Verified; AF-006/007/008 remain Watch below
trigger. **The version closes clean and archives.**

## Audit findings

Seeded with the carried Watch findings (their countable triggers live in the
baseline, cited by AF id only). New v3.10 findings receive the next monotonic
id from **AF-016**; a delivered outcome that failed re-verification reuses its
original id.

| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-006 | 1 | Watch | Telemetry query module (carried from v3.8) broad enough to monitor for another change axis; 3.10.3.1 deliberately extended the module and stayed below trigger. | Promote on a 26th export or renewed multi-session growth. | — | Watch |
| AF-007 | 1 | Watch | Refresh-job query module (carried from v3.8) large but cohesive around one queue lifecycle. | Promote above 15 exports or on a second persistence concern. | — | Watch |
| AF-008 | 1 | Watch | Auth platform contract (carried from v3.8; paths remapped by 3.10.1.2 to `src/platform/auth/`) is a deliberate exact three-file exception. | Promote if any work proposes a fourth matching file; prefer a real platform module. | — | Watch |
| AF-016 | 1 | Floss | Committed public/workspace documents describe the system untruthfully in eight places (wrong file paths, wrong zone/schema-ownership claims, the surviving public intra-zone deny-by-default wording; full set in Step 4 above). | Every claim corrected to live reality at its owning site; architecture-map fix flows through the generator + regeneration under the existing drift test; no behavior change. | 3.10.5.1 | Verified |
| AF-017 | 2 | Floss | The watch-trigger grammar has two owners: `docs/workflows/version-audit.md` restates it normatively but lists only two `files()` subject forms, while the owning schema, `check_watch_triggers.py`, and the live AF-008 carrier all use a third (`globs:`). Introduced by this version in `eca3d994` (PR #296), which extended schema and checker without the procedure. | One owner for the grammar — preferably delete the duplicated enumeration from the procedure and defer to the schema it already cites, keeping only the non-mechanical judgment; plus a rail, or the removal that makes one unnecessary. No behavior change. | In-cycle (operator ruling, 2026-07-27) | Verified |
| AF-018 | 3 | Floss | `resolve_development_state.py` compared the whole `Code ref` cell to the `Audited ref` by string equality, while the baseline schema documents an optional qualifier after the SHA — making a clean close unreachable for every baseline this repository writes. Two owners again, with the checker contradicting the schema. | Compare the extracted leading 40-character SHA, keeping the strict full-SHA requirement; pin both directions with tests. | In-cycle (operator standing direction, 2026-07-27) | Verified |

At the cycle-2 audited ref: telemetry 25 exports (< 26), refresh-jobs 13
(≤ 15), auth contract 3 files (< 4) — all below trigger and each still earning
its carrier. AF-016's eight required outcomes were re-proved first-hand this
cycle and it is **Verified**.

**AF-017 remediation — in-cycle, by explicit operator ruling (2026-07-27).**
The operator judged a full `plan-audit-remediation` extension — sub-version,
contract, session plan, and PR — disproportionate to a one-paragraph
documentation defect, and directed the fix be folded into the same local
commits that carry this audit. Step 4 of `docs/workflows/version-audit.md` no
longer restates the trigger grammar: it names
`docs/workflows/schema/code-health-baseline.md` as the sole owner of the
metrics, subject forms, and operators, states that extending the grammar is a
change to that schema made together with `check_watch_triggers.py`, and keeps
only the judgment this procedure genuinely owns (trip-form semantics, and that
a tripped trigger is a warn rather than a gate). That removes the second
representation rather than patching it, so the required outcome is met by
deletion and no new sync rail is needed. The change bumped this plan's
procedure digest a second time; the header and §2 were updated to match.
AF-017 was therefore left **Delivered**, not Verified, at cycle 2's close:
only a fresh cycle can prove a required outcome. Cycle 3 proved it and marked
it Verified.
