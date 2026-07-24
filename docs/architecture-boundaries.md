# Architecture boundaries

This document is the single prose owner of LGI.tools' source-zone ownership,
responsibility bands, and dependency directions. [`.fallowrc.json`](../.fallowrc.json)
is the mechanical authority: every production source file must match a named
zone, and every cross-zone import must match that zone's allow-list.
`pnpm fallow` enforces both rules.

The map is deny-by-default. A listed edge is permission, not a requirement to
use that dependency. An unlisted edge is forbidden. The final map has no
cross-layer exception entries.

## Responsibility bands

Dependencies point downward through these bands. A zone may use only the lower
zones named in its Fallow rule; membership in a band does not grant blanket
access to the rest of that band.

1. **Entry points** — `app`, `api`, `scripts`, and `runtime` translate framework
   or process entry into application calls.
2. **Composition** — `composition` owns server-side cross-slice orchestration;
   `components-composition` owns app-shell, dashboard, page-menu, and account UI
   composition.
3. **Product and presentation** — auto-discovered `features/<name>` zones own
   product capabilities; `components` and `ui` own reusable presentation.
4. **Data** — auto-discovered `data/<name>` zones own reusable schemas, ingest,
   queries, and data-domain types.
5. **Platform capabilities** — authentication, ESI, owner synchronization,
   search, purge, and page-settings contracts that multiple higher bands use.
6. **Foundations** — `transport`, `db`, `lib`, and `config` are leafward
   infrastructure.

`convex` is a regenerable live-projection runtime beside the entry-point band.
`esi-datasets` is a test-only cross-slice registry-check zone. It deliberately
sits outside the composition band because its governance suites audit that
band: zone-internal checks may inspect data, features, platform contracts, the
Drizzle aggregator, and composition registries without making composition
responsible for auditing itself.

## Zone permissions

| Zone | Owns | May depend on |
| --- | --- | --- |
| `app` | Next.js pages, layouts, metadata, and page-owned tests | `components-composition`, `composition`, `components`, `ui`, `features`, `platform/auth`, `platform/esi`, `platform/page-settings`, `data`, `transport`, `lib`, `config` |
| `api` | Next.js route handlers and route-owned tests | `transport`, `composition`, `features`, `platform/auth`, `platform/esi`, `data`, `db`, `lib`, `config` |
| `scripts` | Executable application-maintenance commands | `composition`, `platform/auth`, `data`, `db`, `lib` |
| `runtime` | Next.js proxy and instrumentation entry points | `transport`, `features`, `data`, `lib`, `config` |
| `composition` | Server-side cross-slice workflows, registries, and pipelines | `features`, every required platform capability, `data`, `transport`, `db`, `lib`, `config` |
| `components-composition` | Cross-feature shell and account presentation | `composition`, `components`, `ui`, `features`, `platform/auth`, `platform/search`, `platform/page-settings`, `data`, `transport`, `lib`, `config` |
| `features/<name>` | One product capability and its feature UI | Platform contracts, `data`, `transport`, `db`, `lib`, `config`, `ui`, `components`; never a peer feature |
| `components` | Reusable domain-aware leaf components and telemetry presentation | `ui`, `platform/auth`, `platform/search`, `platform/page-settings`, `data`, `transport`, `lib` |
| `ui` | Domain-neutral UI primitives | No cross-zone dependencies |
| `data/<name>` | One reusable data slice | `data/eve-data`, `platform/esi`, `platform/owner-sync`, `platform/search`, `platform/purge`, `transport`, `db`, `lib`, `config`; never another peer data slice |
| `platform/auth` | Authentication, EVE SSO, auth contracts, and identity boundaries | `platform/esi`, `platform/purge`, `data`, `transport`, `db`, `lib`, `config` |
| `platform/owner-sync` | Owner-reconciliation registration seam | `platform/esi` |
| `platform/esi` | Shared ESI client, URL, budget, and error capabilities | `lib`, `config` |
| `platform/search` | Search registration and matching contracts | No cross-zone dependencies |
| `platform/purge` | Purge contributor contracts | No cross-zone dependencies |
| `platform/page-settings` | Page-setting contracts | `lib` |
| `transport` | HTTP/API transport helpers | `lib` |
| `db` | Database connection, schema aggregation, and harness foundations | `lib`, `config` |
| `lib` | Cross-cutting leaf utilities | `config` |
| `config` | Authoritative application configuration | No cross-zone dependencies |
| `convex` | Regenerable live projections and synchronization | `platform/esi`, `platform/auth`, `data`, `lib` |
| `esi-datasets` | Test-only declaration, purge-coverage, and registry governance | `composition`, `db`, `data`, `features`, `platform/auth`, `platform/purge`, `lib` |

The platform band has an explicit internal order. `platform/auth` may use the
lower ESI and purge contracts; `platform/owner-sync` may use ESI; the ESI,
search, purge, and page-settings owners remain leaves except for the narrow
foundation dependencies shown above.

The data band's only peer edge is its shared reference core:
`data/<name> -> data/eve-data`. Fallow's auto-discovered child zones keep every
other data-to-data import forbidden.

## Inversion and runtime seams

Authentication exposes the owner-reconciliation hook at
`src/platform/auth/owner-reconcile-hook.ts`. Route composition activates its
implementation by importing
`src/composition/account-lifecycle/register-owner-reconciler.ts`. This keeps
authentication pointed downward while composition wires the participating
capabilities above it.

Server-only ownership is declared with the `server-only` marker in exactly four
modules:

- `src/platform/auth/auth.ts`
- `src/platform/auth/eve-sso.ts`
- `src/lib/rate-limit.ts`
- `src/data/gsc/source.ts`

The marker protects client import graphs. The lint policy carries narrow
runtime exemptions where a server module is owned by a different executable
environment:

- `db`, `scripts`, and environment access for `tsx` CLI commands
- `platform/esi` for Convex
- the EVE data source for the SDE CLI
- the pending-signal owner for its CLI worker

These are runtime-entry exemptions, not architecture-boundary exceptions.

## Coverage and records

Fallow coverage is deny-by-default for source code. The only unmatched paths
are enumerated non-production tooling: `scripts/**`, `neon.ts`,
`next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, and
`eslint.config.mjs`. Adding a new source area therefore requires an explicit
ownership and dependency decision.

Tests remain co-located with the owner they verify. App page tests stay under
`src/app/`; route tests stay under `src/app/api/`. A gate signal must be fixed
in the zone map or raised as a design conflict, never hidden by relocating an
owner's test.

`content/devlog/` and `content/changelog/` are assembled historical records.
They are deliberately excluded from living-path sweeps; old paths in dated
records describe the code as it existed when the entry was published.
