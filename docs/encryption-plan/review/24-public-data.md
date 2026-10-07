# Part 24: Public data and private-interest lookups

**Status:** Draft for owner review

## In one paragraph

Public data (the SDE, Jita prices and history, cost indices, adjusted prices, wormhole statics, the sites guide) stays readable on LGI's servers, with today's ingest crons. The only problem is how it gets looked up. Some lookups send the ID that private content picked: a system on a map, a pilot in that system, a system where someone builds, the rigs on a structure. The lookup itself then reveals the private interest. This part replaces those lookups with whole versioned assets, using today's `/api/universe/assets/[version]` pattern. It names the few low-sensitivity per-ID lookups that stay, and allows the workers to call CCP per ID from inside the enclave. It has the sealed service hold the public tables it needs in memory, and it seeds the price sweep from every marketable type.

## How it works today

- **Universe assets.** `GET /api/universe/assets` returns a version (`<sdeVersion>+u5`, from `composeUniverseAssetVersion`) with `no-store`. `+u5` is a code-owned shape suffix. `/api/universe/assets/[version]/{systems,adjacency,wormholes}` return whole tables with `public, max-age=31536000, immutable`, and a 404 for any other version. `universe-assets-client.ts` caches each one in a module-level promise until reload.
- **Statics per system.** `/api/universe/statics/[systemId]` loads the whole promoted table (`getSystemStatics`, tagged `WH_STATICS_TAG`) and returns one row. The mapper (`wh-statics/client.ts`, which drops its pending entry once a fetch settles) and Convex (`mapStatics.fetchSystemStatics`) call it per system.
- **Names.** `POST /api/eve/names` resolves up to 200 IDs through `resolveEntityNames`, whose `fetchEntityName` calls ESI `/universe/names` under `'use cache: remote'` with one tag per ID (`eve-entity-name-<id>`). Browser callers: `FriendlyList` (pilots in the viewed system), `CorpJobsBoard` and `useCharacterIdentities`. Server callers share the same cache: `name-book.ts`, `owned-assets-sync.ts:49` and `owned-blueprints-sync.ts:50` (station and system IDs from holdings), and `corp-structures-sync.ts:138` (corp IDs). So holding locations sit today in Vercel's remote cache. `POST /api/eve/type-names` reads `eve_types` by ID with no published filter, for `FriendlyList`'s ship types.
- **Token-bearing ESI lookups.** `corp-context-sync.ts:34`, `character-sheet-sync.ts:21` and `structure-search.ts:29` call `/universe/structures/{id}` with a user's token.
- **Industry lookups.** `POST /api/industry/build-location` (system and blueprint) and `POST /api/industry/cost-indices` (up to 64 systems) return current values on every pick; `src/data/industry-indices` has no `'use cache'`. `GET /api/account/structures` (`// authz: auth`) calls `getProductionModifiers` with the hull and rig IDs of custom and corp structures. `/api/account/custom-structures/parse-fit` sends fit text to Vercel, and `/search` sends the typed structure name.
- **Market.** `/api/market-prices/refresh` and `/api/market-history/refresh` take type IDs from the planner (`PricingProvider`) and from the mapper. `ScannerLivePricesProvider` refreshes the harvestable signature types in the viewed system, re-requesting on a jump or a fresh gas or ore signature; `SiteResourcesLive` does the same for one site. Refreshes write `market_prices`. `seedTrackedTypes` seeds blueprint-tree types, the wormhole-sites ingest seeds about 54 rows, and `recordNetWorthSnapshot` seeds owned types (`seedUnpricedTypes`). The sweep uses the bulk region dump at 100 or more types and a Fuzzwork fallback in batches of 150.
- **Images.** `EveImage`, `type-icon.tsx:66` and `EntityLogo.tsx` load `images.evetech.net` straight from the browser by type, character and corp ID. The CSP allows it (`src/proxy.ts:32`).
- **Sites.** The site viewer fetches `/api/sites/[id]`; the catalogue loads whole from `/api/sites`.
- **Crons.** `daily-batch` (12:00 UTC, `maxDuration` 300 s) runs map purge, prices, indices, the ESI queue drain, revaluation, statics (Mondays) and housekeeping. `refresh-sde` runs at 14:00. A statics change goes live only after admin review, which revalidates `WH_STATICS_TAG`.

Files: `src/app/api/{universe,eve,industry,account,market-prices,market-history,sites,cron}/**`, `src/data/eve-data/`, `src/data/{wh-statics,industry-indices,market-prices}/`, `convex/mapStatics.ts`, `src/composition/{board/name-book,structure-search}.ts`, `src/composition/sync/`, `src/composition/pipelines/sde-pipeline.ts`, `src/features/wormhole-sites/components/`, `src/components/{eve-image,type-icon}.tsx`, `src/proxy.ts`.

## What changes

Nothing visible changes for users. Pages, timings and values stay the same. Behind them:

- Statics, ship type names, cost indices, adjusted prices, industry stations and production modifiers become whole versioned assets. The per-system statics, type-names, build-location and cost-indices routes are deleted.
- Tracked pilots' names come from the map's readable access projection (Part 04 PR 0-5). Corp installer names arrive in the sealed corp jobs view (Part 23).
- Fit parsing moves into the browser (Part 20). Structure search and token-bearing lookups move into the workers (Parts 20, 21). Server-side name resolution moves into the enclave (Part 19).
- The mapper's live prices refresh a fixed set of types, not the viewed system's.
- `market_prices` is seeded from every marketable type and the sites ingest, never from holdings.

These ship as Part 04's PRs 0-3 to 0-6; this part fixes their shared shape.

**Dropped from older docs.** The `data.lgi.tools` origin, signed dataset manifests and `datasets.pin`, R2 hosting and the 400-day price book, the kill feed, the EVE-Scout mirror, system jumps and kills, w-space activity and the ESI status dataset (03 'Dataset catalogue', 04 §18). Only the size estimates are reused.

## Design

**Asset shape.**

1. The manifest `GET /api/universe/assets` (`no-store`) keeps `version` and adds one version per family: `staticsVersion`, `indicesVersion`, `sitesVersion` if the sites asset ships. It reads only cached values. `staticsVersion` comes from `getSystemStatics`. A new `INDUSTRY_INDICES_TAG`, revalidated by `refresh-industry-indices` after it persists, caches one read that builds the indices bodies and computes `indicesVersion`, as `getSystemDirectory` does.
2. Bodies are served at `/api/universe/assets/[version]/<name>` with `UNIVERSE_ASSET_CACHE_CONTROL`. Any other version gets a 404 and the client refetches the manifest.
3. A version is the data version plus a code-owned shape suffix, as with `+u5`. Each family has its own suffix, bumped whenever its body schema changes.
4. The client caches each asset in a module-level promise and looks rows up locally. It re-checks the manifest when the tab becomes visible and at least hourly, and replaces a family's promise when its version changes. A tab left open picks up the 12:00 UTC indices and statics promotions without a reload, as today.

| Asset | Replaces | Contents | Version | Size (gzip, estimate) | Read by |
|---|---|---|---|---|---|
| `statics` | Per-system statics route | system ID → static codes | Promoted `feedVersion` plus snapshot ID | About 15 KB | Mapper; Convex `mapStatics` until Phase 2 |
| `ship-types` | `/api/eve/type-names` | Every `eve_types` row in the Ship category, published or not: ID → name, group | SDE | About 10–15 KB | `FriendlyList` |
| `cost-indices` | `cost-indices`, part of `build-location` | system ID → manufacturing and reaction index | `indicesVersion` | About 50–100 KB | Planner (Part 21) |
| `adjusted-prices` | Part of `build-location` | type ID → adjusted price | `indicesVersion` | About 150 KB | Planner |
| `industry-stations` | Part of `build-location` | Today's stations index plus operation and activity flags | SDE | Under 100 KB | Planner |
| `production-modifiers` | `getProductionModifiers` by ID in `/api/account/structures` | Hull and rig modifiers, target filter sets, capital hull IDs | SDE | Measure | Planner and structures (Parts 20, 21) |
| `sites` (if small) | `/api/sites/[id]` | All curated site details | Sites ingest | Measure; expected tens of KB | Site viewer |
| `systems`, `adjacency`, `wormholes` | Unchanged | Unchanged | SDE | Unchanged | Unchanged |

Part 21 owns the industry asset contents. Industry assets load at idle on industry pages. `statics` loads with the universe assets when the mapper opens, so the first lookup waits no longer than today's per-system fetch.

**Why industry tables go to the browser, not the sealed service.** Principle 3 prefers the sealed service, but `/industry` pages work for logged-out visitors, who have no browser session key or sealed channel. A Convex round trip to the enclave would add latency and an enclave dependency to a public page. The planner maths already runs in the browser, so only the table download is new. Staging measures first-visit time to interactive before this ships.

**Names without per-ID calls to LGI.**

| Name | Today | After |
|---|---|---|
| Pilots in the viewed system | `/api/eve/names` | The map's readable `mapAccess.characters` (ID and name), loaded once per map and joined to tracking rows in the browser (Part 04 PR 0-5) |
| Their ship types | `/api/eve/type-names` | `ship-types` asset |
| Corp job installers | `/api/eve/names` | Sealed corp jobs view (Part 23) |
| Board, sheet, holding and structure names | `resolveEntityNames` on Vercel | Workers, from in-memory tables, and ESI from the enclave (Part 19) |
| The caller's own characters and corporations | Roster, then `/api/eve/names` | Unchanged; readable metadata |

**The sealed service.** At boot the workers read these whole tables from Neon: type names and categories, NPC stations with the names `resolveNpcStationNames` stores, system facts, implant dogma, the skill catalog, production modifiers, `wh_system_statics`, the wormhole codex and ship mass, `market_prices` and `adjusted_prices`. Every 10 minutes they read the versions and reload what changed. No worker makes a per-ID public query to Neon, Vercel or Convex. Statics placeholders and both resolvers read the in-memory table (Part 16). The Part 05 spike measures load time and heap size over this real set; no figure is assumed.

The workers do call ESI and EVE SSO per ID from inside the enclave, over TLS that ends there: `/universe/names` for nameless stations and holding locations, `/universe/structures/{id}` with a token, and structure search. CCP is the data source and sees these calls today. Results stay in enclave memory. The enclave never reuses `resolveEntityNames` or its remote cache.

**Mapper live prices.** When the mapper opens, the browser refreshes the fixed set of every live-recipe type in the site catalogue (about 54), on a timer rather than on jumps or signatures. `ScannerLivePricesProvider` and `SiteResourcesLive` read from that set. The viewed system's types are always included, so values do not change.

**Price sweep.** `seedTrackedTypes` seeds the union of today's tracked types and every published type with a market group. The daily `prices` step seeds the same before it sweeps. The sites ingest keeps seeding its rows. `seedUnpricedTypes` and its call are deleted. On-demand refresh updates only existing rows.

**Per-ID lookups that stay.**

| Lookup | What it reveals, and to whom | Why it stays |
|---|---|---|
| Market refresh routes, from the planner only | Type IDs of a public blueprint tree, to Vercel | The set comes from a public page. History for all 18k types would cost one ESI call per type. |
| `/api/sites/[id]`, only if the sites asset is too big | Which site was opened and when, in Vercel request logs | Accepted exposure: the choice comes from map content |
| `/api/eve/names` | Own characters and corporations; the Part 04 fallback where `characters` is undefined | Readable metadata |
| `/industry/[id]` page | A public blueprint page was viewed | Public page; telemetry normalised (Part 04) |
| Fuzzwork fallback | Type IDs, to a third party | Public prices; no system or character |
| `images.evetech.net` from the browser | Type, character and corp IDs, to CCP only | No LGI server sees them; CCP is the data source |
| Workers to ESI and EVE SSO | IDs, to CCP only, from inside the enclave | CCP is the data source; results never cached outside the enclave |

**Testing.** Route tests per asset: current version, 404 otherwise, cache headers. A test fails if an asset's body schema changes without its suffix bump. A browser test bumps a version while the page is open and checks new values appear without reload. A guard lists every route whose path or body carries IDs or search text, whatever its authz tag, and fails on anything outside the exception table or a named replacement. Fixtures check planner results match today's routes (Part 21) and that an unpublished ship type resolves. A seeding test runs from SDE fixtures, and a guard confirms no holdings path writes `market_prices`. Worker tests cover loading from real Postgres and reloading on a version change. Playwright smoke journeys pass unchanged. `pnpm check` on every PR and `pnpm verify` before promote, with zero Fallow findings.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| SDE tables (`eve_*`, `industry_*`, `blueprint_*`, dogma) | Yes | No | LGI server ingest; assets in browser; whole tables in sealed service |
| `market_prices`, `market_history`, `market_history_meta` | Yes (rows from SDE marketable types and sites ingest) | No | LGI server; sealed service reads whole |
| `industry_cost_indices`, `adjusted_prices` | Yes | No | LGI server (daily cron); planner in browser |
| `wh_statics_snapshots`, `wh_system_statics` | Yes | No | LGI server; browser and sealed service read whole |
| Sites guide tables | Yes | No | LGI server |
| Asset versions and manifest | Yes | No | LGI server |
| Tracked pilots' names | Yes (`mapAccess.characters`) | No | LGI server (Convex); joined in browser |
| Which statics, ships, systems, stations or rigs a user looked up | Not sent | — | Browser or sealed service, from whole tables |
| Worker per-ID ESI results | Not stored by LGI | — | Sealed service only |

## Hard rules

1. [Agreed] Public data stays readable on LGI's servers. Only content is encrypted (principle 2).
2. [Agreed] Users notice nothing: same pages, values and timings (principle 1).
3. [Agreed] LGI's servers keep ingesting and serving public data (principle 3).
4. [Proposed] Ingest stays on today's schedules. The daily prices step adds seeding.
5. [Proposed] Browsers do not call ESI or third parties for public data, except CCP's image server.
6. [Proposed] Everything stays on lgi.tools, with no data subdomain. The plan brief treats this as fixed; the README lists it as a working note to settle.
7. [Proposed] No request reaching Vercel, Convex, Neon or a third party other than CCP carries a system, type, character, structure ID or search text that private content selected. Only the exception table is allowed; adding to it means amending this part.
8. [Proposed] Workers may call ESI and EVE SSO per ID from inside the enclave, over TLS ending there. Results are never cached outside the enclave. The enclave never uses `resolveEntityNames` or Vercel's cache.
9. [Proposed] Public assets use one shape: `no-store` manifest, version in the path, immutable caching, 404 on any other version. A version is the data version plus a code-owned shape suffix, bumped on every body schema change.
10. [Proposed] Clients re-check the manifest on tab visibility and at least hourly, and replace changed assets without reload.
11. [Proposed] The manifest reads only cached values; no live Neon query per page load.
12. [Proposed] The sealed service reads public tables whole from Neon, holds them in memory and reloads on a version change. It makes no per-ID public query to Neon, Vercel or Convex.
13. [Proposed] `market_prices` rows are seeded only from SDE marketable types and the curated sites ingest. No path seeds from holdings, views or other user interest.
14. [Proposed] The mapper's live prices refresh a fixed type set on a timer, never per system or jump.
15. [Proposed] Public data never decides key release or access. Tampering can affect correctness, not who reads content.
16. [Proposed] A deleted per-ID route goes in the same PR as its replacement, or the next one.

## Assumptions

- **Asset sizes are as estimated.** Check: staging response sizes per asset, including `production-modifiers` and all site details, before merging.
- **Browsers and Vercel's CDN honour the immutable URLs.** Check: response headers and CDN hits on staging.
- **The sealed service can load the listed tables within its memory budget.** Check: load time and heap size in the Part 05 spike.
- **The tracked-type set already pushes the sweep onto the bulk path.** Check: `fetched` and `esiCount` in `price_refresh_finished` before and after seeding.
- **The prices step still fits if the region dump fails.** About 18k types means about 120 Fuzzwork batches. Check: on staging, force a region-dump failure with the full set and confirm the prices step and later steps fit within `daily-batch`'s 300 s.

## What users see

Nothing new. Statics, ship names, pilot names, build costs, prices and images appear where and when they do today, including in tabs left open across the daily refresh.

## Questions for the owner

1. **Which per-ID lookups stay?** *Recommend the exception table as written.*
2. **How wide is the type-name asset?** Ships only (about 10–15 KB), or every type name (about 300 KB)? *Recommend ships only. Other type names are resolved by the workers.*
3. **Where does the sealed service get public data?** Neon, or the same lgi.tools assets? *Recommend Neon. No Vercel hop, and the enclave already holds a Neon connection.*
4. **How often does the sealed service check versions?** *Recommend every 10 minutes. Statics change weekly at most, prices and indices daily.*
5. **Sites detail: whole asset or per-ID route?** *Recommend the asset if all details are under about 100 KB gzip; otherwise keep the route and accept the log exposure.*
