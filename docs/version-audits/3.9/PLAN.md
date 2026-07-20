# Version 3.9 "Refit" Whole-Version Close Audit Plan

**Audit status:** Remediation in progress
**Approved:** 2026-07-19
**Version:** 3.9
**Audit mode:** Version close
**Audit cycle:** 1
**Audited ref:** `ef2e7dfc79548c0ca47ddbe81200b04cbd7204ae`
**Procedure:** `docs/VERSION_AUDIT.md`
**Procedure digest:** `sha256:f4f54f9bbed6174474568e4fd849505a4e78a4a9e65053f0eb454d920b025014`

> **Expected shape: a two-cycle close, like v3.8.** Code health shows no drift
> (35 zones/rules unchanged, 21 suppressions identical, 0 clone groups, all rails
> present, all Phase-1 checkers green, all three carried Watch triggers below
> threshold). Three real docs-truth defects exist (master-plan §3.9.3.4 stale root
> cause; README `pnpm build` row vs the local-build ban; constitution P7 citations
> to code deleted in v3.8). Per `docs/VERSION_AUDIT.md` Step 3–4 and lifecycle §6 a
> confirmed docs-truth defect is an actionable Floss remediated before archive, not
> corrected in place. So the realistic path is cycle 1 (audit `ef2e7df`, confirm
> the three Floss + re-check the three Watch) → `Remediation required` → a small
> docs-truth remediation sub-version via `plan-audit-remediation` → cycle 2
> (re-audit the advanced canonical `main`) → clean → archive. This plan was drafted
> with read-only `gpt-5.6-sol@high` grounding workers and reviewed across two
> adversarial `gpt-5.6-sol@high` passes; accepted corrections are folded in.

## 1. Scope and comparison frames

- **Cycle-1 audited code ref:** `ef2e7dfc79548c0ca47ddbe81200b04cbd7204ae` — the
  final shipped v3.9 code (v3.9.4.1, PR #272). The docs-only lifecycle-reconciliation
  commit `cad86023874abbe358a959943f87ccb5ab27b268` sits on the audit branch
  (`codex/3.9-version-close-audit`) with the intentional one-PR remote lag; it
  touches only SCRATCHPAD, the roadmap, and one session plan. `src`/`convex` at
  `ef2e7df` are byte-identical to the branch tip, so code measurement runs against
  the working tree while **lifecycle truth is read from the reconciled tip**
  (`3.9.4.1 = SHIPPED`, all session plans `Complete`); at `ef2e7df` alone the row
  read `PLANNED` and that plan `Pending`, the expected pre-reconciliation state,
  not a finding.
- **The audited ref advances across cycles (v3.8 §5 rule).** A factual correction
  touching tracked **files** (docs included) ships through the normal PR/merge
  gate, advances the audited ref, and triggers a full re-measurement. The three
  docs-truth Floss (§4) remediate through a sub-version PR; **cycle 2 audits the
  resulting canonical `main`** (advanced past `ef2e7df`, per lifecycle §6.7), and
  the final baseline's `Code ref` equals that clean-cycle audited ref — just as
  v3.8 recorded `291ee78` (cycle 2), not `5e7222a` (cycle 1). The baseline-overwrite
  and audit-plan evidence commits are ordinary audit outputs, not findings.
- **Version-start ref (whole-version lens):** `291ee78bb1f0231f06a021b910f1181ad8c39bff`
  (v3.8 cycle-2 close). Use it for whole-version shape (`git archive`) and the
  pinned `FALLOW_AUDIT_BASE` run. This version lens (accumulated pressure since the
  previous baseline) is intentionally distinct from session planning's rolling
  three-month proximity window.
- **Previous baseline (delta column + churn):** `2026-07-18 / 3.9.3.2 /
  38d1a6d7ca5e00f706f0be821926fac814486bc8` — the current
  `docs/CODE_HEALTH_BASELINE.md`, a targeted pass whose Step-1 rows carry from
  earlier v3.9 full measurements. It is **not an ancestor** of `ef2e7df` (a
  squash-merged pre-merge WIP commit), so its churn frame is date-based
  (`--since=2026-07-18`), never a `38d1a6d..ef2e7df` range.
- Treat the operator deferrals (3.9.3.6, 3.9.3.7, 3.9.4.2–4.5 → unversioned
  backlog) and the 3.9.4.1 DB-privilege cutover deferral as intentional terminal
  decisions, not gaps.

## Step 0 — Transition validation & pre-overwrite capture

- Confirm the resolver names `version-audit`, the procedure digest matches the
  current `docs/VERSION_AUDIT.md`, and `HEAD`/`origin` identity is the expected
  one-PR-lag branch state.
- **Record the outgoing baseline in full before overwrite (Step 0.6):** its date,
  code ref, every Step-1 metric value, the largest-file and churn tables, the
  hotspot rows, all rails/overrides/suppressions/duplication entries, the Watch
  triggers, and the (empty) campaign queue — so the new baseline's delta column and
  health-trend line compute against a captured prior, not a remembered one.

## 2. Artifact reconciliation

- Reconcile every v3.9 roadmap row against git, the `content/changelog/v3.9.md`
  headings (24 ↔ 24 confirmed), SCRATCHPAD shipped evidence, the contract
  `INDEX.md` + contracts, the 28 approved session plans under
  `docs/session-plans/3.9/`, `docs/PRIMITIVE_LEDGER.md`, the new `docs/security/`
  register + runbook, and `docs/backlog.md`.
- **New tracked v3.9 artifacts the reconciliation and archive must account for:**
  `docs/PRIMITIVE_LEDGER.md` (living state — the primitives audit owns it; the
  close audit only confirms it is present with PL rows dispositioned and never
  touches the AF ledger or baseline schema from it),
  `docs/security/disposition-register.md`, `docs/security/db-privilege-runbook.md`,
  `drizzle/0049_lgi_runtime_role.sql` (+ snapshot), and `src/db/migrate-url.ts`
  (+ test).
- Validate the master plan's **version-close checklist** against actual shipped,
  completed, and deferred decisions. Obsolete checklist text never overrides
  terminal roadmap truth.
- **Contract-index vs roadmap asymmetry (resolution: confirm lifecycle-legal).**
  `INDEX.md` maps six deferred/retired sessions (3.9.3.6, 3.9.3.7, 3.9.4.2–4.5) the
  roadmap moved to the unversioned backlog. This is compliant, and the audit
  records the reading rather than editing anything: lifecycle §3 requires deferred
  *intent* to move to the backlog before a contract is retired — the intent **is**
  in `docs/backlog.md`, and the contracts are deliberately **preserved (not
  retired)** as the future-reprioritization source; 3.9.1.6's derive-from-`INDEX`
  drift gate is satisfied because all 34 mapped contracts have files. At archive the
  six contracts travel with the v3.9 bundle (they are inside `session-contracts/`),
  and once the active version has no `INDEX.md` the derive-from-`INDEX` gate yields
  an empty expected set — so it stays green with no manual list to empty. No edit to
  the active INDEX is required or made.

## 3. Measurement design (Step 1)

Run and record **every** `docs/VERSION_AUDIT.md` Step-1 metric with a reproducible
command. Current grounded values are shown so drift is visible; execution
re-measures at the audited ref.

- Production TS/TSX files **762**, test files **363**, production LOC **73,064** —
  the exact Step-1 `find … | wc -l` / `find … -print0 | xargs -0 wc -l` commands.
  Version-start shape via `git archive 291ee78 | tar -x -C <tmp>`, measured under
  identical rules (no historical coverage under the current toolchain).
- Largest production files — `find … -print0 | xargs -0 wc -l | sort -rn | head -17`
  (`head` count **17** so the `… total` aggregate line does not displace the 16th
  file; current top slice `PricingProvider.tsx` 906 → … → `CockpitBuildPlan.tsx`
  443 → `CockpitKpis.tsx` ~428), each row classified.
- Four coverage percentages from a fresh full-Postgres `pnpm test:coverage`.
- Fallow health score + above-threshold function count (`pnpm fallow:health`;
  expected nonzero exit — record the report, not a gate failure).
- Threshold overrides **0**, source suppressions **21** (5 generated Convex / 7
  test-only / 9 production, unchanged since `291ee78`), whole-version + accepted
  clone groups **0 / 0**.

**Every known-wide surface the current baseline names — reproducible commands,
including numeric-zero rows for deleted surfaces (Step 5 requires zero, never
omission; commands must yield `0` for an absent file, not error):**

| Surface | Reproducible command / definition | Current |
| --- | --- | ---: |
| Auth query-hub exports | `test -f src/features/auth/queries.ts && grep -c '^export' src/features/auth/queries.ts \|\| echo 0`; confirm the only residual `features/auth/queries` string is the devlog test fixture | 0 |
| `PricingContextValue` fields | `grep -rn 'interface PricingContextValue' src \| wc -l` (expect 0 definitions) | 0 |
| `usePricing()` call sites | `grep -rn 'usePricing' src \| wc -l` (expect 0) | 0 |
| telemetry exports (AF-006) | `grep -c '^export' src/data/telemetry/queries.ts`; fan-in `grep -rl 'data/telemetry/queries' src convex \| wc -l` | 25 (fan-in ~55) |
| esi-refresh-jobs exports (AF-007) | `grep -c '^export' src/data/esi-refresh-jobs/queries.ts` | 13 |
| `auth-surface` files (AF-008) | `pnpm exec fallow list --boundaries` zone member count | 3 |
| planner concern-context fields | count `;`-terminated members per interface in `planner-contexts.tsx`; fan-out `grep -rl planner-contexts src \| wc -l` | 4/10/18/6/13 (fan-out ~32) |
| concern-hook consumers | `grep -rn 'useMarketData\|usePlannerConfig\|useBuildSetup\|useBuildCharacter\|useBuildPlan\|useTemplatePlanner' src` — call + file count | 22 / 11 |

New v3.9 wide surfaces to add to the baseline's tracked set (name + why wide;
**metric defined, not pre-counted** — classification is an execution judgment): ESI
dataset registry (`src/lib/esi-datasets/` entries + verdict leaf; entry count), the
freshness leaf (exported functions + importers), the `defineCronRoute` shell + 7
declarations, `db-test-harness.ts` (consumer count), the dataset-declaration
census, api-contract completeness, and `type-images.ts` (report **total exports vs
function exports vs importers** as distinct measures — grounding saw 6 functions /
2 types = 8 exports and ~16 importers; pick and label one definition consistently).

- **Churn — both frames** (Step 1 requires the previous-baseline frame; the 3.8
  template ran both): `git log --since=2026-07-18 --name-only --pretty=format:
  -- src convex | sort | uniq -c | sort -rn | head -25` (previous-baseline lens),
  **and** the whole-version `git log 291ee78..ef2e7df …` range; snapshot diffs where
  a file's churn needs before/after shape.
- Run `check_baseline_claims.py --check` and `check_watch_triggers.py --check`
  (recompute cheap Step-1 claims; evaluate AF-006/007/008 — currently all clean,
  all triggers below).

## 4. Review and classification (Steps 2–3)

- **Re-rank hotspots** by interface breadth, change axes, churn, amplification, and
  cohesion defense — not file length. Reassess the carried Watch surfaces and the
  largest planner files. Reaffirm protected non-goals (`tree-resolver.ts`,
  `convex/engine.ts`, `src/lib/esi/`, `api-client.ts`, `env.ts`). Every hotspot row
  states a direction of fix.
- **Drift no PR gate sees (Step 3).** Grounding shows `git diff 291ee78..HEAD` on
  `.fallowrc.json` and `fallow-baselines/dupes.json` is empty and suppressions
  byte-identical. The audit re-verifies at the audited ref and classifies any clone
  group the pinned whole-version Fallow reports.
- **Rails review.** Confirm the v3.9-added rails still bite — cron route import
  rail, ESI dataset registry gate + `*_TTL_MS` naming lint + staleness
  restricted-import, endpoint contract gate + inline-endpoint lint, UI wrapper
  import rail (Base UI + sonner), EVE image variant-literal rail, the three comment
  lint rules, the dataset-declaration census — plus the standing ESI-dispatch and
  `EveImage` single-owner rails. Review the one pinned registry waiver
  (`market_history` waiving `global-cron-names-route` with rationale) as a loan.
- **Docs truth (Step 3 → findings, classified, remediated — not corrected in
  place).** The sweep confirms three docs-truth defects; each is a Step-3 finding
  that execution classifies (expected: **Floss**) and, being version-close and
  actionable, routes through the standard remediation branch (§6) — not an in-audit
  edit. §3.9.3.4 is folded here per the operator decision (handled by the audit,
  not a separate plan-version pass):
  1. Master-plan **§3.9.3.4** still states the *superseded* eager-render root cause
     ("assembles the entire catalogue and eagerly server-renders every site's full
     detail body…"); the shipped diagnosis is bloated `.next` watcher spin + memory
     starvation, with lazy rendering already shipped. Remediation reconciles the
     archived master plan to truth.
  2. **README** commands table lists `pnpm build | Production build` while
     `AGENTS.md` forbids local/pre-merge production builds; remediation reconciles
     the public command doc (clarify CI/Vercel-only or remove the row).
  3. **Constitution P7 citations** — `docs/DESIGN_PRINCIPLES.md` P7 cites
     `src/features/auth/queries.ts` and `PricingContextValue`, both deleted in the
     v3.8 AF-004/AF-005 remediations; remediation replaces them with live exemplars.
     Citation-only replacement does not change the principle, so the "amend the
     constitution only for a durable rule/number" bar is not crossed.
  The audit also reconfirms the 3.9.3.8 public-document truth held and the new
  security posture (register, DB-privilege runbook, inert least-privilege role).
- **Lifecycle truth.** Contracts, approved plans, close-out evidence, and roadmap
  terminal statuses agree; confirm the INDEX/roadmap asymmetry legal per §2; clear
  only genuinely-resolved SCRATCHPAD carry-forwards (the completed operator
  walkthrough log). **Do not auto-clear the 3.9.3.1 admin-reassign item:** it is a
  real security-adjacent wrong-account relinking correctness issue still awaiting
  the operator's amendment-vs-continued-backlog decision — surface it for that
  decision and, if execution treats it as an audit finding, classify it through the
  AF ledger normally. Leave open operator chores (`DISCORD_ALERT_WEBHOOK_URL`,
  Speed Insights) as chores.
- **Classify** every finding as Floss, Campaign, or Watch (Step 4); Watch only with
  a countable trigger. Do not implement any structural campaign during the audit.

## 5. Outputs

- Replace `docs/CODE_HEALTH_BASELINE.md` in full using the fixed
  `docs/VERSION_AUDIT.md` Step-5 schema and heading order: Snapshot (app version =
  audited version, scope `Full audit`, Code ref = the cycle's audited ref, previous
  comparison `2026-07-18 / 3.9.3.2 / 38d1a6d7…`, one-line health trend), Step-1
  metric table with whole-version and previous deltas and numeric-zero rows,
  largest files, churn signals, hotspots, Watch triggers (one fenced
  `watch-trigger` block per Watch finding, grammar per Step 4), rails/exceptions,
  and the campaign queue. Include all required metric rows verbatim.
- Reconcile backlog Floss entries and the campaign queue in the same run.
- **No product API, schema, route, or UI change is planned.** The audit's outputs
  are the baseline overwrite and, via remediation, the three docs-truth corrections.

## 6. Verification and archive

Run, in order, after each cycle's final measurement state:

```bash
pnpm verify
pnpm test:coverage
pnpm fallow:health
FALLOW_AUDIT_BASE=291ee78bb1f0231f06a021b910f1181ad8c39bff pnpm fallow
pnpm assert:routes-present
pnpm exec tsc --noEmit --incremental false
pnpm exec fallow list --boundaries
python3 .agent-local/check_baseline_claims.py --check
python3 .agent-local/check_watch_triggers.py --check
python3 .agent-local/check_agent_drift.py
```

`pnpm fallow:health` may exit nonzero for existing health findings — record the
report, not a gate failure. Reopen and rerun any measurement invalidated by a
correction. Remove generated `coverage/` after final evidence. Never run a local
production build. (The heavier route render-mode assertion stays Vercel-only, by
design.)

**Findings-conditional branch (Step 6):**

- *Cycle 1 — any confirmed actionable Floss/Campaign* (expected: the three
  docs-truth Floss) → set `Audit status: Remediation required`, keep each `AF-NNN`
  Open, update SCRATCHPAD to audit-remediation planning, rerun the resolver, and
  stop for `plan-audit-remediation`. It maps the corrections to a small remediation
  sub-version (a single docs-truth sub-version suffices); normal `plan-session` /
  `close-out` deliver it; each finding is marked Delivered only on terminal merge
  evidence. Do **not** archive.
- *Restart — cycle 2* → when the remediation rows are terminal, the resolver
  directs `version-audit` to restart the complete audit against current canonical
  `main` (advanced past `ef2e7df`). Advance `Audit cycle`, set `Audited ref` to that
  `main`, rerun every measurement and gate.
- *Clean close* → the full lifecycle §6/§7 gate, stated in substance: **every
  actionable finding is Verified, the current cycle produced no new actionable
  finding, every audit gate above is green, and the refreshed baseline `Code ref`
  equals the cycle's `Audited ref`.** Then validate the version-close checklist
  against terminal decisions, set `**Audit status:** Complete`, and archive one
  bundle to `../LGI Tools Document Archive/versions/3.9/`:
  - `verify_archive.py --check --phase pre` **before** any copy or removal
    (preconditions 1–4);
  - copy `VERSION_3_9_PLAN.md`, `session-contracts/`, `session-plans/`,
    `version-audits/` into the bundle;
  - `verify_archive.py --check --phase post` **after the copy but before removing
    the active sources** (byte-identical destination check);
  - only then remove the active sources. Keep `docs/CODE_HEALTH_BASELINE.md` active
    (never archived). Update SCRATCHPAD to `awaiting master plan`; rerun the
    resolver (expect `master-plan-needed`) and `check_agent_drift.py`.

## Cycle 1 execution evidence

- Transition identity held: the procedure digest matched, canonical `main` was
  `ef2e7dfc79548c0ca47ddbe81200b04cbd7204ae`, the audit branch carried only the
  expected lifecycle-reconciliation commit, and `src`/`convex` were
  byte-identical to the audited ref.
- Artifact truth held across 34 indexed contracts and 28 approved, completed
  session plans. The six roadmap-deferred contracts remain deliberately
  preserved beside their backlog dispositions. The sole plan/live-contract
  digest difference is 3.9.2.5: after completion, commit `cbefaac` corrected a
  stale scripts-subdirectory reference to the `docs/ux-check/` root in the
  contract. The historical approved plan still identifies the contract it
  executed; scope, acceptance, and delivered behavior did not change, so this
  is evidence rather than a finding.
- Whole-version shape moved from 749 production files / 66,348 LOC / 352 test
  files to 762 / 73,064 / 363. Fresh full-Postgres coverage passed all 3,537
  tests at 85.56% statements, 83.19% branches, 81.74% functions, and 86.49%
  lines. Fallow health remained 78 (B); its fresh report corrected the carried
  zero to six above-threshold functions. All six are inherited, cohesive
  low-breadth routines whose complexity, churn, and amplification do not
  coincide, so P10 records them as attention signals rather than findings.
- Structural measurements held: 35 zones / 35 rules, zero threshold overrides, the
  same 21 suppressions (5 generated / 7 test / 9 production), zero
  whole-version clone groups, and an empty accepted-duplication baseline. The
  v3.9 registry, freshness, cron, database-harness, dataset-census,
  API-contract, UI-wrapper, image-intent, and comment rails are live and green.
  The `market_history` waiver remains a specific, rationale-bearing exception
  for response-owned expiry.
- AF-006 stayed at 25 exports, AF-007 at 13 exports, and AF-008 at three files;
  none of the carried Watch triggers fired. New wide v3.9 surfaces are cohesive
  and mechanically owned: 13 ESI dataset declarations, a three-function
  freshness leaf with 15 production importers, seven cron declarations, 14
  real-Postgres harness consumers, a 56-table declaration census, 52 API routes
  against 17 contract modules, and the eight-export type-image resolver with
  16 production importers.
- The public-document and constitution sweep confirmed AF-010–AF-012 below.
  README, CONTRIBUTING, SECURITY, the PR/issue templates, `.env.example`, and
  `/legal` otherwise remain true against the live app. The completed
  operator-walkthrough log was removed from live SCRATCHPAD state.
- The ordered final gates reached a hard stop at the version-start-pinned
  Fallow audit. `pnpm verify` passed 3,536 tests plus one skip; fresh
  full-Postgres coverage passed all 3,537 tests at the percentages above;
  `fallow:health` produced its expected nonzero six-function report. The pinned
  audit then failed. Its JSON correctly classifies two duplicate-export pairs as
  inherited, but reports five introduced complexity findings while all six
  finding rows carry `introduced: true`; a TypeScript transpile with comments
  removed proved byte-identical executable output for all four affected files
  against the version-start ref. AF-013 records that blocking attribution
  defect. Per the approved stop-on-failed-gate rule, route presence, strict
  nonincremental TypeScript, boundary listing, baseline/watch rechecks, and the
  final drift gate were not run after the failure (their preliminary
  measurement-phase counterparts were green where applicable).
- The inherited duplicate-export evidence still exposed two bounded design
  defects independently of the gate verdict. AF-014 records the duplicated,
  disagreeing EVE image-size policy. AF-015 records two distinct saved-plan
  contracts exported under the same name. Neither is waived or corrected
  inside the audit.
- The admin-reassign stale-email issue remains an explicit security-adjacent
  backlog item with its ACCOUNT-hygiene trigger; this audit found no new trigger
  or evidence that reverses the recorded deferral, so it is not duplicated as a
  new AF row. It is surfaced to the operator again at this cycle boundary.

## Audit cycle history

| Cycle | Audited ref | Result | Baseline ref |
| ---: | --- | --- | --- |
| 1 | `ef2e7dfc79548c0ca47ddbe81200b04cbd7204ae` | Remediation required — AF-010–AF-015 Open | `ef2e7dfc79548c0ca47ddbe81200b04cbd7204ae` |

(A cycle-2 row is added if cycle 1 records actionable findings and remediation
advances `main`, per §6.)

## Audit findings

Seeded with the live Watch findings the baseline carries (they survive version
archival; their countable triggers live in the baseline, cited by AF id only).
AF-001–AF-005 closed Verified with v3.8; AF-009 closed in 3.9.2.2. New v3.9
findings receive the next monotonic id from **AF-010** (the confirmed docs-truth
Floss are assigned by execution). Rows use numeric `First seen` (the v3.9 cycle in
which the row enters this ledger = `1`) and an exact `Status` token; carried and
measured context lives in prose, not schema cells.

| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-006 | 1 | Watch | Telemetry query module (carried from v3.8) broad enough to monitor for another change axis. | Promote on a 26th export or renewed multi-session growth. | — | Watch |
| AF-007 | 1 | Watch | Refresh-job query module (carried from v3.8) large but cohesive around one queue lifecycle. | Promote above 15 exports or on a second persistence concern. | — | Watch |
| AF-008 | 1 | Watch | `auth-surface` (carried from v3.8) is a deliberate exact three-file platform-contract exception. | Promote if any work proposes a fourth file; prefer a real platform module. | — | Watch |
| AF-010 | 1 | Floss | The archived master-plan narrative for 3.9.3.4 attributes the dev stall to eager full-detail rendering, after profiling proved watcher-spin/memory starvation and lazy rendering had already shipped. | Reconcile §3.9.3.4 to the measured root cause, shipped lazy-render state, and delivered sample-mode outcome without changing terminal scope. | 3.9.5.1 | Planned |
| AF-011 | 1 | Floss | README presents `pnpm build` as a useful local command while repository policy forbids local and pre-merge production builds. | Remove the local-build invitation or state that production builds are Vercel-only, leaving `pnpm verify` as the local definition of done. | 3.9.5.1 | Planned |
| AF-012 | 1 | Floss | Constitution P7 cites deleted `src/features/auth/queries.ts` and `PricingContextValue` surfaces as comment exemplars. | Replace only the stale citations with live rationale-dense and interface-comment exemplars; preserve the principle text. | 3.9.5.1 | Planned |
| AF-013 | 1 | Floss | *(Corrected during remediation planning — see the note below.)* Four modules (`skill-queue/queries.ts`, `eve-data/ingest.ts`, `eve-data/station-names.ts`, `db/skills-sync.ts`) contain moderate-complexity functions with zero test coverage; the 3.9.1.7 comment migration pulled them into the whole-version CRAP lens, where coverage-driven CRAP exceeds the cap and reads as introduced because the base ref carries no coverage to attribute against. | Add meaningful behavioral coverage for the flagged functions so their CRAP falls below threshold and the version-start-pinned audit passes honestly, with no waiver, baseline, suppression, or coverage padding. | 3.9.5.2 | Planned |
| AF-014 | 1 | Floss | EVE image size support is declared twice: the shared wrapper owns 32–1024 while the lower-layer URL builders separately own 32–512. | Establish one lower-layer size vocabulary consumed by both surfaces, with existing URL and snapping behavior characterized and unchanged. | 3.9.5.1 | Planned |
| AF-015 | 1 | Floss | The saved-plan render verdict and client controller are distinct concepts exported under the same `SavedPlansState` name. | Give both contracts distinct intent-revealing names (or make a file-local type private) without changing view or mutation behavior. | 3.9.5.1 | Planned |

At the audited ref: telemetry 25 exports (< 26), refresh-jobs 13 (≤ 15),
`auth-surface` 3 files (< 4) — all below trigger. Execution re-checks each and
appends AF-010+ for newly confirmed findings (the three docs-truth Floss).

### AF-013 re-diagnosis (2026-07-19, remediation planning)

Cycle-1 recorded AF-013 as a Fallow comment-attribution defect. During
remediation planning the pinned audit was reproduced (`fallow audit --format
json`, base `291ee78`) and the diagnosis was corrected with evidence:

- All six flagged findings are **CRAP** (coverage×complexity), not raw
  complexity: `max_cyclomatic` is 8 (threshold 20) and max cognitive is 8
  (threshold 15); every finding reports `exceeded: "crap"` with `coverage_pct:
  0.0`, and each score equals `comp² + comp` at zero coverage (8→72, 6→42,
  5→30).
- The four host modules (`src/features/skill-queue/queries.ts`,
  `src/data/eve-data/ingest.ts`, `src/data/eve-data/station-names.ts`,
  `src/db/skills-sync.ts`) show whole-file 0% coverage while the DB-suite-covered
  `auth/` and `gsc/` trees show real coverage in the same snapshot — so the 0% is
  genuine, not a collection artifact; these modules have no test.
- The 3.9.1.7 comment-only migration pulled these files into the 983-file
  whole-version changeset (verified: every changed line since `291ee78` is a
  comment). CRAP reads as `introduced` only because the base ref carries no
  coverage to compute a matching base finding.

So AF-013 is a genuine coverage gap, reclassified **Campaign → Floss**. The
operator-approved remediation (3.9.5.2) adds real behavioral coverage rather than
suppressing the attribution; once the flagged functions are covered, CRAP clears
and the pinned gate passes with no Fallow change, upgrade, or custom tooling. The
cycle-1 execution-evidence bullet about a "blocking attribution defect" reflects
the original cycle-1 read and is superseded by this note.
