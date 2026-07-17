# Code Health Baseline (LGI.tools)

> **Living state, not a log.** Every version audit replaces this file in place
> using the fixed schema in `docs/VERSION_AUDIT.md`. Never append history. The
> constitution is `docs/DESIGN_PRINCIPLES.md`; this file records current evidence
> and decisions only.

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-07-16 |
| App version | 3.8.5.5 |
| Code ref | `291ee78bb1f0231f06a021b910f1181ad8c39bff` on `main` |
| Measurement scope | Full audit |
| Previous comparison | 2026-07-16 / 3.8.5.5 / `291ee78…` (targeted AF-005 pass at the same ref) |
| Health trend | Audit cycle 2 verified every v3.8 remediation outcome from fresh evidence — the mutation pipeline, owner-sync convergence, query characterization, auth owners, and five-concern pricing contexts all hold on canonical `main` with no new actionable finding, so v3.8 closes clean. |

## Step 1 metrics

| Metric | Current | Previous | Delta / note |
| --- | ---: | ---: | --- |
| Production TS/TSX files | 758 | 749 | +9 since the v3.8 audit from v3.9 workflow and cron-primitive delivery |
| Production TS/TSX LOC | 72,203 | 66,348 | +5,855 since the v3.8 audit, primarily the repo-wide interface-comment standard plus the cron declaration and idle-signal modules |
| Test files | 357 | 352 | +5 since the v3.8 audit for workflow rails, cron-shell behavior, Redis signals, and response contracts |
| Coverage — statements | 88.06% | 88.06% | 8,076 / 9,171 from fresh full-Postgres coverage; 3,322 tests passed + 1 intentional skip |
| Coverage — branches | 84.80% | 84.80% | 4,784 / 5,641 |
| Coverage — functions | 84.34% | 84.34% | 2,010 / 2,383 |
| Coverage — lines | 89.06% | 89.06% | 7,103 / 7,975 |
| Fallow health score | 78 (B) | 78 (B) | Freshly remeasured; deductions are hotspots −10, unit size −10, coupling −2.2; maintainability 91.6 (good) |
| Functions above health thresholds | 0 | 0 | Fresh coverage-backed run; the six former AF-003 findings remain cleared by characterization |
| Auth query hub exports | 0 | 0 | Hub deleted; seven focused owner/private modules verified in place; the only remaining `features/auth/queries` string is a devlog parser test fixture |
| `PricingContextValue` fields | 0 | 0 | Interface, context, and `usePricing` remain deleted with no compatibility surface |
| `usePricing()` call sites | 0 | 0 | Zero definition or consumer hits |
| Concern-context fields | 4 / 10 / 18 / 6 / 13 | 4 / 10 / 18 / 6 / 13 | Market / config / setup / character / plan, remeasured per interface; every surface materially narrower than the former 52 |
| Concern-hook consumers | 22 calls / 11 files | 22 calls / 11 files | Carried from the AF-005 delivery measurement at this same ref |
| Threshold overrides | 0 | 0 | `.fallowrc.json` `thresholdOverrides` is empty; confirmed fresh |
| Source suppressions | 21 | 21 | Count re-verified; composition unchanged since the cycle-1 per-site review |
| Whole-version Fallow clone groups | 0 | 1 | `dup:b54bf337` was removed as a byproduct of the wake-policy-driven cron shell expansion; no clone groups remain |
| Accepted duplication baseline clone groups | 0 | 0 | `fallow-baselines/dupes.json` remains empty; nothing waived |

The version-start shape was extracted with `git archive` during cycle 1 and
measured under the same file/LOC rules. Historical coverage was intentionally
not run under the current dependency and toolchain state.

### Largest production files

| Rank | File | LOC | Classification |
| ---: | --- | ---: | --- |
| 1 | `src/features/industry-planner/components/PricingProvider.tsx` | 902 | AF-005 outcome Verified — cohesive orchestration behind five concern contracts |
| 2 | `src/data/eve-data/tree-resolver.ts` | 647 | Cohesive non-goal |
| 3 | `src/features/custom-structures/components/CustomStructureBuilder.tsx` | 636 | Watch |
| 4 | `convex/engine.ts` | 518 | Cohesive non-goal |
| 5 | `src/features/industry-planner/components/MeAdjuster.tsx` | 509 | Watch |
| 6 | `src/data/telemetry/queries.ts` | 507 | Watch (AF-006) |
| 7 | `src/data/eve-data/universe.ts` | 501 | Watch |
| 8 | `src/features/industry-planner/build-batch.ts` | 498 | Cohesive non-goal |
| 9 | `src/data/eve-data/queries.ts` | 470 | Watch; backlog carries the opportunistic-split note |
| 10 | `src/app/admin/TrafficSection.tsx` | 467 | Watch |
| 11 | `src/features/wormhole-sites/queries.ts` | 466 | Covered cohesive query module; AF-003 Verified without extraction |
| 12 | `src/features/devlog/parse.ts` | 445 | Cohesive non-goal |
| 13 | `src/features/industry-planner/components/CockpitBuildPlan.tsx` | 439 | Watch |
| 14 | `src/features/industry-planner/components/CockpitKpis.tsx` | 426 | Watch |
| 15 | `src/lib/esi/dispatch.ts` | 408 | Cohesive non-goal; sole ESI dispatch gate |
| 16 | `src/data/gsc/ingest.ts` | 401 | Cohesive ingestion orchestration |

### Current churn signals

`Recent commits` is shown as whole v3.8 (`dbd6a79..291ee78`) / remediation range
(`5e7222a..291ee78`).

| File | Recent commits | Current evidence | Verdict |
| --- | ---: | --- | --- |
| `src/app/globals.css` | 8 / 0 | Authoritative token layer absorbed the UI-system sweep; zero remediation-phase churn | Healthy centralization |
| `src/app/admin/page.tsx` | 5 / 0 | Route-level composition over sealed slices; quiet through remediation | Cohesive composition |
| Auth data owners (former `auth/queries.ts`) | 11 / 9 | Hub deleted; seven focused owner/private modules hold the split with no compatibility façade and zero stale imports | AF-004 Verified in cycle 2 |
| `src/data/telemetry/queries.ts` | 2 / 0 | 507 LOC; 25 exports; quiet through remediation | Watch (AF-006); trigger untouched |
| `src/data/esi-refresh-jobs/queries.ts` | 3 / 0 | 379 LOC; 13 exports; the residual queue read remains in the existing lifecycle axis while Redis pending-work state lives in its own module | Watch (AF-007); below trigger |
| `PricingProvider.tsx` | 11 / 2 | 902 LOC; five separately memoized concern values (4/10/18/6/13 fields); 22 hook calls across 11 components; no `PricingContextValue`, `PricingContext`, or `usePricing` | AF-005 Verified in cycle 2 |
| `src/features/wormhole-sites/queries.ts` | 11 / 1 | 466 LOC; the six AF-003 seams remain directly characterized; fresh coverage-backed health reports zero findings | AF-003 Verified in cycle 2 |
| Mutation-route shells (17 pipeline routes) | — / 2 | One 57-LOC app-layer sequencer owns ordering across 17 routes; the pinned whole-version run reports none of AF-001's seven clone IDs | AF-001 Verified in cycle 2 |

## Current hotspots

| Hotspot | Evidence | Direction of the fix | Live status |
| --- | --- | --- | --- |
| `src/features/industry-planner/components/PricingProvider.tsx` | 902 LOC and 32 fan-out keep it the largest file; five concern contracts (4/10/18/6/13 fields) serve 11 components; provider owns state/effects/derivations and builds each value separately | Preserve the concern taxonomy in `planner-contexts.tsx`; add fields only to their owning concern, keep templates off market data, and do not reintroduce a general façade or selector layer | AF-005 Verified; monitored, not actionable |
| Auth query ownership | Seven focused owner/private modules (linked-characters, affiliation-store, admin-users, owner-transfer, account-purge, verification-retention, eve-account-shared) each own one axis; `auth-surface` remains exactly three files | Preserve direct owner imports and the acyclic owner-transfer → admin/purge composition; no barrel, façade, or fourth `auth-surface` file | AF-004 Verified; monitored, not actionable |
| `src/data/telemetry/queries.ts` | 507 LOC; 25 exports; 55 fan-in; zero remediation-phase churn | Keep query groups aligned to one stored event vocabulary; split the next independent persistence/read axis instead of adding another helper family | Watch (AF-006); countable trigger below; judgment: the new export must come from a new axis, or renewed multi-session growth |
| `src/data/esi-refresh-jobs/queries.ts` | 379 LOC; 13 exports; one queue lifecycle axis with explicit transitions, residual timing, and retention; the Redis pending-work signal is a separate persistence module | Preserve lifecycle cohesion; keep Redis signal ownership separate; extract query code only on another independent persistence/read axis or changing admin contract | Watch (AF-007); below the countable trigger; judgment: another change axis also promotes |
| `auth-surface` zone | Exactly three cross-slice contract files, classified ahead of `features/auth`; 35 zones / 35 rules overall | Do not widen. Promote shared contracts to a real platform module if a fourth file is needed | Watch (AF-008); countable trigger below |
| Cron route declarations | All seven routes declare identity, wake class, lock and recording policy, idle policy where applicable, and work to one shell; both 15-minute routes prove zero Neon touches on healthy no-ops; `runCronJob` and the temporary schedule justification are gone; the existing AF-006 budget-history read is Redis-marker gated with no new telemetry export | Preserve `defineCronRoute` as the sole route-level auth/idle/lock/telemetry owner and keep sub-daily healthy no-ops demonstrably Neon-silent | AF-009 Closed as a byproduct of the wake-policy-driven shell expansion; the clone itself never tripped its promotion trigger |

### Watch triggers

One fenced `watch-trigger` block per Watch finding; grammar and trip-form
semantics are owned by `docs/VERSION_AUDIT.md` Step 4. These blocks are the
single home of each countable promotion threshold.

```watch-trigger
AF-006: exports(src/data/telemetry/queries.ts) >= 26
```

```watch-trigger
AF-007: exports(src/data/esi-refresh-jobs/queries.ts) > 15
```

```watch-trigger
AF-008: files(zone:auth-surface) >= 4
```

The admin ops composition is not a hotspot: `OpsSection.tsx` is four independent
Suspense panels over tested view derivation, and domain events remain a closed
typed ledger. Known-good deep modules remain protected non-goals:
`tree-resolver.ts`, `convex/engine.ts`, `src/lib/esi/`, `src/lib/api-client.ts`,
and `src/lib/env.ts`. Fallow's low-priority refactoring suggestions
(`skill-queue/progress.ts`, `lib/format/time.ts`, `saved-plans-view.ts`,
`wormhole-sites/sort.ts`) are small, cohesive view/format modules where breadth,
change axes, and churn do not coincide; per P10 they rank attention only and
justify no work.

## Rails and exceptions

- **Rails:** zero-warning lint, ES2022, and `noUncheckedIndexedAccess` remain
  enabled; `AnyPgDb`/`PostgresJsDb` still have one typed home; `neon.ts` retains
  production protection and bounded preview compute/TTL policy.
- **UI:** semantic token and primitive guards remain lint-enforced. `EveImage`
  is still the sole `next/image` importer; the chart/table dialect remains the
  admin presentation standard.
- **SEO:** catalogue/detail crawler links, truthful sitemap dates, page-specific
  social metadata, JSON-LD, and GSC instrumentation remain present. Editorial
  copy and promotional outreach remain explicit backlog/operator deferrals.
- **Operations:** same-origin telemetry, token custody, table growth registry,
  encrypted snapshots, deferred queue, cost telemetry, event ledger, admin
  visibility, retention, and alerts remain connected. `src/lib/esi/` is still
  the dispatch authority, and Convex contains no Neon/Postgres import path.
- **Boundaries:** Fallow reports 35 zones and 35 rules; `auth-surface` remains
  exactly three files; no boundary rule widened during v3.8. Fallow is the sole
  mechanical boundary owner and CONTRIBUTING.md is the public prose; the
  `.fallowrc.json` note carries the corrected single-owner wording.

### Standing Fallow threshold overrides

None. `thresholdOverrides` is empty and fresh coverage-backed health reports
zero above-threshold functions.

### Suppressions

- Current count: **21**, unchanged since the cycle-1 per-site review.
- Five are generated Convex file headers and seven are test-only type/mocking
  seams.
- The nine production suppressions remain: one Next.js convention export, the
  documented dual-driver DB alias, three narrowly justified React effect
  synchronizations, the escaped server-built JSON-LD sink, Shiki's build-time
  token color, and two sub-4px primitive indicators.
- No suppression is stale, widened, or suitable for removal.

### Duplication baseline

- Gate mode: `new-only`.
- Baseline file: `fallow-baselines/dupes.json`.
- Accepted clone groups: **0**.
- The whole-version pinned audit finds **0 clone groups**. The former
  `dup:b54bf337` affiliation/industry-index shell disappeared as a byproduct of
  expanding the cron seam for wake-class and recording-policy ownership, not
  because the clone itself promoted. AF-009 is closed with no baseline waiver.

## Campaign queue

| Priority | Campaign | Charter summary | Status | Trigger / next action |
| ---: | --- | --- | --- | --- |

The queue is empty. All three v3.8 campaigns (mutation-route pipeline / AF-001,
auth query ownership / AF-004, pricing-context decomposition / AF-005) were
Verified by audit cycle 2 and closed with the version. Future structural work
enters through the Watch triggers above (AF-006–AF-008) or a new version audit;
AF-009 closed during 3.9.2.2's wake-policy expansion.
