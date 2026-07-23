# Architecture boundaries

This document is the single prose owner of LGI.tools' source-zone ownership and
dependency directions. [`.fallowrc.json`](../.fallowrc.json) is the mechanical
authority: every production source file must match a named zone, and every
cross-zone import must match that zone's allow-list. `pnpm fallow` enforces both
rules.

The table records permissions, not a requirement to use every permitted edge.
An unlisted dependency is forbidden. The `features` and `data` entries are
logical groups whose direct child directories become individual Fallow zones;
the `data/npc-stats` row records its one child-specific override.

| Area | Owns | May depend on | Must not own |
| --- | --- | --- | --- |
| `auth-surface` | Shared authentication schemas, API contracts, and boundary types | `auth-surface`, `lib` | Authentication workflows, persistence, UI, or composition |
| `features/<name>` | One product capability, including its behavior, contracts, queries, and feature UI | `ui`, `data`, `lib`, `shared`, `auth-surface`, `db`, `config`, `purge`, `search`, `page-settings` (type-only today) | Peer-feature behavior or cross-feature composition |
| `data/<name>` | Reusable schemas, ingest, queries, and data-domain types | `lib`, `auth-surface`, `db`, `config`, `search`, `purge` (type-only today) | Feature behavior, peer-data behavior, UI, or application composition |
| `data/npc-stats` | The NPC-statistics data slice | The normal `data` dependencies plus the narrow `data/eve-data` exception | Any other peer-data dependency |
| `ui` | Domain-neutral primitives under `src/components/ui/` | `lib` | Product meaning, application composition, or data access |
| `lib` | Cross-cutting leaf utilities | `lib`, `config` | Product, data, UI, persistence, or composition ownership |
| `shared` | Cross-feature components and their co-located hooks/view models | `ui`, `lib`, `data`, `features`, `auth-surface`, `config`, `page-settings`, `search` | Feature-owned behavior or infrastructure ownership |
| `app` | Next.js routes, pages, layouts, and route-level composition | `features`, `data`, `ui`, `shared`, `db`, `config`, `page-settings`, `auth-surface`, `lib` | Reusable product or infrastructure behavior |
| `db` | Database composition, pipelines, schema aggregation, migrations, and database tooling | `data`, `features`, `config`, `auth-surface`, `purge`, `esi-datasets`, `lib` | Feature presentation or route ownership |
| `config` | Authoritative application configuration values | `lib` | Product workflows, persistence, or application composition |
| `purge` | Account-data purge composition and contributor contracts | `data`, `features`, `db`, `lib` | Slice-owned deletion behavior outside the contributor contract |
| `search` | Global-search composition, registration, matching, and shared search contracts | `data`, `features`, `auth-surface`, `lib` | Slice-owned search result meaning |
| `page-settings` | Page-settings composition, registration, and shared page-setting contracts | `features`, `lib` | Feature-owned setting definitions |
| `esi-datasets` | Cross-slice ESI dataset declarations and registry checks | `data`, `db`, `features` (all test-only today), `lib` | Dataset implementation or feature behavior |
| `convex` | Regenerable live projections and synchronization behavior | `data`, `auth-surface`, `lib`, and the narrow `features/online-status` exception described below | Neon authority, reusable product behavior, or unrelated feature dependencies |
| `runtime` | Next.js process entry points: proxy and instrumentation modules | `config`, `data`, `features`, `lib` | Route, feature, or infrastructure implementation |

## Declared exceptions

- `data/npc-stats` may reuse `data/eve-data`; its child-specific rule prevents
  that exception from opening peer-data imports for the rest of `data`.
- `convex/onlineStatusSync.ts` may reuse the runtime-light
  `features/online-status` ESI projection and eligibility helpers. Relocating
  those helpers to a data leaf would cross multiple ownership surfaces, so the
  dependency remains visible as a narrow allow-list exception instead of being
  hidden by a waiver or baseline.

## Coverage boundary

Fallow coverage is deny-by-default for source code. The only unmatched paths
are enumerated non-production tooling: `scripts/**`, `neon.ts`,
`next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, and
`eslint.config.mjs`. Adding a new source area therefore requires an explicit
ownership and dependency decision.
