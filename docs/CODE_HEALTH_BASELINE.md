# Code Health Baseline (LGI.tools)

> **Living state, not a log.** Every version audit replaces this file in place
> using the fixed schema in `docs/VERSION_AUDIT.md`. Never append history. The
> constitution is `docs/DESIGN_PRINCIPLES.md`; this file records current evidence
> and decisions only.

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-07-20 |
| App version | 3.9.5.2 |
| Code ref | `f35cdb35f73513600991ce1162001369046cb11a` on `main` (the cycle-2 audited ref; measurements from the byte-identical HEAD working tree `d50677d`, whose only delta from `main` is the docs-only lifecycle-reconciliation commit) |
| Measurement scope | Full audit |
| Previous comparison | 2026-07-20 / 3.9.5.2 / `f35cdb35f73513600991ce1162001369046cb11a` (targeted AF-013 coverage pass) |
| Health trend | v3.9's first complete full audit: every row re-measured at the audited `main` is flat against the byte-identical 3.9.5.2 targeted pass, all six actionable findings (AF-010–AF-015) verify from fresh proof, and the version-start-pinned Fallow audit passes cleanly — the version closes with no structural drift since `291ee78`. |

## Step 1 metrics

| Metric | Current | Previous | Delta / note |
| --- | ---: | ---: | --- |
| Production TS/TSX files | 762 | 762 | Flat versus the previous baseline; whole-version shape grew from 749 at `291ee78` (+13) |
| Production TS/TSX LOC | 73,072 | 73,072 | Flat; whole-version +6,724 from 66,348 at `291ee78` |
| Test files | 368 | 368 | Flat; whole-version +16 from 352 at `291ee78` |
| Coverage — statements | 86.90% | 86.90% | Flat; 8,707 / 10,019 from fresh full-Postgres coverage; 3,553 tests passed plus one unrelated skip |
| Coverage — branches | 84.25% | 84.25% | Flat; 5,189 / 6,159 |
| Coverage — functions | 82.84% | 82.84% | Flat; 2,187 / 2,640 |
| Coverage — lines | 87.90% | 87.90% | Flat; 7,679 / 8,736 |
| Fallow health score | 78 (B) | 78 (B) | Flat; deductions hotspots −10.0 / unit size −10.0 / coupling −2.4; maintainability 91.7 (good) |
| Functions above health thresholds | 0 | 0 | Flat; fresh coverage keeps the six former coverage-driven CRAP functions clear |
| Auth query-hub exports | 0 | 0 | Deleted surface remains absent; the only residual `features/auth/queries` string is the devlog test fixture |
| `PricingContextValue` fields | 0 | 0 | Deleted interface remains absent |
| `usePricing()` call sites | 0 | 0 | Deleted hook remains absent |
| Planner concern-context fields | 4 / 10 / 18 / 6 / 13 | 4 / 10 / 18 / 6 / 13 | Market / config / setup / character / plan; unchanged (direct member count) |
| Concern-hook consumers | 22 calls / 11 files | 22 calls / 11 files | Invocation sites excluding tests and the definition file; unchanged |
| Telemetry query breadth | 25 exports / 50 fan-in files | 25 / 51 | Export contract flat and below AF-006; the reproducible `grep -rl` substring fan-in is now 50 (27 strict import statements) |
| ESI refresh-job query exports | 13 | 13 | Flat and below AF-007 |
| `auth-surface` files | 3 | 3 | Flat and below AF-008 |
| ESI dataset registry entries | 13 | 13 | One complete placement/freshness/refresh declaration per dataset |
| Freshness leaf breadth | 3 functions / 15 production importers | 3 / 15 | 19 importers including tests |
| Cron shell declarations | 7 | 7 | Every scheduled route declares through `defineCronRoute` (defined in `src/db/cron-gate.ts`) |
| Real-Postgres harness consumers | 17 | 17 | The shared harness remains the only lifecycle owner |
| Dataset declaration census | 56 tables / 4 index tests | 56 / 4 | The rail joining identity, purge, growth, and ESI declarations |
| API contract completeness | 52 routes / 17 contract modules | 52 / 17 | Live gate green |
| EVE type-image resolver breadth | 8 exports / 6 functions / 16 production importers | 8 / 6 / 16 | 22 importers including tests |
| Threshold overrides | 0 | 0 | `.fallowrc.json` remains empty; no version diff |
| Source suppressions | 21 | 21 | Flat: 5 generated / 7 test-only / 9 production |
| Whole-version Fallow clone groups | 0 | 0 | No clone groups in the version-start-pinned run |
| Accepted duplication baseline clone groups | 0 | 0 | `fallow-baselines/dupes.json` remains empty |
| Version-start-pinned Fallow verdict | Pass | Pass | 993 changed files vs `291ee78`, zero introduced findings |

The version-start shape was extracted from
`291ee78bb1f0231f06a021b910f1181ad8c39bff` and measured under the same
file/LOC rules. Historical coverage was intentionally not rerun under the
current dependency and toolchain state.

### Largest production files

| Rank | File | LOC | Classification |
| ---: | --- | ---: | --- |
| 1 | `src/features/industry-planner/components/PricingProvider.tsx` | 906 | AF-005 Verified; broad but partitioned behind five stable concern contracts |
| 2 | `src/data/eve-data/tree-resolver.ts` | 682 | Protected cohesive non-goal |
| 3 | `src/features/custom-structures/components/CustomStructureBuilder.tsx` | 637 | Cohesive builder surface; monitor, no coincident churn/breadth evidence |
| 4 | `src/data/telemetry/queries.ts` | 545 | Watch (AF-006); 25-export contract remained flat |
| 5 | `convex/engine.ts` | 528 | Protected cohesive non-goal |
| 6 | `src/features/industry-planner/build-batch.ts` | 522 | Cohesive accounting engine |
| 7 | `src/features/industry-planner/components/MeAdjuster.tsx` | 519 | Cohesive planner control; monitor |
| 8 | `src/data/eve-data/universe.ts` | 518 | Cohesive data translation |
| 9 | `src/data/eve-data/queries.ts` | 507 | Broad query owner but low version churn; monitor |
| 10 | `src/features/industry-planner/api-contract.ts` | 483 | One feature-owned contract vocabulary, protected by the API-contract gate |
| 11 | `src/features/wormhole-sites/queries.ts` | 479 | Covered cohesive query module; AF-003 remains Verified |
| 12 | `src/app/admin/TrafficSection.tsx` | 471 | App-layer composition over independent panels |
| 13 | `src/features/devlog/parse.ts` | 468 | Cohesive document parser |
| 14 | `src/lib/esi/dispatch.ts` | 447 | Protected sole ESI dispatch gate |
| 15 | `src/features/industry-planner/components/CockpitBuildPlan.tsx` | 443 | App-facing planner composition; monitor |
| 16 | `src/features/industry-planner/components/CockpitKpis.tsx` | 428 | Derived planner readout; monitor |

### Current churn signals

`Recent commits` is shown as whole v3.9 (`291ee78..f35cdb3`). The audited `main`
is byte-identical to the 3.9.5.2 targeted baseline, so there is no code churn
since the previous baseline; version-bump ceremony is retained in the table so it
is not mistaken for product pressure.

| File | Recent commits | Current evidence | Verdict |
| --- | ---: | --- | --- |
| `src/config/app-version.ts` | 26 | One required release bump per notable sub-version | Ceremony, not a hotspot |
| `src/lib/env.ts` | 3 | One validated registry absorbed the dev-sample flag and migration credential | Healthy centralization |
| Cron route modules (seven) | 3 each | Mechanical migration onto `defineCronRoute` declarations; route bodies are thin and railed | AF-009 remains Closed |
| `src/features/industry-planner/industry-styles.ts` | 3 | Freshness comparison moved to the shared exact-boundary leaf | Healthy primitive adoption |
| `src/components/type-icon.tsx` | 3 | Consumes the centralized `EVE_IMAGE_SIZES` vocabulary (AF-014) | Cohesive primitive adoption |
| `src/lib/eve-image.ts` | 2 | Single owner of the 32–1024 size ladder, families, and snapping (AF-014) | Cohesive, complete |
| ESI/freshness lib surfaces | 2 each | Dataset registry, freshness leaf, and dispatch scoreboard evolved together | Cohesive registry adoption |
| AF-013 coverage suites (four) | 1 each | New co-located behavioral tests for the previously untested skill-save, SDE-ingest, station-name, and queued-skill paths | Coverage gap closed |

## Current hotspots

| Hotspot | Evidence | Direction of the fix | Live status |
| --- | --- | --- | --- |
| `PricingProvider.tsx` | 906 LOC; five concern contracts (4/10/18/6/13 fields) serve 22 hook calls across 11 components; no general pricing façade returned | Preserve the concern taxonomy; add fields only to their owning concern and never recreate `PricingContextValue` or `usePricing` | AF-005 Verified; monitored, not actionable |
| Auth query ownership | Seven focused owner/private modules remain, while `auth-surface` stays exactly three cross-slice contract files | Preserve direct owner imports and the acyclic transfer/admin/purge composition; promote to a real platform module before adding a fourth surface file | AF-004 Verified; Watch (AF-008) |
| `src/data/telemetry/queries.ts` | 545 LOC, 25 exports, 50 fan-in files, and no post-baseline churn | Split only when another independent stored-event persistence/read axis appears; do not divide one event vocabulary by helper type | AF-006 Watch; countable trigger below |
| `src/data/esi-refresh-jobs/queries.ts` | 13 exports around one durable queue lifecycle | Preserve lifecycle cohesion and keep Redis pending-signal ownership separate; extract only on a second persistence concern | Watch (AF-007); countable trigger below |
| ESI dataset registry and freshness leaf | 13 declarations; the 3-function leaf has 15 production importers; one rationale-bearing `market_history` waiver owns the dynamic expiry exception | Keep declarations complete and the verdict leaf narrow; new trigger, retry, and persistence policies stay with their owning layers | Enforced wide primitive; no finding |
| Cron declaration shell | Seven route declarations centralize auth, wake, lock, and recording policy; both sub-daily idle paths are covered | Keep `defineCronRoute` the sole route-policy owner and preserve schedule/import rails | AF-009 Closed; no renewed clone pressure |
| Real-Postgres harness and dataset census | One harness serves all 17 DB suites; the 56-table census joins four declaration concerns through tests without merging their vocabularies | Keep test lifecycle and declaration completeness centralized while registry semantics remain with their owners | Enforced test infrastructure; no finding |
| API contract surface | 52 routes are checked against 17 owning contract modules, markers, and endpoint-object use | Add schemas and endpoint objects in the owning slice; keep composition and validation in route handlers | Enforced wide surface; no finding |
| EVE type-image intent resolver | Eight exports (six functions) serve 16 production importers; rendition literals outside the owner are lint-blocked | Grow the intent vocabulary only for a real new rendition decision; keep raw variants private | Enforced wide primitive; no finding |
| EVE image size policy | `src/lib/eve-image.ts` is the sole owner of the 32–1024 `EVE_IMAGE_SIZES` ladder, family support, snapping, and portrait/logo URL types; the `next/image` adapter consumes it, with defaults and every rendition characterized byte-for-byte | Keep server-capability facts in lib and rendering in the component; add a size or family only at the lib owner with behavior evidence | AF-014 Verified in cycle 2 |
| Saved-plan state contracts | The view-only verdict is file-local `SavedPlansViewState`; the unchanged client controller remains the sole exported `SavedPlansState` | Keep the render verdict private and the controller contract with its hook; do not recreate a shared name for distinct concepts | AF-015 Verified in cycle 2 |

### Watch triggers

```watch-trigger
AF-006: exports(src/data/telemetry/queries.ts) >= 26
```

```watch-trigger
AF-007: exports(src/data/esi-refresh-jobs/queries.ts) > 15
```

```watch-trigger
AF-008: files(zone:auth-surface) >= 4
```

Protected deep modules remain non-goals: `tree-resolver.ts`, `convex/engine.ts`,
`src/lib/esi/`, `src/lib/api-client.ts`, and `src/lib/env.ts`. The six formerly
above-threshold functions remain cohesive and byte-unchanged; real behavioral
coverage keeps their coverage-driven CRAP clear without fragmenting their
interfaces or creating metric-shaped production code.

## Rails and exceptions

- **Boundaries:** Fallow reports 35 zones and 35 rules; `auth-surface` remains
  exactly three files. `.fallowrc.json` has no whole-version diff and no
  composition exception widened.
- **v3.9 rails:** cron restricted imports and schedule declarations; ESI dataset
  registration, dataset-TTL naming, and feature-staleness imports; endpoint
  contract and inline-endpoint checks; Base UI/sonner ownership; EVE image
  variant ownership; exported-surface comment rules; and the dataset declaration
  census all pass their durable seeded-red/live-green suites, confirmed by the
  green version-start-pinned audit.
- **Pinned Fallow attribution:** the required version-start audit is green after
  fresh full-Postgres coverage. All six AF-013 functions execute through real
  seams, and the audit reports zero introduced findings across 993 changed files
  without a waiver, baseline, suppression, or attribution workaround.
- **Standing rails:** the ESI dispatch gate, `EveImage` ownership, route
  classification, same-origin coverage, purge/growth registries, and environment
  registry remain connected.
- **Registry waiver:** `market_history` keeps its single
  `global-cron-names-route` waiver because the ESI response supplies a dynamic
  `Expires` boundary and on-view refresh has no cron owner. The rationale remains
  specific and current; reviewed as a loan and retained.
- **Lifecycle/public truth:** all 36 indexed contracts exist (34 shipped/deferred
  plus the two remediation contracts); 30 session plans cover every planned
  session and the six deferred contracts remain deliberately preserved beside
  their backlog dispositions. AF-010–AF-015 are Verified. Public documents
  (README, CONTRIBUTING, SECURITY, `.github/` templates, `.env.example`, `/legal`)
  are true against the live app.

### Standing Fallow threshold overrides

None. `thresholdOverrides` is empty.

### Suppressions

- Current count: **21**, unchanged from the version start and previous baseline.
- Five are generated Convex headers; seven are test-only type or mocking seams.
- The nine production suppressions remain narrowly justified: one Next.js
  convention export, the documented dual-driver DB alias, three React effect
  synchronizations, the escaped server-built JSON-LD sink, Shiki's build-time
  token color, and two sub-4px primitive indicators.
- No suppression is stale, widened, or suitable for removal.

### Duplication baseline

- Gate mode: `new-only`.
- Baseline file: `fallow-baselines/dupes.json`.
- Accepted clone groups: **0**.
- The whole-version pinned audit finds **0 clone groups**. No version diff exists
  in the accepted baseline.

## Campaign queue

| Priority | Campaign | Charter summary | Status | Trigger / next action |
| ---: | --- | --- | --- | --- |
| — | — | No open campaign | — | v3.9 closes with an empty campaign queue; the carried Watch findings keep the countable triggers above |

AF-006–AF-008 remain Watch below their triggers. AF-010–AF-015 are all Verified
by this complete cycle-2 audit: AF-010 (master-plan §3.9.3.4 reconciled to the
measured watcher-spin/memory-starvation root cause), AF-011 (README states the
production build is CI/Vercel-only), AF-012 (constitution P7 cites live
`membership.ts` and `PlannerConfigValue` exemplars), AF-013 (real behavioral
coverage clears the four modules' CRAP with the pinned gate green), AF-014 (a
single lib-owned `EVE_IMAGE_SIZES` ladder), and AF-015 (distinct
`SavedPlansViewState` and `SavedPlansState` contracts).
