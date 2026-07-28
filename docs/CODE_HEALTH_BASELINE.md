# Code Health Baseline (LGI.tools)

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-07-27 |
| App version | 4.0.0.1 |
| Code ref | `c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd` on `main` (the v3.10 cycle-4 audited ref; 4.0 adoption) |
| Measurement scope | Full audit |
| Version-start ref | c60a44e6e35efaadbb6ed1d7d3a36bd69fe896dd |

## Metrics

| Metric | Version-start | Current | Delta |
| --- | ---: | ---: | ---: |
| Production TS/TSX files | 806 | 836 | +30 |
| Production TS/TSX LOC | 79,515 | 82,542 | +3027 |
| Test files | 428 | 446 | +18 |
| Coverage — statements | 85.83% | 86.00% | — |
| Coverage — branches | 82.81% | 82.89% | — |
| Coverage — functions | 81.37% | 81.59% | — |
| Coverage — lines | 86.89% | 87.05% | — |
| Fallow health score | 78 (B) | 78 (B) | — |
| Functions above health thresholds | 0 | 0 | 0 |
| Planner concern-context fields | 5 / 10 / 18 / 6 / 13 | 5 / 10 / 18 / 6 / 13 | — |
| Concern-hook consumers | 20 calls / 9 files | 20 calls / 9 files | — |
| Auth contract paths (`src/platform/auth/types.ts`, `src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`) | 3 | 3 | 0 |
| ESI dataset registry entries | 13 | 14 | +1 |
| Freshness leaf breadth | 3 functions / 14 production importers | 3 functions / 14 production importers | — |
| Cron shell declarations | 7 | 8 | +1 |
| Real-Postgres harness consumers | 20 | 25 | +5 |
| Dataset declaration census | 56 tables / 14 index tests | 60 tables / 15 index tests | — |
| API contract completeness | 52 routes / 17 contract modules | 58 routes / 18 contract modules | — |
| EVE type-image resolver breadth | 8 exports / 6 functions / 15 production importers | 8 exports / 6 functions / 15 production importers | — |
| Threshold overrides | 0 | 0 | 0 |
| Diagnostic suppressions | 18 | 18 | 0 |
| Test contract suppressions | 24 | 24 | 0 |
| Whole-version Fallow clone groups | 1 | 1 | 0 |
| Accepted duplication baseline clone groups | 0 | 0 | 0 |
| Version-start-pinned Fallow verdict | Pass | Pass | — |
| Fallow boundary zones (configured) | 22 | 22 | 0 |
| Vendor-resilience integrations | 14 | 15 | +1 |
| Instrumented capability operations | 38 | 40 | +2 |
| Owned service-level indicators | 5 | 5 | 0 |
| UI adoption exemptions | 16 | 17 | +1 |
| Retained legacy CSS families | 8 | 8 | 0 |
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
