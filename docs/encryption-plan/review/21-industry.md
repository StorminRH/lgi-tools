# Part 21: Industry planner, jobs and structures

**Status:** Draft for owner review

**Carried from the Part 4 review (2026-10-08), private `'use cache'` audit:** today's cached private reads live only in per-instance memory and rarely hit on serverless (Next docs: entries "rarely survive between requests"; no hit-rate metric exists). Tag invalidation is per instance, so a cron save leaves other warm instances serving old 'hours' data (assets, blueprints, structures, holdings, corp snapshot) for up to an hour; the board already bypasses the cache for net worth (`board-view.ts:82-83`). The board reads each character's `character_skills` row twice (queue and skill levels); one query would do. `revalidateTag` on rig saves (`owned-structures/queries.ts:162`) invalidates nothing useful. Private content never moves to `'use cache: remote'`.

## In one paragraph

The planner's maths already runs in the browser. Encryption changes only where its inputs come from. Private inputs (skill levels, owned blueprints and assets, corp structures with their rigs and tax, job boards) become sealed views that the workers build at sync time. LGI serves them as ciphertext, the browser decrypts them with the user key it already holds, and the planner filters them locally. Public inputs that are fetched per ID today, and so reveal where a user builds, ship as whole versioned tables. Corp rigs and tax become one sealed document per corp, validated and written by the sealed service. Structure search runs in the workers with the sealed token. Users see nothing new.

## How it works today

- **Planner reads.** After the page draws, the planner fires several reads through `useResourceRead`. Each one hits Neon on Vercel and returns plaintext:
  - `POST /api/industry/owned-blueprints` sends every blueprint type ID in the build tree. `POST /api/industry/owned-assets` sends every material type ID. Both resolve the viewer's corp grants on the server, return only the requested types, resolve names only for those types (`collectDetailNameIds`), and schedule a refresh with `after()`.
  - `GET /api/industry/team-skill-levels` returns every linked character's skill levels, for profile members (`use-planner-profile.ts`).
  - `GET /api/account/structures` merges custom structures, corp structures with their rigs and tax, and SDE modifiers looked up by hull and rig type ID. It runs the pure `buildAvailableStructures` on the server.
  - `POST /api/industry/build-location` sends one system ID and the blueprint ID. It returns that system's NPC industry stations, its cost indices and adjusted prices for the tree's types. `POST /api/industry/cost-indices` sends up to 64 system IDs where a profile installs component jobs (`use-component-fee-sources.ts`). Both reveal where a user builds.
- **Public data already loaded whole.** `/api/industry/blueprints`, `/stations` and `/systems` return full indexes, held in a module-level promise. The `/industry/[id]` page renders the blueprint tree and Jita pricing on the server. It is a public SEO page.
- **Corp structures page data.** `getCorpStructuresPageData` renders `CorpStructurePageView[]` as plaintext server props, including structures with systems, names, `rigTypeIds` and `taxPct`. Callers: the industry layout's structures drawer (`CustomStructuresContent.tsx`, behind the "Loading custom structures" skeleton), which feeds `StructuresManager` and `CorpRigEditor`, and `/settings/corporations` (`page.tsx:83`).
- **Slots and jobs.** `GET /api/account/industry-slots` returns `slotCapacity` output, a filtered `industryLevels` map and a `synced` flag per character. `use-slots-live.ts` retries every 5 seconds, up to 24 times, while any character is unsynced. `/api/account/industry-jobs` and `/corp-industry-jobs` use `useLiveDataset`. Type names are resolved on the server. `CorpJobsBoard` looks up installer names through `/api/eve/names`.
- **Corp rigs and tax.** `corp_structure_rigs` holds `rig_type_ids` and `tax_pct`, keyed by (corporation, structure). Corp structures refresh on view (`scheduleCorpStructuresRefresh` in `after()`) behind a one-hour freshness gate. `saveCorpStructures` replaces only `corp_structures`, so the authored rows survive. Turning sharing off deletes nothing: `POST /api/account/corp-sharing` only upserts the flag, and the dialog says "Nothing is deleted." The "Wiped only when sharing is disabled" schema comment is stale, not the spec. `POST /api/account/corp-structures/rigs` checks the role with `stationManagerGate` (Station Manager or Director), then `validateCorpStructureRigs` (the structure belongs to the corp; the rigs fit the hull), then upserts one keyed row, so saves to different structures never conflict.
- **Structure search.** A 250 ms debounced typeahead (`use-structure-search.ts`) with an `AbortSignal`. `searchUpwellStructures` vends each linked character's access token on Vercel and calls ESI character search and `/universe/structures/{id}`. An ESI failure returns 503 `structure_search_unavailable`.
- **Location failures.** `use-planner-location-writes.ts` shows a per-system failure notice (`failureSystemId`) with `retryLocation`; `use-component-fee-sources.ts` marks a fee source `failed`.
- **Unused routes.** `/api/industry/skill-levels` has no client caller; only telemetry, a coverage test and the idempotency registry name it. `GET /api/account/corp-structures` (`corpStructuresEndpoint`) is referenced only by its route and tests.
- **Caches.** `'use cache'` wraps private reads in `industry-jobs/queries.ts` (minutes), `skill-queue/queries.ts` (minutes), `owned-structures/queries.ts` (hours) and `owned-blueprints/queries.ts` (hours). Part 22 covers owned-assets and corp-holdings.

Files: `src/app/api/{industry,account}/**/route.ts` (industry, structures, corp-structures, rigs, corp-sharing, slots, jobs), `src/app/(site)/industry/{layout,CustomStructuresContent}.tsx`, `src/app/(site)/settings/corporations/{page,corp-sharing-card}.tsx`, `src/features/industry-planner/**` (queries, available structures, location and fee hooks, profile), `src/features/industry-jobs/*`, `src/features/owned-structures/**`, `src/features/owned-{blueprints,assets}/{detail,queries}.ts`, `src/features/custom-structures/use-structure-search.ts`, `src/composition/sync/*-sync.ts`, `src/composition/{structure-search,corp-role-gates}.ts`, `src/lib/esi-datasets/entries.ts`.

## What changes

Nothing visible changes. Behind the same pages:

- Private planner inputs arrive as sealed views, not plaintext route responses. Indexes ship whole because LGI cannot filter sealed rows.
- Build-location and cost-index lookups are replaced by whole public tables. The browser picks the systems it needs.
- `buildAvailableStructures` runs in the browser. Part 20 already moves the custom half there. The structures drawer's corp rows come from the decrypted view, not server props.
- Rig and tax saves become sealed requests to the workers.
- Structure search runs in the workers.
- Corp installer names come inside the sealed corp jobs view, not from `/api/eve/names`.

## Design

**Planner views.** These follow Part 19's precomputed pattern: the `personal_views` table, sealed under the user key, rebuilt in the same worker transaction as the source document. Corp-scoped rows are built only after the workers filter to the viewer's grant (Part 23 sets their storage shape). Validation has two steps. Each view decrypts to its own declared view schema and is validated with it. The browser derivation (`buildOwnedDetail`, `buildOwnedAssetDetail`, `slotCapacity` plus the industry-skill filter) then produces today's response shape, which the existing endpoint zod schema validates before components see it. Components do not change.

| View kind | Scope | Built from | Replaces | Rebuilt when |
|---|---|---|---|---|
| `skills` (Part 19) | Character | `character_skills` | `team-skill-levels`, `industry-slots` | Skills sync |
| `jobs` (Part 19) | Character | `character_industry_jobs` | `/api/account/industry-jobs` | Jobs sync |
| `blueprint_index` | Character, and corp per viewer | `owned_blueprints`, corp holding index for `by-location` grants | `owned-blueprints` | Blueprint or corp asset sync, grant change |
| `holding_index` | Character, and corp per viewer | `owned_assets` (Part 22 document) | `owned-assets` | Asset sync, grant change |
| `corp_structures` | Corp per viewer | Sealed `corp_structures` plus rig document | Corp half of `/api/account/structures` | On-view refresh behind a one-hour freshness gate (enqueued per Part 19), rig save, grant or sharing change |
| `corp_jobs` | Corp per viewer | `corp_industry_jobs`, installer names | `/api/account/corp-industry-jobs` | Corp jobs sync, grant change |

The two index views hold every type the owner has. Names are resolved inside the enclave. The browser filters by the tree's type IDs with `buildOwnedDetail` and `buildOwnedAssetDetail`. These are already shared pure modules; they only need importing into the browser bundle and the enclave. If an index passes the size threshold in Assumptions, the workers shard it by type-ID bucket so the browser fetches only the buckets the tree needs, or the browser falls back to a sealed request that filters in enclave memory and replies sealed.

**Structures drawer and settings page.** The server keeps rendering the readable parts of `CorpStructurePageView` (corporation ID and name, `structureAccess`, `canManageSharing`, `sharing`, `lastRefreshedAt`). Structure rows come from the decrypted `corp_structures` view, rendered in the browser inside the drawer's existing Suspense and "Loading custom structures" skeleton. No new placeholder. Part 20 owns the custom half; Part 23 owns the settings page.

**Loading without new waits.**

1. The user key is already in IndexedDB from login (Part 09). Opening it takes milliseconds, and decryption runs in the crypto worker (Part 26).
2. The same hooks fetch at the same moments. They call one GET per view kind, with no body. The route returns all of the viewer's rows of that kind with readable `version` values. It enqueues refresh jobs for stale datasets, as Part 19's read path does.
3. Decrypted views live in the existing remembered-read memory across client navigation. They are never written to storage.
4. The industry layout prefetches views and public tables at idle only for a signed-in user who has a profile selected or a build system chosen. Anonymous visitors, including on `/industry/[id]`, fetch nothing new.
5. Cold handling is unchanged. A missing view behaves as today's unsynced state, and the existing 5-second reconcile picks up the rebuilt view.
6. A failed table or view load surfaces through the existing `failureSystemId` notice and `retryLocation` (or the fee source's `failed` state), with no new copy.

**Public tables.** These use the `/api/universe/assets/[version]` pattern: a manifest gives the version, and the immutable body is cached by the browser.

| Lookup today | Becomes | Version changes |
|---|---|---|
| `build-location`: stations per system | Industry station table (ID, system, name, operation, manufacturing and research flags), extending today's stations index | SDE ingest |
| `build-location` and `cost-indices`: cost indices | Whole `industry_cost_indices` table | Daily indices cron |
| `build-location`: adjusted prices | Whole `adjusted_prices` table | Daily indices cron |
| `getProductionModifiers` by type | Structure hull and rig modifier table, plus target filter sets and capital hull IDs | SDE ingest |
| `/industry/[id]` page | Unchanged (public page, prices public) | — |

The browser keeps `getBuildLocation` and `getJobCostIndices` as pure functions over these tables. The two routes are deleted once the tables ship.

**Corp rigs and tax.**

- **Storage.** One sealed document per corp, `corp_structure_completions`. Readable columns: `corporation_id`, `version`, `updated_at`. Sealed content: a map from structure ID to `{rigTypeIds, taxPct, setAt}`, under the corp key. The enclave always loads all of a corp's rigs, and no Neon query ever needs a structure ID, so no blind index is needed (Part 02's rule). The structures refresh writes only the structures document, so authored values survive as today. The document persists when sharing is turned off, as today (nothing is deleted; the views stop including it).
- **Write.** `CorpRigEditor` sends a sealed request (Part 07) with `corporationId`, `structureId`, `rigTypeIds` and the three-state `taxPct`. The workers:
  1. authenticate the browser session key and re-check the role (Part 23);
  2. open the corp structures document;
  3. run `validateCorpStructureRigs` unchanged, against public SDE types and rigs;
  4. compare-and-swap on `version`. On a conflict, re-read the document, re-apply only this structure's entry and write again, up to five times. A conflict caused by another structure is never surfaced; last writer wins per structure, as today;
  5. rebuild members' `corp_structures` views;
  6. reply with today's response body.

  Validation must stay in the sealed service: unlike custom structures, a bad rig set changes other members' planners.

**Structure search.** `/api/account/custom-structures/search` becomes a sealed request. The term goes in, and the result list returns sealed to the browser session key. Each request carries a request ID, and the browser drops stale replies. The workers cancel or coalesce in-flight searches per browser session key, so fast typing does not spend ESI budget. An enclave outage returns today's 503 `structure_search_unavailable` problem, with no new copy. Token custody is Part 08. `structure-search.ts` moves into the workers unchanged.

**Dropped from older docs.** The `data.lgi.tools` origin and signed dataset manifests (Part 24); signed CorpSpace rig records checked by every reader; skills and slots computed from character vaults in the browser; the P3 milestone. Saved plans are dropped (Part 20).

**Risks.** First-ever loads download the public tables: a one-time cost, measured before shipping. Large holders, especially Directors with full corp grants, get a big index and many name lookups in the enclave. Corp views fan out on every corp sync, which is trivial at 18 users. During an enclave outage, pages still load from stored views, but rig saves and structure search pause (Part 05).

**Tests.** Unit tests for view builders and browser filters against today's route outputs (golden comparisons). Real-Postgres tests for rig compare-and-swap, survival across the structures refresh, survival across sharing off and back on, and two concurrent saves to different structures that both succeed. A network-log check that no industry request carries a system, type or structure ID outside the rule 4 exceptions. A failure-journey test for the location notice and retry. Today's planner smoke journeys, plus the structures drawer, must pass unchanged within timing budgets, including search-to-results (Part 32).

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Blueprint, station, system indexes; blueprint page and prices | All (public) | — | LGI server |
| Cost indices, adjusted prices, modifier table | All (public, whole tables) | — | LGI server builds; browser selects |
| Skill levels, slots | Sync timestamps, view `version` | Levels, slots | Sealed service; browser decrypts |
| Owned blueprint and holding indexes | Owner IDs, `version`, `built_at` | Types, ME/TE, quantities, locations, names | Sealed service; browser filters |
| Personal and corp job boards | Sync state, error codes | Jobs, installer names | Sealed service |
| Corp structures | `corporation_id`, sync state, page ETags | IDs, types, systems, names | Sealed service |
| Corp rigs and tax | `corporation_id`, `version`, `updated_at` | Rigs, tax, structure IDs, `setAt` | Sealed service (validate, write) |
| Available structures list | — | Inputs sealed | Browser |
| Structure search term and results | Request timing | Term, results | Sealed service |

## Hard rules

1. [Agreed] The planner, jobs and structures pages look, load and behave as today. No new prompts, spinners or copy.
2. [Agreed] Skills, blueprints, assets, structures, rigs, tax and jobs are never stored or cached readable on LGI's servers.
3. [Agreed] EVE tokens for structure search and syncs exist only in the sealed service.
4. [Proposed] No industry request to LGI carries a private-interest system, type or structure ID in plain form. Public tables ship whole. Exceptions match Part 04 rule 5: the `/industry/[id]` URL and its planner lookups (an owner question here, not yet agreed), public site pages, `/api/eve/names` for corp installers until Phase 4, and the names fallback where `mapAccess.characters` is undefined.
5. [Proposed] Each sealed view is validated with its own view schema after decryption. The browser derivation's output is validated with the existing endpoint zod schema before components see it.
6. [Proposed] Corp-derived rows reach a browser only after the workers filter them to the viewer's current grant.
7. [Proposed] Rig and tax writes are validated in the sealed service: role, structure membership and rig fit. The browser may pre-check, but cannot be trusted.
8. [Proposed] Rigs live in one sealed document per corp, never touched by the structures replace and never deleted when sharing is turned off. Rig-save conflicts are retried in the workers and never reach the browser. No blind index unless a Neon query needs one.
9. [Proposed] Views are rebuilt in the same transaction as their source document. Browsers ignore a `version` lower than one already seen.
10. [Proposed] Decrypted industry data lives in memory only, never in `localStorage` or IndexedDB.
11. [Proposed] Pure modules (`buildAvailableStructures`, `slotCapacity`, `validateCorpStructureRigs`, owned-detail builders, fee and cost functions) stay single shared modules built into both the app and the enclave, with no forks.
12. [Proposed] `'use cache'` is removed from private industry reads, including `owned-blueprints/queries.ts` (Part 04; Part 22 for owned-assets and corp-holdings).
13. [Proposed] Idle prefetch runs only for a signed-in user with a profile selected or a build system chosen. Anonymous visitors fetch nothing new.
14. [Proposed] Structure search replies carry a request ID; stale replies are dropped and in-flight searches are cancelled or coalesced per browser session key.
15. [Agreed] `pnpm check` and `pnpm verify` pass with zero Fallow findings, covering the new code.

## Assumptions

- **The public tables are small enough to load whole.** Check: measure the gzip size of `industry_cost_indices`, `adjusted_prices`, industry stations and production modifiers. The expectation is low hundreds of KB in total.
- **The largest indexes stay small enough to ship whole.** Check: build the largest personal and corp holding index and blueprint set; measure size, decrypt time and filter time on a low-end device, and count the name lookups. Proposed threshold: 2 MB gzipped or 200 ms decrypt plus filter. Above it, shard by type-ID bucket or use the sealed-request fallback.
- **The browser holds the user key on every industry page.** Check against Part 09's session rules.
- **No other caller needs `/api/industry/skill-levels`.** Check: repo grep (done) plus 30 days of Vercel logs.
- **Running `buildOwnedDetail` and `buildOwnedAssetDetail` in the browser changes no output.** Check with golden tests that compare derived output with today's route output.

## What users see

Nothing new. The one difference users could notice: the first planner visit after a daily table update downloads a little more data. Prefetching at idle for signed-in planners should hide this.

## Questions for the owner

1. **How do planner overlays load?** Precomputed sealed views (recommended), or live sealed-service queries per page load (adds a hop, and fails during an outage)? For indexes above the size threshold: shard by type-ID bucket (recommended) or a sealed request that filters in enclave memory.
2. **Where are available structures composed?** In the browser from decrypted inputs (recommended: saving a custom structure shows up at once), or in the workers (needs a rebuild after every custom save)?
3. **How are rigs stored?** One sealed document per corp (recommended), or 06's per-structure rows with a blind structure ID (row upserts without compare-and-swap, but they reveal counts and edit times per structure)?
4. **Which lookups become bulk tables?** Recommended: stations, cost indices, adjusted prices and modifiers, with the public blueprint page kept per ID.
5. **Drop `/api/industry/skill-levels` and `GET /api/account/corp-structures`?** Recommended: yes, since neither has a client caller; do not convert them to views.
6. **Is the viewed blueprint accepted metadata?** The `/industry/[id]` URL reveals which blueprint a user views. Recommended: accept it, normalised in telemetry per Part 04. No README decision covers it.
