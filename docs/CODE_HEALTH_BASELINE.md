# Code Health Baseline (LGI.tools)

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-07-27 |
| App version | 3.10.5.1 |
| Code ref | `9ce2210def5982ff815484d93bc91d8350de1aaf` on `main` (the v3.10 cycle-3 audited ref; clean close) |
| Measurement scope | Full audit |

## Metrics

| Metric | Version-start | Current | Delta |
| --- | ---: | ---: | ---: |
| Production TS/TSX files | 762 | 806 | +44 |
| Production TS/TSX LOC | 73,072 | 79,515 | +6443 |
| Test files | 368 | 428 | +60 |
| Coverage — statements | 86.90% | 85.83% | — |
| Coverage — branches | 84.25% | 82.81% | — |
| Coverage — functions | 82.84% | 81.37% | — |
| Coverage — lines | 87.90% | 86.89% | — |
| Fallow health score | 78 (B) | 78 (B) | — |
| Functions above health thresholds | 0 | 0 | 0 |
| Auth query-hub exports | 0 | 0 | 0 |
| `PricingContextValue` fields | 0 | 0 | 0 |
| `usePricing()` call sites | 0 | 0 | 0 |
| Planner concern-context fields | 4 / 10 / 18 / 6 / 13 | 5 / 10 / 18 / 6 / 13 | — |
| Concern-hook consumers | 22 calls / 11 files | 20 calls / 9 files | — |
| Telemetry query breadth | 25 exports / 50 fan-in files | 25 exports / 44 fan-in files | — |
| ESI refresh-job query exports | 13 | 13 | 0 |
| Auth contract paths (`src/platform/auth/types.ts`, `src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`) | 3 | 3 | 0 |
| ESI dataset registry entries | 13 | 13 | 0 |
| Freshness leaf breadth | 3 functions / 15 production importers | 3 functions / 14 production importers | — |
| Cron shell declarations | 7 | 7 | 0 |
| Real-Postgres harness consumers | 17 | 20 | +3 |
| Dataset declaration census | 56 tables / 4 index tests | 56 tables / 14 index tests | — |
| API contract completeness | 52 routes / 17 contract modules | 52 routes / 17 contract modules | — |
| EVE type-image resolver breadth | 8 exports / 6 functions / 16 production importers | 8 exports / 6 functions / 15 production importers | — |
| Threshold overrides | 0 | 0 | 0 |
| Source suppressions | 21 | 42 | +21 |
| Whole-version Fallow clone groups | 0 | 1 | +1 |
| Accepted duplication baseline clone groups | 0 | 0 | 0 |
| Version-start-pinned Fallow verdict | Pass | Pass | — |
| `src/data/telemetry/queries.ts` | 25 exports | 25 exports | — |
| `src/data/esi-refresh-jobs/queries.ts` | 13 exports | 13 exports | — |

## Watch findings

- Watch (AF-006)

```watch-trigger
AF-006: exports(src/data/telemetry/queries.ts) >= 26
```

- Watch (AF-007)

```watch-trigger
AF-007: exports(src/data/esi-refresh-jobs/queries.ts) > 15
```

- Watch (AF-008)

```watch-trigger
AF-008: files(globs:src/platform/auth/*types.ts,src/platform/auth/*-contract.ts,src/db/*auth*schema.ts) >= 4
```
