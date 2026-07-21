# Code Health Baseline (LGI.tools)

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-07-20 |
| App version | 3.9.5.2 |
| Code ref | `f35cdb35f73513600991ce1162001369046cb11a` on `main` (the cycle-2 audited ref; measurements from the byte-identical HEAD working tree `d50677d`, whose only delta from `main` is the docs-only lifecycle-reconciliation commit) |
| Measurement scope | Full audit |

## Metrics

| Metric | Version-start | Current | Delta |
| --- | ---: | ---: | ---: |
| Production TS/TSX files | 762 | 762 | 0 |
| Production TS/TSX LOC | 73,072 | 73,072 | 0 |
| Test files | 368 | 368 | 0 |
| Coverage — statements | 86.90% | 86.90% | — |
| Coverage — branches | 84.25% | 84.25% | — |
| Coverage — functions | 82.84% | 82.84% | — |
| Coverage — lines | 87.90% | 87.90% | — |
| Fallow health score | 78 (B) | 78 (B) | — |
| Functions above health thresholds | 0 | 0 | 0 |
| Auth query-hub exports | 0 | 0 | 0 |
| `PricingContextValue` fields | 0 | 0 | 0 |
| `usePricing()` call sites | 0 | 0 | 0 |
| Planner concern-context fields | 4 / 10 / 18 / 6 / 13 | 4 / 10 / 18 / 6 / 13 | — |
| Concern-hook consumers | 22 calls / 11 files | 22 calls / 11 files | — |
| Telemetry query breadth | 25 exports / 50 fan-in files | 25 exports / 50 fan-in files | — |
| ESI refresh-job query exports | 13 | 13 | 0 |
| `auth-surface` files | 3 | 3 | 0 |
| ESI dataset registry entries | 13 | 13 | 0 |
| Freshness leaf breadth | 3 functions / 15 production importers | 3 functions / 15 production importers | — |
| Cron shell declarations | 7 | 7 | 0 |
| Real-Postgres harness consumers | 17 | 17 | 0 |
| Dataset declaration census | 56 tables / 4 index tests | 56 tables / 4 index tests | — |
| API contract completeness | 52 routes / 17 contract modules | 52 routes / 17 contract modules | — |
| EVE type-image resolver breadth | 8 exports / 6 functions / 16 production importers | 8 exports / 6 functions / 16 production importers | — |
| Threshold overrides | 0 | 0 | 0 |
| Source suppressions | 21 | 21 | 0 |
| Whole-version Fallow clone groups | 0 | 0 | 0 |
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
AF-008: files(zone:auth-surface) >= 4
```
