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
| Code ref | `f35cdb35f73513600991ce1162001369046cb11a` on `main` (post-merge target; measurements from the byte-equivalent pre-merge tree) |
| Measurement scope | Targeted: AF-013 coverage remediation for four previously untested modules |
| Previous comparison | 2026-07-19 / 3.9.5.1 / `fd64745e58a715b4484aa2e7219ef9e3f5e8f236` (targeted pass) |
| Health trend | Real behavioral coverage now exercises the six coverage-driven CRAP findings through existing seams; the version-start-pinned Fallow audit passes with no production-logic, threshold, waiver, baseline, or suppression change. |

## Step 1 metrics

| Metric | Current | Previous | Delta / note |
| --- | ---: | ---: | --- |
| Production TS/TSX files | 762 | 762 | Flat versus the previous baseline; whole-version shape grew from 749 at `291ee78` (+13) |
| Production TS/TSX LOC | 73,072 | 73,072 | Flat; the four flagged production modules remain byte-unchanged |
| Test files | 368 | 364 | +4 co-located behavioral suites for the AF-013 modules |
| Coverage — statements | 86.90% | 85.57% | +1.33 pp; 8,707 / 10,019 from fresh full-Postgres coverage; 3,553 tests passed plus one unrelated skip |
| Coverage — branches | 84.25% | 83.22% | +1.03 pp; 5,189 / 6,159 |
| Coverage — functions | 82.84% | 81.78% | +1.06 pp; 2,187 / 2,640 |
| Coverage — lines | 87.90% | 86.50% | +1.40 pp; 7,679 / 8,736 |
| Fallow health score | 78 (B) | 78 (B) | Carried from the previous full audit; the targeted pass changed no threshold or health-score policy |
| Functions above health thresholds | 0 | 6 | All six coverage-driven CRAP findings clear through real behavioral coverage |
| Auth query-hub exports | 0 | 0 | Deleted surface remains absent |
| `PricingContextValue` fields | 0 | 0 | Deleted interface remains absent |
| `usePricing()` call sites | 0 | 0 | Deleted hook remains absent |
| Planner concern-context fields | 4 / 10 / 18 / 6 / 13 | 4 / 10 / 18 / 6 / 13 | Market / config / setup / character / plan; unchanged |
| Concern-hook consumers | 22 calls / 11 files | 22 calls / 11 files | Unchanged |
| Telemetry query breadth | 25 exports / 51 direct importers | 25 / 55 | Export contract flat and below AF-006; the reproducible direct-import string census is now 51 |
| ESI refresh-job query exports | 13 | 13 | Flat and below AF-007 |
| `auth-surface` files | 3 | 3 | Flat and below AF-008 |
| ESI dataset registry entries | 13 | — | New tracked v3.9 surface; one complete placement/freshness/refresh declaration per dataset |
| Freshness leaf breadth | 3 functions / 15 production importers | — | New tracked v3.9 surface; 19 importers including tests |
| Cron shell declarations | 7 | — | New tracked v3.9 surface; every scheduled route declares through `defineCronRoute` |
| Real-Postgres harness consumers | 17 | 14 | +3 DB suites; the shared harness remains the only lifecycle owner |
| Dataset declaration census | 56 tables / 4 index tests | — | New tracked v3.9 rail joining identity, purge, growth, and ESI declarations |
| API contract completeness | 52 routes / 17 contract modules | — | New tracked v3.9 surface; live gate green |
| EVE type-image resolver breadth | 8 exports / 6 functions / 16 production importers | — | New tracked v3.9 surface; 22 importers including tests |
| Threshold overrides | 0 | 0 | `.fallowrc.json` remains empty; no version diff |
| Source suppressions | 21 | 21 | Flat: 5 generated / 7 test-only / 9 production |
| Whole-version Fallow clone groups | 0 | 0 | No clone groups in the version-start-pinned run |
| Accepted duplication baseline clone groups | 0 | 0 | `fallow-baselines/dupes.json` remains empty |
| Version-start-pinned Fallow verdict | Pass | Fail | Fresh full-Postgres coverage clears AF-013 with zero introduced findings across 993 changed files |

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

`Recent commits` is shown as since the previous baseline date / whole v3.9
(`291ee78..ef2e7df`). Version-bump ceremony is retained in the table so it is not
mistaken for product pressure.

| File | Recent commits | Current evidence | Verdict |
| --- | ---: | --- | --- |
| `src/config/app-version.ts` | 4 / 24 | One required release bump per notable sub-version | Ceremony, not a hotspot |
| `src/lib/env.ts` | 2 / 3 | One validated registry absorbed the dev-sample flag and migration credential | Healthy centralization |
| Cron route modules (seven) | 0 / 3 each | Mechanical migration onto declarations; route bodies are now thin and railed | AF-009 remains Closed |
| `src/features/industry-planner/industry-styles.ts` | 0 / 3 | Freshness comparison moved to the shared exact-boundary leaf | Healthy primitive adoption |
| Wormhole-site sample-mode files | 1 / 1 | One dev-only feature slice with a production-off unit gate | Cohesive, complete |
| `src/db/migrate-url.ts` | 1 / 1 | One credential-selection seam introduced with its unit suite | Cohesive, complete |
| `src/app/legal/page.tsx` | 1 / 1 | Public-document truth rewrite only | Description churn, complete |
| Content-cache hotfix surfaces | 1 / 1 | Three isolated production-render hardening edits in 3.9.3.5 | Known `/devlog` remote-cache follow-up remains in backlog |

## Current hotspots

| Hotspot | Evidence | Direction of the fix | Live status |
| --- | --- | --- | --- |
| `PricingProvider.tsx` | 906 LOC; five concern contracts (4/10/18/6/13 fields) serve 22 hook calls across 11 components; no general pricing façade returned | Preserve the concern taxonomy; add fields only to their owning concern and never recreate `PricingContextValue` or `usePricing` | AF-005 Verified; monitored, not actionable |
| Auth query ownership | Seven focused owner/private modules remain, while `auth-surface` stays exactly three cross-slice contract files | Preserve direct owner imports and the acyclic transfer/admin/purge composition; promote to a real platform module before adding a fourth surface file | AF-004 Verified; Watch (AF-008) |
| `src/data/telemetry/queries.ts` | 545 LOC, 25 exports, 51 direct importers (Fallow fan-in 56), and no post-baseline churn | Split only when another independent stored-event persistence/read axis appears; do not divide one event vocabulary by helper type | AF-006 Watch; countable trigger below |
| `src/data/esi-refresh-jobs/queries.ts` | 13 exports and 17 direct importers around one durable queue lifecycle | Preserve lifecycle cohesion and keep Redis pending-signal ownership separate; extract only on a second persistence concern | Watch (AF-007); countable trigger below |
| ESI dataset registry and freshness leaf | 13 declarations; the 3-function leaf has 15 production importers; one rationale-bearing `market_history` waiver owns the dynamic expiry exception | Keep declarations complete and the verdict leaf narrow; new trigger, retry, and persistence policies stay with their owning layers | Enforced wide primitive; no finding |
| Cron declaration shell | Seven route declarations centralize auth, wake, lock, and recording policy; both sub-daily idle paths are covered | Keep `defineCronRoute` the sole route-policy owner and preserve schedule/import rails | AF-009 Closed; no renewed clone pressure |
| Real-Postgres harness and dataset census | One harness serves all 17 DB suites; the 56-table census joins four declaration concerns through tests without merging their vocabularies | Keep test lifecycle and declaration completeness centralized while registry semantics remain with their owners | Enforced test infrastructure; no finding |
| API contract surface | 52 routes are checked against 17 owning contract modules, markers, and endpoint-object use | Add schemas and endpoint objects in the owning slice; keep composition and validation in route handlers | Enforced wide surface; no finding |
| EVE type-image intent resolver | Eight exports (six functions) serve 16 production importers; rendition literals outside the owner are lint-blocked | Grow the intent vocabulary only for a real new rendition decision; keep raw variants private | Enforced wide primitive; no finding |
| EVE image size policy | `src/lib/eve-image.ts` is the sole owner of the 32–1024 ladder, family support, snapping, and portrait/logo URL types; the `next/image` adapter consumes it, with defaults and every rendition characterized byte-for-byte | Keep server-capability facts in lib and rendering in the component; add a size or family only at the lib owner with behavior evidence | AF-014 Delivered in 3.9.5.1; cycle-2 verification pending |
| Saved-plan state contracts | The view-only verdict is file-local `SavedPlansViewState`; the unchanged client controller remains the sole exported `SavedPlansState` | Keep the render verdict private and the controller contract with its hook; do not recreate a shared name for distinct concepts | AF-015 Delivered in 3.9.5.1; cycle-2 verification pending |

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
coverage now clears their coverage-driven CRAP without fragmenting their
interfaces or creating metric-shaped production code.

## Rails and exceptions

- **Boundaries:** Fallow reports 35 zones and 35 rules; `auth-surface` remains
  exactly three files. `.fallowrc.json` has no whole-version diff and no
  composition exception widened.
- **v3.9 rails:** cron restricted imports and schedule declarations; ESI dataset
  registration, dataset-TTL naming, and feature-staleness imports; endpoint
  contract and inline-endpoint checks; Base UI/sonner ownership; EVE image
  variant ownership; exported-surface comment rules; and the dataset declaration
  census all pass their durable seeded-red/live-green suites.
- **Pinned Fallow attribution:** the required version-start audit is green after
  fresh full-Postgres coverage. All six AF-013 functions execute through real
  seams, and the audit reports zero introduced findings without a waiver,
  baseline, suppression, or attribution workaround.
- **Standing rails:** the ESI dispatch gate, `EveImage` ownership, route
  classification, same-origin coverage, purge/growth registries, and environment
  registry remain connected.
- **Registry waiver:** `market_history` keeps its single
  `global-cron-names-route` waiver because the ESI response supplies a dynamic
  `Expires` boundary and on-view refresh has no cron owner. The rationale remains
  specific and current.
- **Lifecycle/public truth:** all 34 indexed contracts exist; 29 session plans
  are approved and complete. The six deferred contracts remain preserved beside
  their backlog dispositions, and AF-010–AF-015 are Delivered pending complete
  cycle-2 verification.

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
| 1 | AF-013 — coverage for four untested modules | Real behavioral coverage now exercises the flagged skill-save, SDE-ingest, station-name, and queued-skill-name paths through their existing seams; the four production modules remain byte-unchanged and the pinned gate passes without an exception | Delivered | Verify in the complete cycle-2 audit |

AF-006–AF-008 remain Watch. AF-013 was reclassified Campaign → Floss during
remediation planning and is Delivered by the merged 3.9.5.2 coverage evidence;
only the complete cycle-2 audit may mark it Verified. AF-010–AF-015 are all
Delivered bounded Floss awaiting that complete restart before version archive.
