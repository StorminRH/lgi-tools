# Code-health baseline schema

This file is the canonical form for `docs/CODE_HEALTH_BASELINE.md`. The live
baseline is a data record, not a report: it contains exactly the three sections
below, the registered identity and metric rows, and optional Watch carriers.
Free prose, notes, classifications, rationale, and campaign scheduling belong
in the version audit, version plan, or backlog instead.

The `Version-start` cell is captured once when a master version is adopted and
is frozen for that version. Ordinary sessions may update only `Current`.
`Delta` is derived: use the signed integer difference for two bare integer
values (`0` when equal), and an em dash (`—`) for every other value shape.

At master-version adoption, promote the committed baseline's `Current` column
into `Version-start` for every shared registered row, record the committed
baseline's own Code ref SHA as `Version-start ref`, and freeze both for the
version. New registered rows introduced in that same adoption fill
`Version-start` from live measurement at that ref. The claims checker owns the
one legal transition keyed on `Version-start ref`; invoke the read-only
`.agent-local/capture_version_start.py` reporter when applying the capture.

## Snapshot

| Field | Value |
| --- | --- |
| Date | `YYYY-MM-DD` |
| App version | `X.Y.N` |
| Code ref | `<full lowercase commit SHA and optional structured qualifier>` |
| Measurement scope | `<scope>` |
| Version-start ref | `<full lowercase commit SHA>` |

## Metrics

| Metric | Version-start | Current | Delta |
| --- | ---: | ---: | ---: |
| Production TS/TSX files | `<value>` | `<value>` | `<derived>` |
| Production TS/TSX LOC | `<value>` | `<value>` | `<derived>` |
| Test files | `<value>` | `<value>` | `<derived>` |
| Coverage — statements | `<value>` | `<value>` | `<derived>` |
| Coverage — branches | `<value>` | `<value>` | `<derived>` |
| Coverage — functions | `<value>` | `<value>` | `<derived>` |
| Coverage — lines | `<value>` | `<value>` | `<derived>` |
| Fallow health score | `<value>` | `<value>` | `<derived>` |
| Functions above health thresholds | `<value>` | `<value>` | `<derived>` |
| Planner concern-context fields | `<value>` | `<value>` | `<derived>` |
| Concern-hook consumers | `<value>` | `<value>` | `<derived>` |
| Auth contract paths (`src/platform/auth/types.ts`, `src/db/auth-schema.ts`, `src/platform/auth/api-contract.ts`) | `<value>` | `<value>` | `<derived>` |
| ESI dataset registry entries | `<value>` | `<value>` | `<derived>` |
| Freshness leaf breadth | `<value>` | `<value>` | `<derived>` |
| Cron shell declarations | `<value>` | `<value>` | `<derived>` |
| Real-Postgres harness consumers | `<value>` | `<value>` | `<derived>` |
| Dataset declaration census | `<value>` | `<value>` | `<derived>` |
| API contract completeness | `<value>` | `<value>` | `<derived>` |
| EVE type-image resolver breadth | `<value>` | `<value>` | `<derived>` |
| Threshold overrides | `<value>` | `<value>` | `<derived>` |
| Diagnostic suppressions | `<value>` | `<value>` | `<derived>` |
| Test contract suppressions | `<value>` | `<value>` | `<derived>` |
| Whole-version Fallow clone groups | `<value>` | `<value>` | `<derived>` |
| Accepted duplication baseline clone groups | `<value>` | `<value>` | `<derived>` |
| Version-start-pinned Fallow verdict | `<value>` | `<value>` | `<derived>` |
| Fallow boundary zones (configured) | `<value>` | `<value>` | `<derived>` |
| Vendor-resilience integrations | `<value>` | `<value>` | `<derived>` |
| Instrumented capability operations | `<value>` | `<value>` | `<derived>` |
| Owned service-level indicators | `<value>` | `<value>` | `<derived>` |
| UI adoption exemptions | `<value>` | `<value>` | `<derived>` |
| Retained legacy CSS families | `<value>` | `<value>` | `<derived>` |
| `src/data/telemetry/queries.ts` | `<export count> exports` | `<export count> exports` | `<derived>` |
| `src/data/esi-refresh-jobs/queries.ts` | `<export count> exports` | `<export count> exports` | `<derived>` |

## Watch findings

When an audit leaves a Watch active, carry it as one data-only bullet and one
machine-readable trigger fence. Omit this pair when no Watch is active. Repeat
the pair for each active Watch. `files(zone:<name>)` counts one explicit Fallow
zone; `files(paths:<path>,<path>,...)` counts one fixed repository-relative path
set when ownership moves make a zone-level counter misleading;
`files(globs:<pattern>,<pattern>,...)` counts the distinct files matching a
growable repository-relative pattern family.

- Watch (AF-nnn)

```watch-trigger
AF-nnn: exports(src/path/to/owner.ts) >= 1
```
