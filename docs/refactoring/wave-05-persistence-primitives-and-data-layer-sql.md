# Wave 5: Persistence primitives and data-layer SQL

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 4: Formatting, dates and names have one home](wave-04-formatting-dates-and-names-have-one-home.md) · [Index](README.md#roadmap) · [Wave 6: Config, env, ids and shared domain vocabularies](wave-06-config-env-ids-and-shared-domain-vocabularies.md) →

Give src/db and the data layer one owner per SQL concern, in this order:
1. Typed excluded() and executeRows.
2. directDatabase, then the advisory-lock registry (authBackfill recorded as retired after P296), then lockUserRows.
3. ownerKeyWhere, then direct-returning sync-state readers.
4. Chunk and seed placeholder prices, sde-io streamJsonl/makeBatchInserter, coerce helpers, typed jsonb, then single-read tree-resolver inputs.
5. Telemetry SQL fragments and ESI refresh status sets.
6. Map lifecycle predicates and the authorization cutoff.

Run db suites with Postgres up.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P230](#p230) | Share one typed excluded(column) helper for Drizzle upserts and delete the five private copies | persistence | S | low | medium | — |
| ☑ | [P223](#p223) | Move mapAuthorizationRows to src/lib as executeRows and use it at every inline Array.isArray(result) normalization | persistence | S | low | medium | — |
| ☑ | [P220](#p220) | Add a memoized directDatabase() to src/db and route every interactive-transaction site and cron context through it | persistence | M | low | medium | — |
| ☑ | [P237](#p237) | Register every session advisory-lock key as a plain number in src/db/advisory-lock.ts | persistence | S | low | low | [P220](#p220), [P296](wave-01-quick-wins-delete-dead-code-fix-small.md#p296) |
| ☑ | [P242](#p242) | Export lockUserRows(tx, ids) from src/db/locked-user.ts and build every user-row lock on it | persistence | S | low | low | [P220](#p220) |
| ☑ | [P228](#p228) | Add ownerKeyWhere beside ownerSyncStateColumns and return sync-state rows directly | persistence | S | low | low | — |
| ☑ | [P327](#p327) | Return selected rows directly from feature sync-state readers and sort corp job syncs in SQL | simplification | S | low | low | [P228](#p228) |
| ☑ | [P103](#p103) | Seed placeholder prices through one chunked function, route the hand-rolled batch loops through lib chunk, and build eve-data streamInsert on sde-io primitives | generic-utility | M | low | medium | — |
| ☑ | [P172](#p172) | Make data/eve-data stream JSONL and batch inserts through sde-io, and route chunk loops and the upsert excluded() helper through src/lib | server-pipeline | M | low | medium | [P103](#p103), [P230](#p230) |
| ☐ | [P264](#p264) | Give data/eve-data/coerce.ts asRecord, mapRecords and dogmaAttributePairs, and route every SDE parser through them | contracts-validation | S | low | low | [P172](#p172) |
| ☐ | [P233](#p233) | Type the eve-data jsonb columns with $type<T>() and validate blueprint activities once at ingest | persistence | M | low | medium | [P264](#p264) |
| ☐ | [P293](#p293) | Read tree-resolver inputs once per resolveAllTrees and derive the hash, indexes and blueprint ids from them | efficiency | S | low | low | [P233](#p233), [P172](#p172) |
| ☐ | [P235](#p235) | Move the repeated usage_logs fragments (day, outcome, summedInt, referrer predicates, refreshed-price-cron filter) into telemetry/sql.ts and drop getFallbackRate's redundant totals query | persistence | S | low | medium | — |
| ☐ | [P236](#p236) | Derive ESI refresh status sets from one constant module and claim due jobs in one UPDATE | persistence | S | low | low | — |
| ☐ | [P232](#p232) | Give map lifecycle predicates and the active-admin selection one home, and write archive/restore SETs from the lifecycle contract | persistence | S | low | medium | [P223](#p223) |
| ☐ | [P225](#p225) | Derive the authorization-failure cutoff and the delayed check from authorization-policy instead of recomputing them at each site | persistence | S | low | low | [P223](#p223) |

<a id="p230"></a>

## P230: Share one typed excluded(column) helper for Drizzle upserts and delete the five private copies

- **Status:** [x] done
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** -15 (five private helpers), two inline strings replaced, about 40 call sites rewritten in place (shorter with excludedSet); +20 lib and +25 test
- **Depends on:** —
- **Existing primitive:** `src/lib/db-columns.ts (existing home for shared Drizzle helpers)`

**Problem.** Five data modules each define `excluded(column: string) => sql.raw('excluded.' + column)`, and two more modules inline raw `excluded.<col>`. Four of the copies are fed about 40 hand-typed snake_case strings (market-prices 12, gsc 24, market-history 8, industry-indices 3), so renaming a column in a schema still compiles and fails only when the upsert runs. wh-observations is the drift-proof copy, because it passes table.column.name.

**Sites (8).**

- [`src/data/wh-observations/queries.ts:23-25, 27-51`](../../src/data/wh-observations/queries.ts#L23-L25) — correct form: names from whObservations.<col>.name; the excluded values are reused in the 'is distinct from' setWhere
- [`src/data/industry-indices/ingest.ts:9-11, 48-51, 74-80`](../../src/data/industry-indices/ingest.ts#L9-L11) — private copy; 'cost_index', 'updated_at', 'adjusted_price', 'average_price'
- [`src/data/market-history/ingest.ts:13-15, 73-82, 97-105`](../../src/data/market-history/ingest.ts#L13-L15) — private copy; 8 hand-typed names across two upserts
- [`src/data/market-prices/ingest.ts:20-22, 109-126`](../../src/data/market-prices/ingest.ts#L20-L22) — private copy; 12 hand-typed names
- [`src/data/gsc/ingest.ts:22-24, 166-182, 229-238, 279-293`](../../src/data/gsc/ingest.ts#L22-L24) — private copy; three upserts with 24 hand-typed names
- [`src/data/corp-holdings/queries.ts:109-116`](../../src/data/corp-holdings/queries.ts#L109-L116) — inline sql`excluded.base_id`
- [`src/features/character-sheet/queries.ts:39-47`](../../src/features/character-sheet/queries.ts#L39-L47) — inline `${characterSheets.sections} \|\| excluded.sections`
- [`src/platform/purge/merge.ts:22-28, 44-47`](../../src/platform/purge/merge.ts#L22-L28) — existing precedent for sql.identifier(column.name)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/net-worth/queries.ts:19-57`](../../src/features/net-worth/queries.ts#L19-L57) — Whole statement is a raw CTE that also hand-types the INSERT column list. Swapping only EXCLUDED would not make it rename-safe.
- [`src/platform/auth/corp-roles-store.ts:27-47`](../../src/platform/auth/corp-roles-store.ts#L27-L47) — Raw CTE upsert with a hand-typed column list; same reason.
- [`src/data/maps/queries.ts:538-546`](../../src/data/maps/queries.ts#L538-L546) — Raw INSERT … ON CONFLICT with enum casts; same reason.

</details>

**Home.** `src/lib/db-upsert.ts (new). If the batch-writer opportunity adds a chunked-insert helper, it can share this file.`

**Boundary check.** The home is in the lib zone, whose rule is { from: 'lib', allow: ['config'] }. It imports only drizzle-orm and drizzle-orm/pg-core (packages), as lib/batched-delete.ts and lib/db-columns.ts already do. Consumers: data/industry-indices, data/market-history, data/market-prices, data/gsc, data/wh-observations and data/corp-holdings, legal under the 'data' rule (allows 'lib'); features/character-sheet, legal under the 'features' rule (allows 'lib').

**API sketch.**

```ts
export function excluded(column: AnyPgColumn): SQL; // sql`excluded.${sql.identifier(column.name)}`
export function excludedSet<T extends PgTable, K extends keyof T['_']['columns'] & string>(
  table: T, keys: readonly K[],
): Record<K, SQL>; // Object.fromEntries(keys.map(k => [k, excluded(getTableColumns(table)[k])])), explicit keys only
```

**Migration steps.**

1. Add src/lib/db-upsert.ts with excluded and excludedSet, plus src/lib/db-upsert.test.ts, which renders through new PgDialect().sqlToQuery and expects 'excluded."cost_index"' with no params, and checks that excludedSet returns exactly the given keys.
2. Migrate wh-observations/queries.ts first, because it already passes Drizzle columns. Change excluded(whObservations.x.name) to excluded(whObservations.x) and keep the local observationConflict and setWhere.
3. Migrate industry-indices, market-history, market-prices and gsc. Delete each private excluded(), and replace the string calls with excluded(table.col) or excludedSet(table, ['bestBuy', …]).
4. Replace the inline raw strings: corp-holdings/queries.ts:115 becomes baseId: excluded(corpMemberBases.baseId), and character-sheet/queries.ts:45 becomes sql`${characterSheets.sections} || ${excluded(characterSheets.sections)}`.
5. Leave the raw CTE statements (net-worth, corp-roles-store, maps) as they are.

**Tests.** New: src/lib/db-upsert.test.ts. Existing guards: src/data/wh-observations/queries.db.test.ts (reconcile re-upsert), src/data/gsc/queries.db.test.ts, src/data/market-prices/seed.db.test.ts and queries.db.test.ts, src/data/market-history/queries.db.test.ts, src/data/corp-holdings/queries.db.test.ts (member-base upsert), src/features/character-sheet/queries.db.test.ts (section merge). The mocked ingest tests (industry-indices/ingest.test.ts, market-prices/ingest.test.ts, gsc/ingest.test.ts) only assert that onConflictDoUpdate was called, so they are unaffected. No test snapshots the 'excluded.' SQL text.

**Notes.** sql.identifier quotes the name (excluded."type", excluded."key", excluded."position"), which Postgres accepts and which is safer for reserved-ish names like these gsc columns. Keep the sets explicit. gsc_sitemaps.indexed is intentionally absent from the sitemaps set because sitemapToRecord never writes it, so an 'all non-key columns' helper would reset it to its default 0 on every conflict. That is why excludedSet takes explicit keys only. industry-indices sets updatedAt from excluded even though it is a constant parameter; behavior is the same, so leave it. All hand-typed names match their schemas today (I checked each one), so this is hardening rather than a bug fix.

<sub>Reported by: area:data-eve, area:data-services, area:lib-infra, concern:esi-sync, concern:generic-utils, concern:persistence, dupes-triage-1.</sub>

<a id="p223"></a>

## P223: Move mapAuthorizationRows to src/lib as executeRows and use it at every inline Array.isArray(result) normalization

- **Status:** [x] done
- **Category:** persistence · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -12 / +12 (helper moves; five inline ternaries removed)
- **Depends on:** —
- **Existing primitive:** `src/data/maps/authorization-sql.ts:mapAuthorizationRows; src/lib/db-types.ts:AnyPgDb`

**Problem.** Drizzle's execute() resolves to a row array on postgres-js (local LOCAL_DB_DRIVER=postgres-js, the direct client) but to `{ rows }` on neon-http (production pooled `db`). data/maps already wraps this as mapAuthorizationRows (21 references across 6 maps files), but its name and location hide it. affiliation-store (twice), corp-roles-store, location-tracking/merge-store and esi-refresh-jobs each re-inline `Array.isArray(result) ? result : result.rows`. Code written against the local driver that skips this passes locally and breaks on Neon HTTP.

**Verifier revision.** The normalizer is real and it is re-inlined at 5 sites in 4 files outside data/maps. Those modules cannot import it from data/maps today: platform/auth may import data, but this is a driver concern that has nothing to do with maps, and its maps-specific name keeps people from finding it. The tree-resolver claim does not hold. hasResolvedTrees is private and reached only from resolveAllTrees(db: PostgresJsDb) (tree-resolver.ts:416, call at 423), so the driver is always postgres-js and nothing breaks at runtime. The right fix there is to tighten its parameter to PostgresJsDb, matching sde-pipeline.summarizeMarketPricesRowCount, not to route it through executeRows. Rename the 21 references rather than keep mapAuthorizationRows as an alias, so one name remains. Home: a new src/lib/db-execute.ts rather than the type-only db-types.ts; both are legal.

**Sites (7).**

- [`src/data/maps/authorization-sql.ts:13-19`](../../src/data/maps/authorization-sql.ts#L13-L19) — mapAuthorizationRows: the normalizer to promote
- [`src/platform/auth/affiliation-store.ts:121-131`](../../src/platform/auth/affiliation-store.ts#L121-L131) — captureAffiliationObservedAt: inline normalization at 125
- [`src/platform/auth/affiliation-store.ts:144-147, 184-188`](../../src/platform/auth/affiliation-store.ts#L144-L147) — updateAffiliations: inline normalization at 184
- [`src/platform/auth/corp-roles-store.ts:27-48`](../../src/platform/auth/corp-roles-store.ts#L27-L48) — inline normalization at 48
- [`src/data/location-tracking/merge-store.ts:29-39`](../../src/data/location-tracking/merge-store.ts#L29-L39) — inline normalization at 37, then bigint-string coercion
- [`src/data/esi-refresh-jobs/queries.ts:239-275`](../../src/data/esi-refresh-jobs/queries.ts#L239-L275) — inline normalization at 273
- [`src/platform/purge/merge.ts:92-94`](../../src/platform/purge/merge.ts#L92-L94) — private resultRows; platform/purge's allow-list is empty, so it must stay

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/tree-resolver.ts:344-349`](../../src/data/eve-data/tree-resolver.ts#L344-L349) — Not a live bug: the only caller is resolveAllTrees(db: PostgresJsDb) at 416/423. Tighten the parameter type to PostgresJsDb instead.
- [`src/composition/pipelines/sde-pipeline.ts:70-73`](../../src/composition/pipelines/sde-pipeline.ts#L70-L73) — array destructure is correct on a PostgresJsDb parameter
- [`src/scripts/ingest-sde-if-empty.ts:57`](../../src/scripts/ingest-sde-if-empty.ts#L57) — postgres-js only; destructure is correct
- [`src/scripts/sde-ingest-io.ts:10`](../../src/scripts/sde-ingest-io.ts#L10) — postgres-js only
- [`src/data/eve-data/station-names.ts:26-31`](../../src/data/eve-data/station-names.ts#L26-L31) — result ignored
- [`src/features/net-worth/queries.ts:23`](../../src/features/net-worth/queries.ts#L23) — result ignored

</details>

**Home.** `src/lib/db-execute.ts (new; next to src/lib/db-types.ts and the batched-delete.ts precedent)`

**Boundary check.** Home zone is lib. Rule lib -> [config], and the file imports only drizzle-orm (a package) and the type ./db-types (same zone), so it is legal. Consumers: data/maps and data/location-tracking and data/esi-refresh-jobs (data allows lib); platform/auth affiliation-store and corp-roles-store (platform/auth allows lib). composition, features, db, api and scripts all allow lib too, so future callers are covered. platform/purge (allow []) is the one zone that cannot import it and keeps its private copy.

**API sketch.**

```ts
// src/lib/db-execute.ts
import type { SQL } from 'drizzle-orm';
import type { AnyPgDb } from './db-types';
/** Rows from database.execute on either driver: postgres-js returns an array, neon-http returns { rows }. */
export async function executeRows<T extends Record<string, unknown>>(database: AnyPgDb, query: SQL): Promise<T[]> {
  const result = await database.execute<T>(query);
  return Array.isArray(result) ? result : result.rows;
}
```

**Migration steps.**

1. Create src/lib/db-execute.ts with the body of mapAuthorizationRows moved verbatim, plus src/lib/db-execute.test.ts.
2. Rename every mapAuthorizationRows reference to executeRows (blocks.ts, character-scoping.ts, lifecycle.ts, purge.ts, queries.ts) and delete the export from authorization-sql.ts. No test mocks it.
3. Replace the inline ternaries. affiliation-store:121-125 becomes `const rows = await executeRows<{ now: string }>(db, sql`...`)`, and the same applies at 144-188. Then corp-roles-store:27-48 (`(await executeRows(db, sql`...`)).length > 0`), merge-store:30-37 (keep the Number(characterId) coercion), and esi-refresh-jobs:239-273.
4. Separately, change tree-resolver.hasResolvedTrees(db: AnyPgDb) to PostgresJsDb so its type matches the only caller.

**Tests.** New src/lib/db-execute.test.ts: an array result comes back as-is, and a { rows } result comes back as .rows (both via a stub database whose execute resolves each shape). Existing guards: affiliation-store.db.test.ts, corp-roles-store.db.test.ts, location-tracking/merge-store.db.test.ts, esi-refresh-jobs.db.test.ts and queue-ops.test.ts, data/maps tests, map-character-scoping.db.test.ts.

**Notes.** Driver typing: platform/auth passes `db` (typed as neon-http Db); maps already passes it as AnyPgDb through default parameters, so the signature accepts it. Keep the caller-side coercions: merge-store converts characterId from number | string with Number(), and affiliation-store validates `now` as a non-empty string.

<sub>Reported by: area:data-eve, area:data-services, area:platform, concern:persistence.</sub>

<a id="p220"></a>

## P220: Add a memoized directDatabase() to src/db and route every interactive-transaction site and cron context through it

- **Status:** [x] done
- **Category:** persistence · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -55 / +25 (12 drizzle imports, 5 pre-checks, 3 let/if blocks and 2 Sql-to-drizzle wrappers removed; one 8-line module and one test added)
- **Depends on:** —
- **Existing primitive:** `src/db/deletion-client.ts:deletionDatabase (pattern); src/db/index.ts:directClient; account-merge.ts:directDatabase (local)`

**Problem.** Interactive transactions need Drizzle over the unpooled postgres-js client, but src/db exports only the pooled `db` and the raw `directClient`. Ten modules build drizzle(directClient) inline: locked-user, account-merge (which already has a private directDatabase()), tracking-merge-retry, wh-statics-refresh (four times), corp-holdings saveCorpProfile, owned-assets saveCorpOwnedAssets, owned-blueprints saveOwnedBlueprints, maps applyAuthorizedMapGrantChange, and maps insertGrandfatherGrants, where the construction is a default parameter. Five of these also call resolveLockConnectionUrl() first, which is redundant because constructing Drizzle touches the proxy and getDirectClient validates the URL. CronWorkContext exposes only `client: Sql`, which is always directClient. All five cron consumers wrap it in drizzle, either directly (wh-statics twice per run, industry-indices, sde) or through data functions that accept Sql only to wrap it (refreshStalePrices, syncGsc).

**Verifier revision.** The core holds up. 13 drizzle(directClient) constructions in 10 files, plus 5 cron consumers, all re-derive one 'Drizzle over the direct client' handle, and account-merge already has a private directDatabase(). The claim that the caller-side resolveLockConnectionUrl() calls are redundant is correct. drizzle-orm/postgres-js construct() writes client.options.parsers (node_modules/drizzle-orm/postgres-js/driver.js:15-22), and isConfig reads data.constructor (node_modules/drizzle-orm/utils.js:125-127). Both go through the Proxy get trap, which calls getDirectClient() and then resolveLockConnectionUrl(), so drizzle(directClient) already throws the -pooler refusal when it is constructed. Revised scope: (1) Drop the plan to replace the `database === db` checks in owned-assets and corp-holdings. They answer a different question, 'standalone pooled write vs. inside the caller's transaction', which gates supersede handling and revalidateTag; they have nothing to do with the direct database. (2) maps/queries.ts:521 keeps its identity swap, which queries.test.ts:38-43 pins. (3) Drop the SDE Promise.all: it is one DB read and one HTTP call in a daily cron, so the saving is negligible. (4) Drop the script openScriptClient helper. Those are 1-4 line CLI clients with different pool sizes, a separate and low-value concern. (5) Add the missed sites: the refresh-prices and refresh-gsc declarations, plus refreshStalePrices and syncGsc, which take Sql only to wrap it in drizzle. (6) Make CronWorkContext carry a lazy `database` instead of `client`. All 5 consumers only ever wrap ctx.client in drizzle. An eager directDatabase() in workContext would build Drizzle over the fake directClient objects in the purge-maps, drain-esi and daily-batch route tests.

**Sites (22).**

- [`src/db/index.ts:88-95`](../../src/db/index.ts#L88-L95) — getDirectClient calls resolveLockConnectionUrl() on first touch of the proxy
- [`src/db/index.ts:139-143`](../../src/db/index.ts#L139-L143) — directClient Proxy: every property read lazily creates and validates the client
- [`src/db/deletion-client.ts:1-10`](../../src/db/deletion-client.ts#L1-L10) — memoized deletionDatabase() precedent to mirror
- [`src/db/locked-user.ts:7-17`](../../src/db/locked-user.ts#L7-L17) — resolveLockConnectionUrl(); drizzle(directClient).transaction
- [`src/composition/account-lifecycle/account-merge.ts:91-97`](../../src/composition/account-lifecycle/account-merge.ts#L91-L97) — private directDatabase() with redundant pre-check; deps.database ?? directDatabase()
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:45-52`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L45-L52) — conditional pre-check, then database ?? drizzle(directClient)
- [`src/composition/wh-statics-refresh.ts:88-110`](../../src/composition/wh-statics-refresh.ts#L88-L110) — four separate drizzle(directClient) constructions
- [`src/data/corp-holdings/queries.ts:84-95`](../../src/data/corp-holdings/queries.ts#L84-L95) — saveCorpProfile: let/if block with pre-check
- [`src/features/owned-assets/queries.ts:165-177`](../../src/features/owned-assets/queries.ts#L165-L177) — saveCorpOwnedAssets: same let/if block
- [`src/features/owned-blueprints/queries.ts:81-91`](../../src/features/owned-blueprints/queries.ts#L81-L91) — saveOwnedBlueprints: same let/if block
- [`src/data/maps/queries.ts:509-530`](../../src/data/maps/queries.ts#L509-L530) — line 521: database === db ? drizzle(directClient) : database (swap the HTTP db for a transaction-capable one)
- [`src/data/maps/character-scoping.ts:54-65`](../../src/data/maps/character-scoping.ts#L54-L65) — default parameter database: AnyPgDb = drizzle(directClient)
- [`src/composition/pipelines/cron-gate.ts:21-28`](../../src/composition/pipelines/cron-gate.ts#L21-L28) — CronWorkContext.client: Sql
- [`src/composition/pipelines/cron-gate.ts:71-81`](../../src/composition/pipelines/cron-gate.ts#L71-L81) — workContext always sets client: directClient
- [`src/app/api/cron/refresh-wh-statics/declaration.ts:34-35, 57-65`](../../src/app/api/cron/refresh-wh-statics/declaration.ts#L34-L35) — drizzle(client) in preLock and again in work
- [`src/app/api/cron/refresh-industry-indices/declaration.ts:20-21`](../../src/app/api/cron/refresh-industry-indices/declaration.ts#L20-L21) — drizzle(client)
- [`src/app/api/cron/refresh-sde/declaration.ts:17-21, 42-45, 75-78`](../../src/app/api/cron/refresh-sde/declaration.ts#L17-L21) — SdePreLock.db typed ReturnType<typeof drizzle>; drizzle(client) in preLock
- [`src/app/api/cron/refresh-prices/declaration.ts:25-26`](../../src/app/api/cron/refresh-prices/declaration.ts#L25-L26) — missed site: passes ctx.client to refreshStalePrices
- [`src/app/api/cron/refresh-gsc/declaration.ts:28-30`](../../src/app/api/cron/refresh-gsc/declaration.ts#L28-L30) — missed site: passes ctx.client to syncGsc
- [`src/data/market-prices/cache.ts:35-36`](../../src/data/market-prices/cache.ts#L35-L36) — missed site: refreshStalePrices(client: Sql) only does drizzle(client)
- [`src/data/gsc/ingest.ts:326-340`](../../src/data/gsc/ingest.ts#L326-L340) — missed site: syncGsc(client: Sql) only does drizzle(client)
- [`src/scripts/refresh-prices.ts:16-19, 35`](../../src/scripts/refresh-prices.ts#L16-L19) — script already has db = drizzle(client) but passes client to refreshStalePrices

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/owned-assets/queries.ts:142, 153`](../../src/features/owned-assets/queries.ts#L142) — database !== db / === db means 'not inside a caller transaction': it gates supersede and revalidateTag. Not a direct-database concern; leave it.
- [`src/data/corp-holdings/queries.ts:73, 76`](../../src/data/corp-holdings/queries.ts#L73) — same standalone-vs-transaction gate in saveHoldingNodes; leave it
- [`src/app/api/cron/refresh-sde/declaration.ts:43-45`](../../src/app/api/cron/refresh-sde/declaration.ts#L43-L45) — Promise.all over getSdeMetaValue and getRemoteSdeVersion saves one DB round trip in a daily cron; not a real efficiency problem
- [`src/scripts/script-runtime.ts:5-22`](../../src/scripts/script-runtime.ts#L5-L22) — script client construction is a separate concern
- [`src/scripts/refresh-sde.ts:24`](../../src/scripts/refresh-sde.ts#L24) — one-line postgres(resolveLockConnectionUrl(), {max:2}); a helper saves about a line per script
- [`src/scripts/check-wh-statics.ts:21-24`](../../src/scripts/check-wh-statics.ts#L21-L24) — same, max 1; low value, out of scope
- [`src/scripts/check-universe-assets.ts:41-44`](../../src/scripts/check-universe-assets.ts#L41-L44) — same, max 1; out of scope

</details>

**Home.** `src/db/direct-database.ts (new sibling of src/db/deletion-client.ts)`

**Boundary check.** Home zone is db. Rule db -> [lib, config] permits the type import from @/lib/db-types, and ./index is the same zone. Consumers: db/locked-user.ts (same zone); composition (account-merge, tracking-merge-retry, wh-statics-refresh, pipelines/cron-gate), where rule composition allows db; data (corp-holdings, maps/queries, maps/character-scoping), where data allows db; features (owned-assets, owned-blueprints), where features allows db. The cron declarations stop importing drizzle and read ctx.database; api already allows composition. data/market-prices and data/gsc take PostgresJsDb from lib (data allows lib). scripts/refresh-prices passes its own Drizzle instance (scripts allows data).

**API sketch.**

```ts
// src/db/direct-database.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDb } from '@/lib/db-types';
import { directClient } from './index';
let database: PostgresJsDb | undefined;
/** Drizzle over the direct (unpooled) client, for interactive transactions. Validates the endpoint on first call. */
export function directDatabase(): PostgresJsDb { database ??= drizzle(directClient); return database; }

// cron-gate.ts
export type CronWorkContext = { readonly database: PostgresJsDb; reserved?: ReservedConnection; record: ... };
// workContext: { get database() { return directDatabase(); }, reserved, record }

// data
export async function refreshStalePrices(database: PostgresJsDb): Promise<CachedRefreshResult>
export async function syncGsc(database: PostgresJsDb, sitemapUrls: string[]): Promise<GscSyncSummary>
```

**Migration steps.**

1. Add src/db/direct-database.ts as sketched: lazy, memoized with ??=, nothing constructed at module load. Add src/db/direct-database.test.ts.
2. db zone: locked-user.ts uses directDatabase().transaction(...). Delete the resolveLockConnectionUrl() call and the drizzle import.
3. composition: delete account-merge's private directDatabase() (lines 91-94) and import it from '@/db/direct-database'. In tracking-merge-retry, delete line 51 and write `const writer = database ?? directDatabase()`. In wh-statics-refresh, replace all four drizzle(directClient) with directDatabase().
4. data and features: in saveCorpProfile, saveCorpOwnedAssets and saveOwnedBlueprints, collapse the let/if block to `const database = options.database ?? directDatabase();`. In maps/queries.ts:521, write `database === db ? directDatabase() : database` and keep the identity check. In character-scoping, use the default parameter `database: AnyPgDb = directDatabase()`.
5. Cron: change CronWorkContext.client: Sql to `database: PostgresJsDb`, exposed in workContext as a getter over directDatabase() so it stays lazy. Update all five declarations: wh-statics preLock and work use ctx.database; industry-indices; sde, where SdePreLock.db becomes PostgresJsDb and the drizzle import goes; prices calls refreshStalePrices(database); gsc calls syncGsc(database, urls).
6. Change refreshStalePrices and syncGsc to accept PostgresJsDb and delete their internal drizzle(client). Make scripts/refresh-prices.ts pass its existing `db`.
7. Delete the now-unused imports of drizzle, directClient and resolveLockConnectionUrl. Fallow flags any that are left.
8. Update tests to mock the new module rather than the drizzle constructor: `vi.mock('@/db/direct-database', () => ({ directDatabase: () => fake }))`. This applies to data/maps/queries.test.ts (change the line 41 assertion to the directDatabase mock), account-merge.test.ts (drop the resolveLockConnectionUrl mock), admin-users.reassign.test.ts, the refresh-industry-indices, refresh-sde and refresh-wh-statics route tests, the refresh-prices and refresh-gsc route tests, and data/gsc/ingest.test.ts for the signature change.

**Tests.** New src/db/direct-database.test.ts: (a) importing the module does not read env or construct a client; (b) two calls return the same instance; (c) with only a -pooler URL set, the first call throws /-pooler/, mirroring src/db/direct-client.test.ts:28-31 with vi.resetModules and env stubs. The existing tests that guard behavior: src/db/direct-client.test.ts, data/maps/queries.test.ts ('default revokes use the direct client'), composition/account-lifecycle/tracking-merge-retry.db.test.ts, map-character-scoping.db.test.ts, data/maps/character-scoping.db.test.ts, composition/sync/blueprint-snapshot.db.test.ts, composition/pipelines/cron-gate.test.ts, and the cron route tests.

**Notes.** After memoization the pooled-URL refusal still fires on the first directDatabase() call and then never again, which is what directClient already does today; that matches production, where env is fixed. Memoization saves nothing measurable, because drizzle() only allocates a dialect and session. The value is one named accessor and less boilerplate per call site. Memoization persists across tests in a vitest file, so tests must mock '@/db/direct-database' rather than drizzle-orm/postgres-js, or a cached instance from one test leaks into the next. Keep the `database === db` checks in owned-assets/saveOwnedAssets and corp-holdings/saveHoldingNodes exactly as they are: they decide whether a write is standalone (supersede on unique violation plus revalidate) or runs inside the caller's transaction (rethrow, and the caller revalidates).

<sub>Reported by: area:app-api, area:composition, area:data-eve, area:data-services, area:features-owned, area:lib-infra, concern:persistence.</sub>

<a id="p237"></a>

## P237: Register every session advisory-lock key as a plain number in src/db/advisory-lock.ts

- **Status:** [x] done
- **Category:** persistence · **Kind:** missing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +15 production; +10 test
- **Depends on:** [P220](#p220), [P296](wave-01-quick-wins-delete-dead-code-fix-small.md#p296)
- **Existing primitive:** `src/db/advisory-lock.ts:withAdvisoryLock`

**Problem.** Each cron or script that serializes itself with withAdvisoryLock defines its own key in its own module. The types are mixed: BigInt keys are converted with Number() at every call site, and the auth backfill uses an unregistered literal. Only comments keep the keys unique, and those comments are already incomplete (the retired affiliation-refresh key …016 is not mentioned). A collision would silently make an unrelated cron report 'busy' and skip its run.

**Sites (20).**

- [`src/db/advisory-lock.ts:7-34`](../../src/db/advisory-lock.ts#L7-L34) — withAdvisoryLock(client, lockKey: number, work)
- [`src/data/eve-data/constants.ts:66`](../../src/data/eve-data/constants.ts#L66) — ADVISORY_LOCK_SDE_INGEST = BigInt(8273619013)
- [`src/data/industry-indices/constants.ts:12-19`](../../src/data/industry-indices/constants.ts#L12-L19) — BigInt(8273619014); collision list in a comment
- [`src/data/gsc/constants.ts:1-8`](../../src/data/gsc/constants.ts#L1-L8) — BigInt(8273619015); collision list in a comment
- [`src/data/esi-refresh-jobs/constants.ts:43`](../../src/data/esi-refresh-jobs/constants.ts#L43) — BigInt(8273619017)
- [`src/data/wh-statics/constants.ts:7`](../../src/data/wh-statics/constants.ts#L7) — 8_273_619_018 as number
- [`src/data/maps/lifecycle.ts:34`](../../src/data/maps/lifecycle.ts#L34) — 8_273_619_019 as number
- [`src/scripts/backfill-users-if-empty.ts:13, 74`](../../src/scripts/backfill-users-if-empty.ts#L13) — unregistered LOCK_KEY_NUM = 8419273051
- [`src/scripts/refresh-sde.ts:25, 39`](../../src/scripts/refresh-sde.ts#L25) — Number(ADVISORY_LOCK_SDE_INGEST)
- [`src/scripts/ingest-sde-if-empty.ts:24, 69`](../../src/scripts/ingest-sde-if-empty.ts#L24) — Number(ADVISORY_LOCK_SDE_INGEST)
- [`src/app/api/cron/refresh-sde/declaration.ts:36`](../../src/app/api/cron/refresh-sde/declaration.ts#L36) — Number() conversion
- [`src/app/api/cron/refresh-gsc/declaration.ts:17`](../../src/app/api/cron/refresh-gsc/declaration.ts#L17) — Number() conversion
- [`src/app/api/cron/refresh-industry-indices/declaration.ts:17`](../../src/app/api/cron/refresh-industry-indices/declaration.ts#L17) — Number() conversion
- [`src/app/api/cron/drain-esi-refresh-jobs/declaration.ts:30`](../../src/app/api/cron/drain-esi-refresh-jobs/declaration.ts#L30) — Number() conversion
- [`src/app/api/cron/refresh-wh-statics/declaration.ts:9, 31`](../../src/app/api/cron/refresh-wh-statics/declaration.ts#L9) — number key from data/wh-statics
- [`src/app/api/cron/purge-maps/declaration.ts:3, 16`](../../src/app/api/cron/purge-maps/declaration.ts#L3) — number key from data/maps/lifecycle
- [`src/composition/wh-statics-refresh.ts:96-100`](../../src/composition/wh-statics-refresh.ts#L96-L100) — on-demand refresh shares the wh-statics key on purpose
- [`src/composition/pipelines/cron-gate.ts:47-49`](../../src/composition/pipelines/cron-gate.ts#L47-L49) — lock: { key: number; busyBody }
- [`src/app/api/cron/refresh-industry-indices/route.test.ts:14-16`](../../src/app/api/cron/refresh-industry-indices/route.test.ts#L14-L16) — mocks the constants module to supply key 41; must change
- [`src/db/advisory-lock.concurrency.test.ts:7`](../../src/db/advisory-lock.concurrency.test.ts#L7) — TEST_LOCK_KEY 918273645, another key in the same space

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/__tests__/idempotency-registry.ts:48, 85, 103, 113, 123, 134`](../../src/composition/__tests__/idempotency-registry.ts#L48) — Prose naming the old constants. Update the strings; this is not a key definition.

</details>

**Home.** `src/db/advisory-lock.ts (export ADVISORY_LOCKS beside withAdvisoryLock)`

**Boundary check.** Zone db. Consumers: api declarations (rule from:api allows db), composition/wh-statics-refresh.ts (from:composition allows db), and scripts refresh-sde, ingest-sde-if-empty and backfill-users-if-empty (from:scripts allows db). If any data module still re-exports a key, from:data also allows db. src/config would be unreachable from scripts (from:scripts does not list config), so db is the only shared legal home.

**API sketch.**

```ts
export const ADVISORY_LOCKS = {
  sdeIngest: 8_273_619_013,
  industryIndices: 8_273_619_014,
  gscSync: 8_273_619_015,
  esiRefreshQueue: 8_273_619_017,
  whStaticsRefresh: 8_273_619_018,
  mapPurge: 8_273_619_019,
  authBackfill: 8_419_273_051,
} as const;
// Retired, never reuse: 8_273_619_012 (prices), 8_273_619_016 (affiliation refresh).
export async function withAdvisoryLock<T>(client: Sql, lockKey: number, work: ...): Promise<AdvisoryLockOutcome<T>>; // signature unchanged
```

**Migration steps.**

1. Add ADVISORY_LOCKS to src/db/advisory-lock.ts with exactly today's values; Number(BigInt(x)) === x for all of them. Put a comment listing the retired keys …012 and …016.
2. Switch the six cron declarations (refresh-sde, refresh-gsc, refresh-industry-indices, drain-esi-refresh-jobs, refresh-wh-statics, purge-maps) to ADVISORY_LOCKS.<name> and drop the Number() calls.
3. Switch composition/wh-statics-refresh.ts:96-100 and the three scripts. In backfill-users-if-empty.ts, replace LOCK_KEY_NUM with ADVISORY_LOCKS.authBackfill.
4. Delete the old ADVISORY_LOCK_* exports and their collision comments from eve-data, industry-indices, gsc, esi-refresh-jobs, wh-statics and maps/lifecycle; fallow unused-exports will flag any leftovers.
5. Remove the vi.mock of '@/data/industry-indices/constants' in refresh-industry-indices/route.test.ts:14-16; the reserve mock already decides busy or not busy.
6. Update the constant names in the idempotency-registry prose strings.
7. Keep lockKey typed as number. Narrowing it to registry values would break advisory-lock.test.ts (key 42), cron-gate.test.ts and the concurrency test.

**Tests.** Add a case to src/db/advisory-lock.test.ts: the ADVISORY_LOCKS values are unique, are safe integers, and do not overlap the retired keys (8273619012, 8273619016) or the concurrency-test key 918273645 (list those inside the test so no extra export is needed). Existing guards: src/db/advisory-lock.test.ts, src/db/advisory-lock.concurrency.test.ts, src/composition/pipelines/cron-gate.test.ts, and each cron route.test.ts.

**Notes.** Values must stay identical. During a deploy, old and new lambdas can overlap, and a changed key would let two runs proceed at once. wh-statics deliberately shares one key between the cron and the on-demand admin refresh; keep that as one registry entry. Placing domain names in src/db is an accepted cost: it is the only zone that every consumer, scripts included, may import.

<sub>Reported by: area:lib-infra, concern:persistence.</sub>

<a id="p242"></a>

## P242: Export lockUserRows(tx, ids) from src/db/locked-user.ts and build every user-row lock on it

- **Status:** [x] done
- **Category:** persistence · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -~10 / +~10 (net ~0); the value is one named home for the lock protocol, not line count
- **Depends on:** [P220](#p220)
- **Existing primitive:** `src/db/locked-user.ts:withLockedUsers`

**Problem.** Four places lock `user` rows FOR UPDATE before moving identity. Each writes its own select: withLockedUsers (multi-id, ordered), account-merge (two ids, ordered, also reads createdAt and role), deletion-jobs' private lockUser (one id, three callers) and tracking-merge-retry (one id). The lock protocol and its deadlock-ordering rule exist only as cross-file comments.

**Verifier revision.** The four sites are the same concept: take the user-row FOR UPDATE lock first, before identity moves. Two comments already point at a shared protocol that has no code home: deletion-jobs.ts:57 says 'The user lock matches merge initialization', and tracking-merge-retry.ts:22 says 'Use the merge's user lock'. The 'bypasses an existing primitive' framing is wrong, though. withLockedUsers opens its own direct-pool transaction and returns nothing. deletion-jobs must lock on the deletion pool's transaction, tracking-merge-retry on its caller's writer, and merge needs createdAt and role. None of them can call it. The ordering drift is not a bug either: the two copies without asc(user.id) lock a single id, so lock order does not matter. What survives is a small extraction of the lock statement itself, so the protocol and its ordering rule live in one place and any future multi-id lock gets the ordering.

**Sites (6).**

- [`src/db/locked-user.ts:7-18`](../../src/db/locked-user.ts#L7-L18) — canonical ordered lock, but bundled with its own direct-pool transaction and discards the rows
- [`src/composition/account-lifecycle/account-merge.ts:99-105`](../../src/composition/account-lifecycle/account-merge.ts#L99-L105) — two-user ordered lock on the merge transaction; selects id, createdAt and role for MergeCandidate
- [`src/platform/auth/deletion-jobs.ts:22-24, 57-60, 68-71, 106-108`](../../src/platform/auth/deletion-jobs.ts#L22-L24) — private lockUser(single id) on the deletion-pool transaction; requestDeletion uses the result's length
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:21-25`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L21-L25) — inline single-user lock on the writer transaction, commented as 'the merge's user lock'; uses owner.id
- [`src/platform/auth/account-purge.ts:10-18`](../../src/platform/auth/account-purge.ts#L10-L18) — existing withLockedUsers consumer, unchanged
- [`src/platform/auth/admin-users.ts:166-174`](../../src/platform/auth/admin-users.ts#L166-L174) — existing withLockedUsers consumer, unchanged

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/account-lifecycle/account-purge.ts:57`](../../src/composition/account-lifecycle/account-purge.ts#L57) — locks a pending_deletions row, not user
- [`src/composition/account-lifecycle/account-merge.ts:109-113`](../../src/composition/account-lifecycle/account-merge.ts#L109-L113) — locks the proven account row, a different table and protocol step
- [`src/platform/auth/affiliation-store.ts:154`](../../src/platform/auth/affiliation-store.ts#L154) — locks characters rows in raw SQL; unrelated
- [`src/data/maps/queries.ts:523`](../../src/data/maps/queries.ts#L523) — map row lock; unrelated

</details>

**Home.** `src/db/locked-user.ts (existing module; add lockUserRows next to withLockedUsers)`

**Boundary check.** The home is in the db zone, whose rule allows lib and config; the module already imports '@/lib/db-types' and './auth-schema'. Both consumer zones may import db: the composition rule (account-merge, tracking-merge-retry) and the platform/auth rule (deletion-jobs) each list it. The withLockedUsers consumers are unchanged.

**API sketch.**

```ts
export type LockedUser = Pick<typeof user.$inferSelect, 'id' | 'createdAt' | 'role'>;
/** Lock user rows FOR UPDATE in id order on the caller's transaction (FK key-share safe, deadlock-free across callers). */
export function lockUserRows(tx: AnyPgDb, userIds: readonly string[]): Promise<LockedUser[]>;
export async function withLockedUsers<T>(userIds: string[], change: (database: AnyPgDb) => Promise<T>): Promise<T>; // = direct tx { await lockUserRows(tx, userIds); return change(tx); }
```

**Migration steps.**

1. Add lockUserRows to src/db/locked-user.ts. It selects the fixed columns { id, createdAt, role }, filters with inArray(user.id, userIds), orders by asc(user.id) and calls .for('update'). Fixed columns avoid a generic select signature, and the extra columns cost nothing.
2. Rewrite withLockedUsers to call lockUserRows(tx, userIds) inside its transaction. Keep the FK key-share comment on lockUserRows.
3. account-merge.ts 100-105: `const lockedUsers = await lockUserRows(tx, [request.linkingUserId, request.otherUserId]);` then drop the now-unused `asc` and `inArray` imports.
4. deletion-jobs.ts: delete the private lockUser (22-24) and replace its three calls (60, 70, 108) with lockUserRows(tx, [userId]). Keep requestDeletion's `owners.length === 0` check.
5. tracking-merge-retry.ts 23-24: `const [owner] = await lockUserRows(tx, [pending.userId]);` and point the comment at lockUserRows.

**Tests.** Add a unit test for lockUserRows, e.g. src/db/locked-user.test.ts with a recording fake transaction (see P244). It asserts the select is ordered by user.id and ends in .for('update') for multiple ids. Existing guards: account-merge.test.ts (its fake chain already supports orderBy and for), admin-users.reassign.test.ts (withLockedUsers path), account-merge.db.test.ts, account-purge.db.test.ts and tracking-merge-retry.db.test.ts.

**Notes.** Keep each caller's transaction and pool. Deletion jobs must stay on deletionDatabase(), merge and tracking retry on the direct client. lockUserRows takes the transaction and never opens one. The missing asc() in the single-id copies is harmless; no copy is wrong. account-merge.test.ts mocks '@/db' by module, and locked-user.ts imports './index', which resolves to the same mocked module, so the merge unit test keeps working.

<sub>Reported by: concern:persistence.</sub>

<a id="p228"></a>

## P228: Add ownerKeyWhere beside ownerSyncStateColumns and return sync-state rows directly

- **Status:** [x] done
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 lines (17 predicates shortened in place, 12 rebuild lines, 7 identity-map lines); +15 in lib including the test
- **Depends on:** —
- **Existing primitive:** `src/lib/db-columns.ts:ownerSyncStateColumns`

**Problem.** The owner-pair WHERE clause on ownerType and ownerId is hand-written at 17 sites across owned-assets, owned-blueprints, esi-snapshots, esi-refresh-jobs and the synthetic pilot store, sometimes inside larger and() clauses. Six readSyncState functions select exactly the fields of their return type and then rebuild the same object field by field, and listCorpJobSyncStates maps each row to an identical object before sorting.

**Verifier revision.** Most of the proposal does not hold up. Readers and writers that run queries cannot share a helper and stay typed. A generic stampSyncFresh(table, where) needs a cast on update(table).set(), since PgUpdateSetSource<T> cannot be checked for a generic T. The stamps also differ: corp jobs clears syncError, and corp-holdings takes an injected refreshedAt. The sync upserts differ meaningfully: saveCorpOwnedAssets sets only pageEtags to take a lock, corp jobs writes syncError null or 'needs_role', and skills updates halves partially. readSyncRow would only wrap `.limit(1)` and `[0] ?? null` over different column sets. The ['character','corporation'] constant exists five times (owned-assets, owned-blueprints, esi-snapshots, maps, esi-refresh-jobs), each backing a distinct Postgres enum, and sharing it would couple those enums' migrations. The scope fan-out has 2 sites with different corp-input arity, the tag builders use different prefixes, and the characterXInputs functions are one-line maps over different row types. Two parts survive. (1) The owner-pair predicate `and(eq(t.ownerType, x), eq(t.ownerId, y))`: 17 sites across features, data and composition, the query-side twin of ownerSyncStateColumns. (2) Six sync-state readers that rebuild the selected row field by field, where `rows[0] ?? null` is type-identical, plus an identity re-map in listCorpJobSyncStates.

**Sites (15).**

- [`src/lib/db-columns.ts:10-21`](../../src/lib/db-columns.ts#L10-L21) — existing ownerSyncStateColumns (schema half); no query-side counterpart
- [`src/features/owned-assets/queries.ts:45, 56-58, 110, 126, 161`](../../src/features/owned-assets/queries.ts#L45) — owner predicate five times (one with literal 'corporation')
- [`src/features/owned-assets/purge.ts:15-22`](../../src/features/owned-assets/purge.ts#L15-L22) — owner predicate twice with literal 'character'
- [`src/features/owned-blueprints/queries.ts:39, 75, 102, 127`](../../src/features/owned-blueprints/queries.ts#L39) — owner predicate four times
- [`src/features/owned-blueprints/purge.ts:15-27`](../../src/features/owned-blueprints/purge.ts#L15-L27) — owner predicate twice
- [`src/data/esi-snapshots/purge.ts:12-15`](../../src/data/esi-snapshots/purge.ts#L12-L15) — owner predicate, 'character'
- [`src/data/esi-snapshots/queries.ts:18-28`](../../src/data/esi-snapshots/queries.ts#L18-L28) — owner pair inside a larger and()
- [`src/data/esi-refresh-jobs/purge.ts:18-29`](../../src/data/esi-refresh-jobs/purge.ts#L18-L29) — owner pair plus userId inside and()
- [`src/composition/synthetic-pilot-store.ts:96-103`](../../src/composition/synthetic-pilot-store.ts#L96-L103) — owner pair on mapAccess, 'character'
- [`src/features/owned-assets/queries.ts:103-114`](../../src/features/owned-assets/queries.ts#L103-L114) — readOwnerSyncState rebuilds the row; `rows[0] ?? null` is identical
- [`src/features/owned-blueprints/queries.ts:68-79`](../../src/features/owned-blueprints/queries.ts#L68-L79) — readBlueprintSyncState, same rebuild
- [`src/features/owned-structures/queries.ts:39-49`](../../src/features/owned-structures/queries.ts#L39-L49) — readCorpStructureSyncState, same rebuild
- [`src/features/industry-jobs/queries.ts:42-55, 109-129, 131-150`](../../src/features/industry-jobs/queries.ts#L42-L55) — character and corp readers rebuild rows; listCorpJobSyncStates re-maps rows identically before sorting
- [`src/features/skill-queue/queries.ts:69-85`](../../src/features/skill-queue/queries.ts#L69-L85) — readCharacterSyncState, same rebuild
- [`src/data/corp-holdings/queries.ts:122-129`](../../src/data/corp-holdings/queries.ts#L122-L129) — the clean `rows[0] ?? null` form to copy

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/owned-assets/queries.ts:146-152, 157-162, 183-188`](../../src/features/owned-assets/queries.ts#L146-L152) — Sync upserts and stamps. The corp upsert sets only pageEtags to take a lock, so a shared upsertSyncState would hide that.
- [`src/features/owned-blueprints/queries.ts:94-99, 123-128`](../../src/features/owned-blueprints/queries.ts#L94-L99) — A generic stamp or upsert over a generic table needs a cast on .set().
- [`src/features/industry-jobs/queries.ts:77-82, 166-172, 181-187, 191-198`](../../src/features/industry-jobs/queries.ts#L77-L82) — Stamp clears syncError; upserts write syncError null or 'needs_role'.
- [`src/features/skill-queue/queries.ts:113-134, 140-145`](../../src/features/skill-queue/queries.ts#L113-L134) — Partial updates of queue or skills halves; not one upsert shape.
- [`src/features/owned-assets/schema.ts:15-17`](../../src/features/owned-assets/schema.ts#L15-L17) — OWNED_ASSET_OWNER_TYPES backs pgEnum 'owned_asset_owner_type'. Siblings: owned-blueprints/schema.ts:4-9, data/esi-snapshots/constants.ts:3, data/maps/access-contract.ts:5 and data/esi-refresh-jobs/constants.ts:21, each a distinct Postgres enum. Sharing one constant couples their migrations.
- [`src/features/owned-assets/queries.ts:24-26, 87-93`](../../src/features/owned-assets/queries.ts#L24-L26) — Tag builder and scope fan-out. The blueprint copy (owned-blueprints/queries.ts:20-22, 57-66) uses a different prefix and threads evidence into corpInputs; a 4-line helper in platform/auth would add indirection.
- [`src/features/owned-assets/asset-map.ts:32-34`](../../src/features/owned-assets/asset-map.ts#L32-L34) — characterAssetInputs vs blueprint-map.ts:34-36: one-line maps over different row types
- [`src/data/maps/queries.ts:122-136`](../../src/data/maps/queries.ts#L122-L136) — Owner type with inArray over several ids; a different predicate.

</details>

**Home.** `src/lib/db-columns.ts (existing; add ownerKeyWhere beside ownerSyncStateColumns)`

**Boundary check.** The home is in the lib zone, whose rule is { from: 'lib', allow: ['config'] }. The helper imports only drizzle-orm (a package). OwnerKey lives in platform/owner-sync, which lib may not import, so the owner parameter is typed structurally. Consumers: features/owned-assets and features/owned-blueprints, legal under the 'features' rule (allows 'lib'); data/esi-snapshots and data/esi-refresh-jobs, legal under the 'data' rule (allows 'lib'); src/composition/synthetic-pilot-store.ts, legal under the 'composition' rule (allows 'lib').

**API sketch.**

```ts
export function ownerKeyWhere(
  table: { ownerType: AnyPgColumn; ownerId: AnyPgColumn },
  owner: { ownerType: 'character' | 'corporation'; ownerId: number },
): SQL; // sql`(${eq(table.ownerType, owner.ownerType)} and ${eq(table.ownerId, owner.ownerId)})`, which returns SQL rather than and()'s SQL | undefined
```

**Migration steps.**

1. Add ownerKeyWhere to src/lib/db-columns.ts with a unit test that renders it through PgDialect and checks SQL text and params. db-columns.ts has no test today, and the new export needs one.
2. Replace the predicate in src/features/owned-assets/queries.ts (45, 56-58, 110, 126, 161) and owned-assets/purge.ts.
3. Replace it in src/features/owned-blueprints/queries.ts (39, 75, 102, 127) and owned-blueprints/purge.ts.
4. Compose it into the larger clauses: and(inArray(esiSnapshots.id, ids), ownerKeyWhere(esiSnapshots, { ownerType: 'corporation', ownerId }), eq(esiSnapshots.endpoint, …)) in data/esi-snapshots/queries.ts; data/esi-snapshots/purge.ts; and(eq(esiRefreshJobs.userId, userId), ownerKeyWhere(...)) in data/esi-refresh-jobs/purge.ts; src/composition/synthetic-pilot-store.ts.
5. Independently, change the six sync-state readers to `return rows[0] ?? null`: owned-assets 112-113, owned-blueprints 77-78, owned-structures 47-48, industry-jobs 53-54 and 146-149, skill-queue 81-84.
6. In listCorpJobSyncStates, drop the identity .map (121-127) and either sort the rows directly or add .orderBy(corpIndustryJobSyncs.corporationId) to the query.

**Tests.** New: a db-columns unit test for ownerKeyWhere. Existing guards: src/features/owned-assets/queries.db.test.ts, src/features/owned-assets/corp-snapshot.db.test.ts, src/composition/sync/blueprint-snapshot.db.test.ts, src/features/owned-structures/queries.db.test.ts, src/composition/board/board-view.db.test.ts, src/composition/account-lifecycle/account-purge.db.test.ts (purge contributors), src/data/esi-refresh-jobs/esi-refresh-jobs.db.test.ts, src/composition/pipelines/esi-snapshot-retention.db.test.ts, plus the composition sync port tests (owned-assets-sync, corp-industry-jobs-sync, corp-structures-sync).

**Notes.** rows[0] ?? null is safe: each select lists exactly the return type's fields, and the column types match (jobsEtag and syncError are text, i.e. string | null; pageEtags is string[]). Keep the port contracts and exported function names unchanged; the composition ports wire them by name. Keep stampCorpJobsFresh's syncError clear and saveCorpOwnedAssets' pageEtags-only lock upsert exactly as they are. F422's ownedRowWhere and F452's direct-database halves are out of scope here, as the source finding says.

<sub>Reported by: area:features-owned, concern:feature-skeleton, concern:persistence, dupes-triage-1, dupes-triage-2.</sub>

<a id="p327"></a>

## P327: Return selected rows directly from feature sync-state readers and sort corp job syncs in SQL

- **Status:** [x] done
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -35 / +8
- **Depends on:** [P228](#p228)

**Problem.** Feature query readers select exactly the columns they return, then copy each field into an identical new object. listCorpJobSyncStates also re-sorts in JS instead of using orderBy, and listCustomStructures applies ?? defaults that cannot fire. listCorpStructureSyncStates (owned-structures/queries.ts:51-59) already returns db rows directly, so the readers disagree on style and carry about 35 lines of boilerplate.

**Verifier revision.** The identity remaps are real. Each reader selects exactly the declared fields and rebuilds the same object, and every selected column type is assignable to the declared return type (notNull timestamps fit Date | null, nullable text fits string | null, pageEtags is $type<string[]>().notNull(), jobs is $type<IndustryJob[]>().notNull()). Returning rows[0] ?? null type-checks and behaves the same. listCorpJobSyncStates maps to an identical object and sorts in JS, and orderBy on the integer corporationId gives the same order. In listCustomStructures, `rigTypeIds ?? []` is dead (the column is notNull with default []) and `bonuses ?? null` is dead (nullable jsonb already returns null), so it can return its rows directly. The finder missed getCorpJobs (lines 92-99), which has the same `{ jobs: row.jobs }` remap. One part is rejected: rowValues in custom-structures is a column whitelist, not an identity copy. Replacing it with a destructuring rest would spread any extra runtime key into `.values({ id: input.id, userId, ...rest })` and `.set(rest)`, so a wider object from a future caller could overwrite userId or id. The zod request schemas strip unknown keys today, but the query functions' TypeScript parameters cannot stop structurally wider objects. The whitelist is a cheap ownership guard and stays.

**Sites (11).**

- [`src/features/industry-jobs/queries.ts:25-34`](../../src/features/industry-jobs/queries.ts#L25-L34) — readCharacterJobs: `if (row === undefined) return null; return { jobs: row.jobs }`
- [`src/features/industry-jobs/queries.ts:88-100`](../../src/features/industry-jobs/queries.ts#L88-L100) — getCorpJobs ('use cache'): same `{ jobs: row.jobs }` remap (missed by the finder). Drizzle rows are plain objects, so the cached return is unaffected.
- [`src/features/industry-jobs/queries.ts:42-55`](../../src/features/industry-jobs/queries.ts#L42-L55) — readCharacterJobSyncState identity remap
- [`src/features/industry-jobs/queries.ts:109-129`](../../src/features/industry-jobs/queries.ts#L109-L129) — listCorpJobSyncStates: identity map plus .sort by corporationId in JS
- [`src/features/industry-jobs/queries.ts:131-150`](../../src/features/industry-jobs/queries.ts#L131-L150) — readCorpJobSyncState identity remap
- [`src/features/skill-queue/queries.ts:69-85`](../../src/features/skill-queue/queries.ts#L69-L85) — readCharacterSyncState identity remap
- [`src/features/owned-assets/queries.ts:103-114`](../../src/features/owned-assets/queries.ts#L103-L114) — readOwnerSyncState identity remap
- [`src/features/owned-blueprints/queries.ts:68-79`](../../src/features/owned-blueprints/queries.ts#L68-L79) — readBlueprintSyncState identity remap
- [`src/features/owned-structures/queries.ts:39-49`](../../src/features/owned-structures/queries.ts#L39-L49) — readCorpStructureSyncState identity remap
- [`src/features/custom-structures/queries.ts:6-29`](../../src/features/custom-structures/queries.ts#L6-L29) — listCustomStructures: field-by-field map with dead `?? []` (rigTypeIds is notNull, schema.ts:33) and dead `?? null` (bonuses is nullable jsonb, schema.ts:36)
- [`src/features/owned-structures/queries.ts:51-59`](../../src/features/owned-structures/queries.ts#L51-L59) — listCorpStructureSyncStates already returns db rows directly: the target style

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/custom-structures/queries.ts:39-48`](../../src/features/custom-structures/queries.ts#L39-L48) — rowValues is an explicit column whitelist feeding .values({ id, userId, ...}) and .set(). A rest spread would let a wider runtime object override userId or id. Keep it.
- [`src/features/skill-queue/queries.ts:19-34`](../../src/features/skill-queue/queries.ts#L19-L34) — readCharacterSkills really reshapes the row (queue→entries, optional unallocatedSp); not an identity copy
- [`src/data/maps/blocks.ts:94-101`](../../src/data/maps/blocks.ts#L94-L101) — Real reshape (nests the pending mapId and version); not an identity copy

</details>

**Home.** `No new primitive. These are in-place edits in each feature's queries.ts.`

**Boundary check.** No new imports. Every file stays in the features zone, which already imports db and drizzle (the features rule allows db).

**API sketch.**

```ts
export async function readCharacterJobSyncState(characterId: number): Promise<CharacterJobsSyncState | null> {
  const rows = await db.select({ lastRefreshedAt: ..., jobsEtag: ... }).from(...).where(...).limit(1);
  return rows[0] ?? null;
}

export async function listCorpJobSyncStates(userId: string): Promise<Array<{ corporationId: number } & CorpJobsSyncState>> {
  return db.select({...}).from(corpIndustryJobSyncs).where(eq(corpIndustryJobSyncs.userId, userId)).orderBy(corpIndustryJobSyncs.corporationId);
}
```

**Migration steps.**

1. industry-jobs/queries.ts: in readCharacterJobs, getCorpJobs, readCharacterJobSyncState and readCorpJobSyncState, replace `const row = rows[0]; ... remap` with `return rows[0] ?? null`. Keep the explicit Promise<... | null> return types so tsc still checks the select shape against the declared types.
2. industry-jobs/queries.ts listCorpJobSyncStates: delete the .map/.sort and return the query with .orderBy(corpIndustryJobSyncs.corporationId).
3. skill-queue/queries.ts readCharacterSyncState, owned-assets/queries.ts readOwnerSyncState, owned-blueprints/queries.ts readBlueprintSyncState and owned-structures/queries.ts readCorpStructureSyncState: return rows[0] ?? null.
4. custom-structures/queries.ts listCustomStructures: return the awaited select (already ordered by createdAt) without the map. Leave rowValues, createCustomStructure and updateCustomStructure unchanged.

**Tests.** Existing: skill-queue/queries.db.test.ts, owned-structures/queries.db.test.ts and owned-assets/queries.db.test.ts cover the sync-state readers against a real DB. composition/sync/corp-industry-jobs-sync.test.ts and the sync engine tests consume readSyncState. industry-jobs and custom-structures have no queries test file. If a db test harness is available, add one case to industry-jobs that seeds two corp sync rows out of order and asserts listCorpJobSyncStates returns them sorted by corporationId. Run pnpm check (typecheck proves assignability).

**Notes.** Returned objects keep the same keys because the selects already list exactly the declared fields. Only a future column added to a select would now leak into the result, and that is harmless. orderBy on an integer PK component gives the same order as the numeric JS comparator. Lead, out of scope: readOwnerSyncState (owned-assets) and readBlueprintSyncState (owned-blueprints) run the same query over two tables built from lib/db-columns ownerSyncStateColumns, and a generic reader keyed on that column set could serve both. That would need a typed table parameter and is a separate design question.

<sub>Reported by: area:features-owned.</sub>

<a id="p103"></a>

## P103: Seed placeholder prices through one chunked function, route the hand-rolled batch loops through lib chunk, and build eve-data streamInsert on sde-io primitives

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -80 / +35.
- **Depends on:** —
- **Existing primitive:** `src/lib/array.ts:chunk, src/lib/array.ts:dedupe`

**Problem.** Placeholder-price seeding exists twice:
- composition/pipelines/sde-pipeline.ts seedTrackedTypes builds NULL-priced, epoch-stale 'esi' rows and inserts them in a manual 1000-row slice loop.
- data/market-prices/ingest.ts seedPlaceholderPrices, used by the board through price-book, builds the same rows in one unbatched statement. Its own comment calls it 'the same shape the SDE pipeline seeds'.

Batching is also hand-written repeatedly despite src/lib/array.ts chunk, which market-history, industry-indices, corp-holdings and affiliation-source already use:
- gsc/ingest.ts keeps a byte-identical private chunk.
- market-prices persistPrices, sde-io insertChunked, station-names, names-client and map-access-projection (a bare literal 32) each use `for (i += N) slice`.
- chunk takes a mutable T[] and never terminates for size <= 0.

In data/eve-data, ingest.streamInsert re-implements the JSONL line reader from sde-io.readJsonl and the buffer-then-flush logic of tree-resolver.makeBatchInserter. makeBatchInserter is a generic helper that happens to live in, and be exported from, the tree resolver.

Separately, the type-names route and live-dataset-view both dedupe ids, call getTypeNames and convert the Map into the same Record<string, string>.

**Verifier revision.** Three parts survive:
- seedTrackedTypes (sde-pipeline) is a semantic, drifted copy of seedPlaceholderPrices: the same rows (NULL prices, epoch staleAfter, source 'esi', ON CONFLICT DO NOTHING, returning typeId). The SDE copy batches in 1000s. The data-layer copy, used by the board, does not.
- gsc/ingest.ts has a byte-identical private chunk, and six manual `i += N; slice` loops exist beside lib chunk.
- eve-data/ingest.streamInsert re-implements both readJsonl's line reader (sde-io.ts) and makeBatchInserter's buffer and flush (tree-resolver.ts), all within data/eve-data.

Rejected:
- The sweep of about 24 inline `[...new Set(x)]` sites to dedupe. It is the native idiom with identical semantics and no drift or bug, so it is churn across about 20 files. The sorted variants belong to P102.
- insertInChunks in src/lib/db-upsert.ts. That file does not exist, and the batched writers differ in conflict clause and returning, so chunk() is the primitive.

The bind-parameter claim is weak. seedPlaceholderPrices binds 4 params per row (typeId, updatedAt, staleAfter, source), so it would hit Postgres's 65535 limit only above about 16k types. The board's unseeded owned types and the SDE's about 5.5k tracked types (refresh-sde route.test.ts:61) are both below that. Chunking is defensive, not a live bug.

chunk(x, 0) does loop forever (i += 0), but every caller passes a positive constant, so it is latent.

**Sites (16).**

- [`src/lib/array.ts:1-9`](../../src/lib/array.ts#L1-L9) — canonical dedupe and chunk; chunk takes T[] and has no size guard
- [`src/composition/pipelines/sde-pipeline.ts:25-59`](../../src/composition/pipelines/sde-pipeline.ts#L25-L59) — seedTrackedTypes: listMissingTypeIds pre-query, same rows, manual BATCH=1000 slice loop
- [`src/data/market-prices/ingest.ts:43-58`](../../src/data/market-prices/ingest.ts#L43-L58) — seedPlaceholderPrices: single unbatched insert, column defaults for the NULL prices
- [`src/composition/board/price-book.ts:49-51`](../../src/composition/board/price-book.ts#L49-L51) — seedUnpricedTypes, the board consumer (called from board-view.ts:90)
- [`src/data/market-prices/ingest.ts:105-127`](../../src/data/market-prices/ingest.ts#L105-L127) — persistPrices manual BATCH=1000 upsert loop
- [`src/data/gsc/ingest.ts:111-115, 194, 227`](../../src/data/gsc/ingest.ts#L111-L115) — private chunk identical to lib; two uses
- [`src/data/eve-data/sde-io.ts:9-24, 27-35`](../../src/data/eve-data/sde-io.ts#L9-L24) — readJsonl line reader; insertChunked manual slice loop
- [`src/data/eve-data/station-names.ts:16-18`](../../src/data/eve-data/station-names.ts#L16-L18) — manual ESI_UNIVERSE_NAMES_POST_MAX slice loop
- [`src/data/eve-data/names-client.ts:29-30`](../../src/data/eve-data/names-client.ts#L29-L30) — manual maxIds slice loop
- [`src/composition/map-access-projection.ts:294-298`](../../src/composition/map-access-projection.ts#L294-L298) — manual slice loop with a bare literal 32 over a readonly string[]
- [`src/data/eve-data/ingest.ts:48-80`](../../src/data/eve-data/ingest.ts#L48-L80) — streamInsert re-implements the JSONL reader and the buffer and flush logic (BATCH_SIZE 500)
- [`src/data/eve-data/tree-resolver.ts:387-415`](../../src/data/eve-data/tree-resolver.ts#L387-L415) — makeBatchInserter: generic, exported from the resolver, used at 454-460
- [`src/app/api/eve/type-names/route.ts:17-21`](../../src/app/api/eve/type-names/route.ts#L17-L21) — dedupe, getTypeNames, Map-to-Record loop
- [`src/composition/sync/live-dataset-view.ts:49-51`](../../src/composition/sync/live-dataset-view.ts#L49-L51) — the same dedupe, getTypeNames and Map-to-Record loop
- [`src/data/market-history/ingest.ts:58`](../../src/data/market-history/ingest.ts#L58) — reference form: for (const batch of chunk(rows, UPSERT_CHUNK_SIZE))
- [`src/data/corp-holdings/queries.ts:71`](../../src/data/corp-holdings/queries.ts#L71) — reference form: an insertChunked equivalent written with chunk()

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/market-refresh-route.ts:34`](../../src/app/api/market-refresh-route.ts#L34) — Array.from(new Set()) is the native idiom, equivalent to dedupe. Not worth a standalone sweep; the same applies to owned-assets/route.ts:25, owned-blueprints/route.ts:25, market-prices/refresh-on-view.ts:95, entity-names.ts:29 and wormhole-sites/queries.ts:240 and 369.
- [`src/components/ui/chart/chart-geometry.ts:36`](../../src/components/ui/chart/chart-geometry.ts#L36) — Not a batch loop, and {from: ui, allow: []} forbids lib anyway.
- [`src/data/corp-holdings/context-sync.ts:100-106`](../../src/data/corp-holdings/context-sync.ts#L100-L106) — Already uses lib chunk.

</details>

**Home.** `Four homes: - src/lib/array.ts: chunk, hardened. - src/data/market-prices/ingest.ts: seedPlaceholderPrices, now chunked. - src/data/eve-data/sde-io.ts: a jsonlRecords generator, plus makeBatchInserter moved in from tree-resolver. - src/data/eve-data/queries.ts: getTypeNameRecord.`

**Boundary check.** lib/array.ts imports nothing ({from: lib, allow: [config]}). Its consumers:
- data/gsc, data/market-prices, data/eve-data: {from: data, allow: [..., lib]}.
- composition (map-access-projection): composition allow includes lib.

sde-pipeline (composition) calling data/market-prices/ingest: composition allow includes data. It already imports data/market-prices/queries and schema.

sde-io.ts hosting jsonlRecords and makeBatchInserter: ingest.ts and tree-resolver.ts are in the same data/eve-data zone, so these are intra-zone imports.

getTypeNameRecord in data/eve-data/queries.ts is reached by:
- api (src/app/api/eve/type-names): {from: api, allow: [..., data, ...]}.
- composition (live-dataset-view): allow includes data.

**API sketch.**

```ts
// src/lib/array.ts
export function chunk<T>(items: readonly T[], size: number): T[][]; // throws RangeError unless size is a positive integer
// src/data/market-prices/ingest.ts
export async function seedPlaceholderPrices(db: AnyPgDb, typeIds: readonly number[]): Promise<number>; // chunk(typeIds, 1000), sums returning() lengths
// src/data/eve-data/sde-io.ts
export async function* jsonlRecords(path: string): AsyncGenerator<Record<string, unknown>>;
export function makeBatchInserter<T>(batchSize: number, sink: (batch: T[]) => Promise<void>): { add(rows: readonly T[]): Promise<void>; flush(): Promise<void>; written(): number };
// src/data/eve-data/queries.ts
export async function getTypeNameRecord(ids: Iterable<number>): Promise<Record<string, string>>; // dedupes, then getTypeNames
```

**Migration steps.**

1. Harden lib chunk: take `readonly T[]` and throw a RangeError for a non-positive or non-integer size. Add the cases to array.test.ts.
2. Make seedPlaceholderPrices loop `for (const batch of chunk(typeIds, 1000))`, summing the returning() lengths, and accept readonly number[].
3. Rewrite seedTrackedTypes (sde-pipeline.ts 25-59):
- Keep the listTrackedTypeIds and listMissingTypeIds reads, so SdePipelineSummary.seed.missing keeps its pre-insert meaning.
- Replace the row building and slice loop with `inserted = await seedPlaceholderPrices(db, missing)`.
- Delete the now-unused marketPrices import.
4. In src/data/gsc/ingest.ts, delete the private chunk (111-115) and import { chunk } from '@/lib/array'.
5. Rewrite the manual loops as `for (const batch of chunk(rows, N))`, keeping each batch constant:
- market-prices/ingest.ts persistPrices 105-127
- sde-io.ts insertChunked 32-34 (keep the PgInsertValue cast)
- station-names.ts 16-18 (keep the per-batch try/catch)
- names-client.ts 29-30
- map-access-projection.ts 294-298 (name the literal: const MAP_CLAIM_PURGE_BATCH = 32).
6. In data/eve-data, add jsonlRecords(path) to sde-io.ts and rebuild readJsonl on it. Move makeBatchInserter from tree-resolver.ts into sde-io.ts and update the tree-resolver import. Rewrite ingest.ts streamInsert as follows:
- create an inserter with makeBatchInserter(BATCH_SIZE, flush)
- for each record of jsonlRecords(path), map it and, if the result is non-null, add([mapped])
- call flush()
- return written()
7. Add getTypeNameRecord to data/eve-data/queries.ts. Use it in app/api/eve/type-names/route.ts 17-21 and composition/sync/live-dataset-view.ts 49-51, deleting both Map-to-Record loops.

**Tests.** New and changed tests:
- src/lib/array.test.ts: readonly input; chunk(x, 0) and chunk(x, -1) throw.
- src/data/market-prices/seed.db.test.ts: add a case with more than 1000 ids, to cover multi-batch counting and partial conflicts. It already asserts the NULL/epoch/'esi' row shape and conflict preservation.
- Add an sde-pipeline seed test, mocking listTrackedTypeIds and listMissingTypeIds and asserting {tracked, missing, inserted}. None exists today; refresh-sde route.test.ts only mocks the summary.
- Move the makeBatchInserter tests from tree-resolver.test.ts:545-575 to a new sde-io test, and add a jsonlRecords test that skips blank lines.

Existing guards:
- src/data/eve-data/ingest.db.test.ts, station-names.test.ts and its .db test, names-client.test.ts, src/data/gsc/ingest.test.ts
- src/app/api/eve/type-names/route.test.ts, src/composition/sync/live-dataset-view.test.ts
- src/composition/map-access-projection.test.ts (revocation batches of 32)

**Notes.** The two seed copies differ in small ways:
- The SDE copy writes explicit nulls for the price and volume columns. The data-layer copy omits them, and the columns are nullable with no default, so both produce NULL. seed.db.test.ts asserts pct5Buy null.
- Both pass source 'esi', which overrides the column default 'fuzzwork', and both use epoch staleAfter with updatedAt = now, so the rows are equivalent.
- The SDE copy is right on batching; the data copy is right on simplicity.
- Keep the listMissingTypeIds pre-query only to preserve the summary's `missing` field. ON CONFLICT DO NOTHING already makes the insert idempotent.

Smaller points:
- streamInsert's BATCH_SIZE is 500, while sde-io's INSERT_BATCH is 1000. Keep 500 for streamInsert.
- map-access-projection's batch of 32 is tied to Convex mutation limits, so name it rather than change it.
- This edits src/lib/array.ts alongside P101 and P102 (independent; use separate commits).

<sub>Reported by: area:app-api, area:composition, area:lib-infra, concern:esi-sync, concern:generic-utils, concern:persistence, dupes-triage-1, dupes-triage-2.</sub>

<a id="p172"></a>

## P172: Make data/eve-data stream JSONL and batch inserts through sde-io, and route chunk loops and the upsert excluded() helper through src/lib

- **Status:** [x] done
- **Category:** server-pipeline · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -85 / +40 (gsc chunk copy, four extra excluded copies, the duplicate readline loop, the duplicate buffer/flush, and the duplicate name list and atomic write removed)
- **Depends on:** [P103](#p103), [P230](#p230)
- **Existing primitive:** `src/lib/array.ts:chunk`

**Problem.** SDE ingest has two JSONL readers (sde-io.readJsonl and the loop inside ingest.streamInsert) and three batch writers (insertChunked's index loop, streamInsert's buffer and flush, and tree-resolver.makeBatchInserter). The id- and row-batching loops in sde-pipeline, market-prices ingest, station-names, names-client and map-access-projection re-implement src/lib/array.ts chunk, and gsc/ingest.ts carries a private copy of it. `function excluded(column) { return sql.raw(`excluded.${column}`) }` is copied in five data modules. source.ts keeps the SDE file list as both a union type and an array, and writes its atomic file write twice.

**Verifier revision.** The core is real, and the scope needs both additions and a removal. Confirmed: readJsonl and streamInsert duplicate the readline, skip-blank and JSON.parse loop. streamInsert's buffer and flush duplicate makeBatchInserter, which is already tested. insertChunked, sde-pipeline and market-prices ingest hand-roll lib chunk. source.ts declares the 19 SDE names twice (a union type and an array), and an addition to only the union would compile and then fail at runtime with a missing file. source.ts also writes the tmp, rename and unlink sequence twice. Two sites the finders missed: src/data/gsc/ingest.ts:111-115 is a verbatim private copy of lib chunk, and an identical `excluded(column)` upsert helper is copied in five data modules. One part is rejected: the single PG_INSERT_BATCH constant. The batch sizes are not the same ceiling. station-names' 1000 is the ESI /universe/names/ POST cap, names-client's maxIds is a per-endpoint policy, map-access-projection's 32 is a Convex mutation limit, and Postgres batch sizes depend on column count and payload (TREE 500 holds large tree JSON). Those loops may still use chunk, but each keeps its own constant.

**Sites (16).**

- [`src/data/eve-data/sde-io.ts:6-35`](../../src/data/eve-data/sde-io.ts#L6-L35) — readJsonl's readline loop; insertChunked hand-rolls the index loop with INSERT_BATCH = 1000
- [`src/data/eve-data/ingest.ts:48-80`](../../src/data/eve-data/ingest.ts#L48-L80) — streamInsert: same readline loop as readJsonl, plus a buffer and flush identical to makeBatchInserter (BATCH_SIZE = 500)
- [`src/data/eve-data/tree-resolver.ts:387-415, 445-462`](../../src/data/eve-data/tree-resolver.ts#L387-L415) — makeBatchInserter (exported, tested); FLAT 1000 / TREE 500
- [`src/data/gsc/ingest.ts:111-115`](../../src/data/gsc/ingest.ts#L111-L115) — private chunk<T>, a verbatim copy of src/lib/array.ts chunk (used at 194 and 227)
- [`src/data/gsc/ingest.ts:22-24`](../../src/data/gsc/ingest.ts#L22-L24) — excluded() copy
- [`src/data/market-prices/ingest.ts:20-22, 105-125`](../../src/data/market-prices/ingest.ts#L20-L22) — excluded() copy; hand chunk loop with BATCH = 1000
- [`src/data/wh-observations/queries.ts:23-25`](../../src/data/wh-observations/queries.ts#L23-L25) — excluded() copy
- [`src/data/market-history/ingest.ts:13-15`](../../src/data/market-history/ingest.ts#L13-L15) — excluded() copy (already uses chunk at line 58)
- [`src/data/industry-indices/ingest.ts:9-11, 36-53`](../../src/data/industry-indices/ingest.ts#L9-L11) — excluded() copy; already uses chunk with UPSERT_CHUNK_SIZE (reference pattern)
- [`src/composition/pipelines/sde-pipeline.ts:47-55`](../../src/composition/pipelines/sde-pipeline.ts#L47-L55) — hand chunk loop, BATCH = 1000
- [`src/data/eve-data/station-names.ts:6, 17-18`](../../src/data/eve-data/station-names.ts#L6) — hand chunk loop over the ESI /universe/names cap of 1000
- [`src/data/eve-data/names-client.ts:29-37`](../../src/data/eve-data/names-client.ts#L29-L37) — hand chunk loop with policy.maxIds; each batch registers per-id promises
- [`src/composition/map-access-projection.ts:294-303`](../../src/composition/map-access-projection.ts#L294-L303) — hand chunk loop with a magic 32 over readonly mapIds (Convex limits)
- [`src/data/eve-data/source.ts:23-64`](../../src/data/eve-data/source.ts#L23-L64) — SdeJsonlName union and SDE_JSONL_NAMES array list the same 19 names; the array is annotated readonly SdeJsonlName[], so `as const` adds nothing
- [`src/data/eve-data/source.ts:74-89, 139-154`](../../src/data/eve-data/source.ts#L74-L89) — tmp → pipeline → rename, with unlink on error, written twice
- [`src/lib/array.ts:5-9`](../../src/lib/array.ts#L5-L9) — existing chunk; takes T[], so it must widen to readonly T[] for map-access-projection

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/station-names.ts:6`](../../src/data/eve-data/station-names.ts#L6) — ESI_UNIVERSE_NAMES_POST_MAX = 1000 is an ESI request cap, not the Postgres bind-parameter ceiling. Keep the constant; only the loop moves to chunk.
- [`src/data/eve-data/names-client.ts:5-8`](../../src/data/eve-data/names-client.ts#L5-L8) — maxIds is a per-endpoint client policy. Keep it.
- [`src/data/eve-data/tree-resolver.ts:445-446`](../../src/data/eve-data/tree-resolver.ts#L445-L446) — TREE_BATCH_SIZE 500 is sized for the large treeJson payload and FLAT 1000 for narrow rows. They are not interchangeable with one global constant.
- [`src/lib/batched-delete.ts:5`](../../src/lib/batched-delete.ts#L5) — DELETE_BATCH_SIZE 5000 bounds a DELETE ... LIMIT, not insert binds. It is a different concept.

</details>

**Home.** `src/data/eve-data/sde-io.ts gets streamJsonl, readJsonl and makeBatchInserter (moved from tree-resolver.ts). src/lib/array.ts keeps chunk, widened to readonly input. New src/lib/pg-upsert.ts holds excluded(). src/data/eve-data/source.ts gets a private pipeToFileAtomic.`

**Boundary check.** sde-io.ts, ingest.ts, tree-resolver.ts, universe.ts, industry-rules.ts and source.ts are all in data/eve-data, so those imports are intra-zone. gsc, market-prices, wh-observations, market-history, industry-indices and eve-data are in the data zone, and the 'from: data' rule allows lib for both chunk and pg-upsert. sde-pipeline.ts and map-access-projection.ts are in the composition zone, and the 'from: composition' rule allows lib. src/lib may import only config. drizzle-orm is an npm package, not a zone, and src/lib/batched-delete.ts already imports `sql` from drizzle-orm, so pg-upsert.ts in lib is legal.

**API sketch.**

```ts
// src/lib/array.ts
export function chunk<T>(items: readonly T[], size: number): T[][];
// src/lib/pg-upsert.ts
export function excluded(column: string): SQL; // sql.raw(`excluded.${column}`)
// src/data/eve-data/sde-io.ts
export async function* streamJsonl(path: string): AsyncGenerator<Record<string, unknown>>;
export async function readJsonl(path: string, keep?: (row: Record<string, unknown>) => boolean): Promise<Record<string, unknown>[]>;
export function makeBatchInserter<T>(batchSize: number, sink: (batch: T[]) => Promise<void>): { add(rows: readonly T[]): Promise<void>; flush(): Promise<void>; written(): number };
export async function insertChunked<T extends Record<string, unknown>>(tx: AnyPgDb, table: PgTable, rows: T[]): Promise<void>; // for (const b of chunk(rows, INSERT_BATCH))
// src/data/eve-data/source.ts
const SDE_JSONL_NAMES = [/* 19 names */] as const;
export type SdeJsonlName = (typeof SDE_JSONL_NAMES)[number];
async function pipeToFileAtomic(source: NodeJS.ReadableStream, dest: string): Promise<void>;
```

**Migration steps.**

1. src/lib/array.ts: widen chunk to `items: readonly T[]`. Existing callers are unaffected.
2. src/data/gsc/ingest.ts: delete the private chunk at lines 111-115 and import { chunk } from '@/lib/array'.
3. Add src/lib/pg-upsert.ts exporting excluded(column). Replace the five local copies in gsc/ingest.ts, market-prices/ingest.ts, wh-observations/queries.ts, market-history/ingest.ts and industry-indices/ingest.ts. Add src/lib/pg-upsert.test.ts, because fallow coverage requires every file to be covered.
4. sde-io.ts: add the streamJsonl async generator (readline over createReadStream with crlfDelay Infinity, skipping blank lines, then JSON.parse). Make readJsonl collect from it with keep. Move makeBatchInserter here from tree-resolver.ts and update tree-resolver's import. Rewrite insertChunked as for (const batch of chunk(rows, INSERT_BATCH)).
5. ingest.ts: rewrite streamInsert as `const ins = makeBatchInserter(BATCH_SIZE, flush); for await (const row of streamJsonl(path)) { const m = mapRow(row); if (m) await ins.add([m]); } await ins.flush(); return ins.written();`. Drop the node:fs and node:readline imports. It must stay streaming, because typeDogma.jsonl is large.
6. Move the describe('makeBatchInserter') block from tree-resolver.test.ts into a new sde-io.test.ts. Add a streamJsonl/readJsonl test on a temp file containing blank lines and a keep filter.
7. Rewrite the loops in composition/pipelines/sde-pipeline.ts (47-55) and market-prices/ingest.ts (105-125) as for (const batch of chunk(rows, BATCH)).
8. Rewrite the loops in station-names.ts, names-client.ts and map-access-projection.ts as chunk loops, keeping each one's own constant. Name map-access-projection's 32 (for example MAP_CLAIM_REVOKE_BATCH). Do not merge any constants.
9. source.ts: declare SDE_JSONL_NAMES `as const` without the type annotation and derive SdeJsonlName from it. Extract pipeToFileAtomic(source, dest) for tmp → pipeline → rename, with unlink on failure and a rethrow. streamToFileAtomic calls it with Readable.fromWeb(body); extractEntries calls pipeToFileAtomic(readStream, dest).then(...).catch(fail).

**Tests.** ingest.db.test.ts writes real JSONL temp files through runIngest and guards streamInsert's counts and skipped rows; it must pass unchanged. The makeBatchInserter tests move from tree-resolver.test.ts (lines 545-575) to sde-io.test.ts, where a new streamJsonl/readJsonl test also goes (blank lines, keep filter). universe.test.ts and industry-rules.test.ts cover readJsonl and insertChunked. source.test.ts covers downloads, cleanup and the manifest; add a case where a failed pipe leaves no .tmp file behind, if none exists yet. Add a new pg-upsert.test.ts asserting the excluded SQL fragment. Also run lib/array.test.ts, gsc/ingest.test.ts, station-names.test.ts and station-names.db.test.ts, names-client.test.ts and type-names-client.test.ts, the market-prices, market-history, industry-indices and wh-observations ingest/query tests, and the map-access-projection tests.

**Notes.** Each batch size must be preserved exactly: 500 in ingest, 1000 in insertChunked, FLAT 1000 and TREE 500, ESI 1000, Convex 32 and names-client maxIds. These are different ceilings, so the proposed single PG_INSERT_BATCH constant is dropped. makeBatchInserter hands the sink a fresh array after each flush (the buffer is reassigned), as streamInsert does today. Keep this so a sink may retain its batch. names-client must keep its per-id promise registration and its delete-on-error retry semantics inside the chunk loop; only the index arithmetic changes. extractEntries currently starts unlink(tmp) without awaiting it before calling fail(). The helper awaits the unlink and then rethrows. This only changes ordering and is harmless, but fail() must still close the zipfile. streamJsonl must stay a lazy async generator: readJsonl's keep-filter (used on typeDogma in industry-rules.ts:234) relies on never holding the whole file. Neither copy has a drift bug; the union/array split in source.ts is a latent one, because adding a name to only the union compiles and then fails at runtime with a missing file.

<sub>Reported by: area:data-eve.</sub>

<a id="p264"></a>

## P264: Give data/eve-data/coerce.ts asRecord, mapRecords and dogmaAttributePairs, and route every SDE parser through them

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -45 / +30, plus about -10 more if the optional JSONL reader is extracted.
- **Depends on:** [P172](#p172)
- **Existing primitive:** `src/data/eve-data/coerce.ts:intOrNull/numOrNull/strOrNull/localizedEn`

**Problem.** coerce.ts is the SDE coercion module, but each parser builds its own record guard and list scaffolding around it:
- activities.ts has asObject and mapEntries.
- industry-rules.ts has rowsOf plus bare `as Record<string, unknown>` casts.
- ingest.ts and industry-rules.ts parse the same dogmaAttributes [{attributeID, value}] list, into a Record and a Map respectively.
- universe-assets and wormhole-effects re-write the plain-object guard three different ways.

The copies have drifted. The cast-based parsers throw on null entries that activities.ts skips, and wormhole-effects' two guards disagree on arrays.

**Verifier revision.** The duplication is real, and there are drift bugs the proposal misses. activities.ts owns a correct record guard and list mapper (27-46): null and primitive entries are skipped, which activities.test.ts:97-112 tests. industry-rules.ts reaches the same entries through bare casts instead: `m as Record<string, unknown>` (116), `(a as Record<string, unknown>).attributeID` (128-129) and `raw as Record` (172). A null entry there throws a TypeError instead of being skipped. ingest.ts:221-228 repeats the same dogmaAttributes loop with the same cast, also unsafe on null. wormhole-effects has two guards that disagree: beaconModifiers (201) rejects arrays, while beaconAttributeIds (246) accepts them and would add index ids 0, 1, and so on. universe-assets (218-229) writes the guard a third way. So the proposal's 'behaviour must stay identical' is wrong for malformed rows: the activities.ts semantics (skip non-records) are correct and should become uniform. rowsOf (218-223) is mapEntries applied to already-parsed records and folds in too. A further verified duplication in the same scaffolding: sde-io.readJsonl (9-25) and ingest.streamInsert (49-80) each implement the JSONL line reader (createInterface, trim, skip blank lines, JSON.parse as Record).

**Sites (13).**

- [`src/data/eve-data/coerce.ts:1-26`](../../src/data/eve-data/coerce.ts#L1-L26) — intOrNull, numOrNull, strOrNull, boolOf, localizedEn; no record or list helper; no coerce.test.ts
- [`src/data/eve-data/activities.ts:27-46, 48-80`](../../src/data/eve-data/activities.ts#L27-L46) — asObject (rejects null and arrays) and mapEntries (skips non-records): the correct semantics
- [`src/data/eve-data/industry-rules.ts:76-83`](../../src/data/eve-data/industry-rules.ts#L76-L83) — idList: an inline typeof-object guard plus a cast to read the keyed id
- [`src/data/eve-data/industry-rules.ts:113-123`](../../src/data/eve-data/industry-rules.ts#L113-L123) — parseEffectModifiers: `m as Record`; a null modifierInfo entry throws
- [`src/data/eve-data/industry-rules.ts:125-133`](../../src/data/eve-data/industry-rules.ts#L125-L133) — parseSourceDogma: the dogmaAttributes loop into a Map, with casts
- [`src/data/eve-data/industry-rules.ts:170-184`](../../src/data/eve-data/industry-rules.ts#L170-L184) — kindEntries (`raw as Record`) and sourceEntries (a guard that accepts arrays, then a cast)
- [`src/data/eve-data/industry-rules.ts:218-223, 240`](../../src/data/eve-data/industry-rules.ts#L218-L223) — rowsOf: mapEntries over records already parsed by readJsonl
- [`src/data/eve-data/ingest.ts:215-233`](../../src/data/eve-data/ingest.ts#L215-L233) — typeDogma: the same dogmaAttributes loop into a Record<string, number>, with casts
- [`src/data/eve-data/universe-assets.ts:218-229`](../../src/data/eve-data/universe-assets.ts#L218-L229) — dogmaAttributes(row): a plain-object guard that throws when missing
- [`src/data/eve-data/wormhole-effects.ts:197-210`](../../src/data/eve-data/wormhole-effects.ts#L197-L210) — beaconModifiers: a guard that rejects arrays
- [`src/data/eve-data/wormhole-effects.ts:243-252`](../../src/data/eve-data/wormhole-effects.ts#L243-L252) — beaconAttributeIds: a guard that accepts arrays (drift from beaconModifiers)
- [`src/data/eve-data/sde-io.ts:9-25`](../../src/data/eve-data/sde-io.ts#L9-L25) — readJsonl's line loop
- [`src/data/eve-data/ingest.ts:49-80`](../../src/data/eve-data/ingest.ts#L49-L80) — streamInsert re-implements the same JSONL line loop (batch of 500 vs sde-io's insert batch of 1000)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/universe.ts:279-281`](../../src/data/eve-data/universe.ts#L279-L281) — The services id filter keeps any number without truncating. It could use idList, but nothing is wrong with it; optional.
- [`src/features/feedback/create-linear-issue.ts:23-25`](../../src/features/feedback/create-linear-issue.ts#L23-L25) — An isRecord in another zone. Part of a possible repo-wide src/lib guard (lead only); out of scope here.

</details>

**Home.** `src/data/eve-data/coerce.ts for asRecord, mapRecords and dogmaAttributePairs. Optionally, src/data/eve-data/sde-io.ts for a shared jsonlRecords async generator.`

**Boundary check.** Every consumer (activities, industry-rules, ingest, universe-assets, wormhole-effects, sde-io) is in the data/eve-data zone, which imports itself freely. coerce.ts stays dependency-free, so any other data/* zone may import it later: the data rule allows data/eve-data.

**API sketch.**

```ts
// src/data/eve-data/coerce.ts
/** A non-null, non-array object, else null. */
export function asRecord(v: unknown): Record<string, unknown> | null;
/** [] unless an array; skips non-record entries and entries fn maps to null. */
export function mapRecords<T>(list: unknown, fn: (entry: Record<string, unknown>) => T | null): T[];
/** SDE dogmaAttributes [{ attributeID, value }] as [id, value] pairs; attributeID via intOrNull, value via numOrNull, invalid entries skipped, input order kept. */
export function dogmaAttributePairs(list: unknown): Array<readonly [attributeId: number, value: number]>;
// optional, src/data/eve-data/sde-io.ts
export async function* jsonlRecords(path: string): AsyncGenerator<Record<string, unknown>>;
```

**Migration steps.**

1. Add asRecord, mapRecords and dogmaAttributePairs to coerce.ts, with a new coerce.test.ts. Cover null, array, primitive and record entries, truncated ids, non-numeric values and duplicate attribute ids (last one wins when collected).
2. In activities.ts, delete asObject and mapEntries (27-46) and use asRecord and mapRecords. Behaviour is identical.
3. In industry-rules.ts:
4. - parseEffectModifiers uses mapRecords(r.modifierInfo, ...).
5. - parseSourceDogma uses new Map(dogmaAttributePairs(r.dogmaAttributes)).
6. - kindEntries uses mapRecords(list, ...).
7. - sourceEntries uses asRecord(kinds) instead of the typeof check and cast.
8. - idList reads the keyed id through asRecord(entry)?.[key].
9. - Delete rowsOf and call mapRecords(filterRows, parseTargetFilter) and the like at line 240.
10. In ingest.ts typeDogma (215-233), keep `if (typeId === null || !Array.isArray(list)) return null` and build attributes as Object.fromEntries(dogmaAttributePairs(list).map(([id, value]) => [String(id), value])).
11. In universe-assets.ts dogmaAttributes, use `const attrs = asRecord(row.attributes); if (attrs === null) throw ...` and keep the error message.
12. In wormhole-effects.ts, use asRecord in beaconModifiers (201) and in beaconAttributeIds (246). The latter now also rejects arrays, matching beaconModifiers.
13. Optional: extract jsonlRecords(path) in sde-io.ts. readJsonl collects from it with keep, and ingest.streamInsert iterates it, keeping its own BATCH_SIZE of 500.

**Tests.** New: src/data/eve-data/coerce.test.ts. It is needed because fallow coverage-gaps requires every file to be covered.

Existing guards:
- activities.test.ts:97-112 (malformed entries)
- industry-rules.test.ts:63-117 and 152-221 (resolveModifiers, parsers, parseIndustryRules)
- ingest.db.test.ts
- universe-assets.test.ts and universe-assets.db.test.ts
- wormhole-effects.test.ts and wormhole-effects.db.test.ts

Add cases:
- industry-rules: a null entry in modifierInfo, dogmaAttributes and a kind list is skipped, not thrown.
- wormhole-effects: beaconAttributeIds ignores array-shaped attributes.

**Notes.** Behaviour differences to reconcile:
- Null or primitive entries. industry-rules.ts and ingest.ts casts throw a TypeError on null; activities.ts skips. Skipping is correct and becomes uniform. Real SDE data has no such rows, so only malformed input changes.
- Arrays as records. industry-rules sourceEntries and wormhole-effects beaconAttributeIds accept arrays; activities and beaconModifiers reject them. Rejecting is correct.
- Missing dogma list. ingest skips the whole type row when dogmaAttributes is not an array, while industry-rules yields an empty Map. Keep that difference at the call sites, not in dogmaAttributePairs.
- Duplicate attribute ids. Both current loops keep the last value (object assignment and Map.set); preserve that by keeping input order.
- universe-assets must keep throwing on missing dogma.

Lead for a separate opportunity (not verified in depth): plain-object guards are re-written outside this zone at features/feedback/create-linear-issue.ts:23, data/convex/heartbeat-peers.ts:23, mapper/tracking/doorbell-model.ts:143,167,186,245, lib/failure.ts:94, convex/mapStatics.ts:53 and convex/mapHallwayBackfill.ts:34. If a src/lib isRecord lands, coerce.asRecord should delegate to it.

<sub>Reported by: area:data-eve.</sub>

<a id="p233"></a>

## P233: Type the eve-data jsonb columns with $type<T>() and validate blueprint activities once at ingest

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** simplification · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** -25 / +30
- **Depends on:** [P264](#p264)
- **Existing primitive:** `drizzle jsonb().$type<T>() as used in src/data/wh-statics/schema.ts`

**Problem.** Three SDE jsonb columns are untyped, so every reader casts: `as AttrMap` (5 sites), `as BlueprintActivities` (6 sites including a whole-row cast) and `as TreeNode[]` (1 site). The raw activities type ActivityIO describes materials, products and time but not skills or product probability. Nothing validates the activities document on the single write path, so the casts are claims that nothing checks. activities.ts is the only reader that validates, and it is not the stored-shape model.

**Verifier revision.** Confirmed. typeDogma.attributes, industryBlueprints.activities and blueprintTrees.treeJson are bare jsonb(). Readers cast them 13 times across queries.ts, blueprint-shaping.ts, tree-resolver.ts, structures.ts and character-facts.ts, while about 30 other columns in the repo use jsonb().$type<T>(). Three points change. (1) AttrMap is already in types.ts. Only BlueprintActivities/ActivityIO and TreeNode need to move, and moving them is required because tree-resolver imports schema. (2) The 'pick one activities reader' part is reframed rather than kept. parseBlueprintActivities is a normaliser to a different view (an array over ALL_ACTIVITY_NAMES, with skills and probability) consumed by industry-planner. The resolver and search hot paths read the raw keyed shape over every blueprint. Routing them through the parser would allocate more and change which entries survive. The real gap is that the declared raw type (ActivityIO) omits skills and probability, which are present in the stored document, so that type should be completed. (3) Ingest does no shape check today (ingest.ts:240-242 stores r.activities verbatim after an undefined check), so one has to be added, not kept. Typing the column turns that write into a compile error until it is added.

**Sites (14).**

- [`src/data/eve-data/schema.ts:85-88, 109-113, 115-123`](../../src/data/eve-data/schema.ts#L85-L88) — attributes, activities, tree_json declared as bare jsonb().notNull()
- [`src/data/eve-data/queries.ts:136-150`](../../src/data/eve-data/queries.ts#L136-L150) — getTypeAttributesBatch: r.attributes as AttrMap (147)
- [`src/data/eve-data/queries.ts:152-165`](../../src/data/eve-data/queries.ts#L152-L165) — getBlueprintTree: row.treeJson as TreeNode[] (164)
- [`src/data/eve-data/queries.ts:167-209`](../../src/data/eve-data/queries.ts#L167-L209) — mapBlueprintActivities derive(raw: unknown); casts at 191, 199
- [`src/data/eve-data/queries.ts:221-237`](../../src/data/eve-data/queries.ts#L221-L237) — getBlueprintOutput: cast at 236
- [`src/data/eve-data/queries.ts:348-373, 395-398`](../../src/data/eve-data/queries.ts#L348-L373) — getStructureTypes leftJoin cast at 365; capital shipyard cast at 398 (row may be missing)
- [`src/data/eve-data/blueprint-shaping.ts:49-68, 90-103`](../../src/data/eve-data/blueprint-shaping.ts#L49-L68) — rows typed activities: unknown; casts at 55 and 97
- [`src/data/eve-data/tree-resolver.ts:19-24, 73-78, 168-184, 300-310`](../../src/data/eve-data/tree-resolver.ts#L19-L24) — TreeNode and ActivityIO/BlueprintActivities defined here (tree-resolver imports ./schema); whole-row cast 178-182; cast 303
- [`src/data/eve-data/activities.ts:74-91`](../../src/data/eve-data/activities.ts#L74-L91) — defensive normaliser to BlueprintActivitySet; reads skills and probability, which ActivityIO lacks
- [`src/data/eve-data/structures.ts:78-90`](../../src/data/eve-data/structures.ts#L78-L90) — shapeStructureRigs(attributes: unknown) cast at 83
- [`src/data/eve-data/character-facts.ts:146-169`](../../src/data/eve-data/character-facts.ts#L146-L169) — leftJoin typeDogma; cast at 166
- [`src/data/eve-data/ingest.ts:215-247`](../../src/data/eve-data/ingest.ts#L215-L247) — dogma folded to Record<string, number> (compatible with AttrMap); activities written verbatim with no shape check (240-242)
- [`src/data/eve-data/types.ts:1-19`](../../src/data/eve-data/types.ts#L1-L19) — import-free; AttrMap already lives here
- [`src/data/wh-statics/schema.ts:79-81`](../../src/data/wh-statics/schema.ts#L79-L81) — existing jsonb().$type<T>() pattern (also in about 25 other schemas)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/universe-assets.ts:218-228`](../../src/data/eve-data/universe-assets.ts#L218-L228) — Deliberate runtime validation that throws a named error when a wormhole type has no dogma row (leftJoin). Keep it. A typed column just flows into its unknown param.
- [`src/data/eve-data/wormhole-effects.ts:197-209`](../../src/data/eve-data/wormhole-effects.ts#L197-L209) — beaconModifiers(attributes: unknown) filters non-finite values defensively for artifact generation. Keep.
- [`src/data/eve-data/industry-rules.ts:79-182`](../../src/data/eve-data/industry-rules.ts#L79-L182) — Casts on raw SDE JSONL records during parsing, not DB column reads
- [`src/data/eve-data/ingest.ts:223-224`](../../src/data/eve-data/ingest.ts#L223-L224) — casts on raw JSONL dogma entries before folding, not column reads

</details>

**Home.** `src/data/eve-data/types.ts (BlueprintActivities, ActivityIO, TreeNode join the existing AttrMap); column typing in src/data/eve-data/schema.ts; ingest guard in src/data/eve-data/activities.ts`

**Boundary check.** types.ts, schema.ts, activities.ts, ingest.ts, queries.ts, tree-resolver.ts, blueprint-shaping.ts, structures.ts and character-facts.ts are all in the data/eve-data zone (intra-zone). The TreeNode consumers in src/features/industry-planner (multibuy.ts, build-tree.ts, build-batch.ts, queries.ts, types.ts) are features; rule `features` allows `data`. types.ts has no imports, so schema.ts -> types.ts adds no cycle, whereas schema.ts -> tree-resolver.ts would (tree-resolver imports ./schema).

**API sketch.**

```ts
// types.ts
export type AttrMap = Record<number, number>; // existing
export type ActivityIO = { materials?: { typeID: number; quantity: number }[]; products?: { typeID: number; quantity: number; probability?: number }[]; skills?: { typeID: number; level: number }[]; time?: number };
export type BlueprintActivities = Record<string, ActivityIO | undefined>;
export type TreeNode = { typeId: number; quantity: number; inputs: TreeNode[]; producedBy?: { blueprintTypeId: number; quantityPerRun: number; runsNeeded: number } };
// schema.ts
attributes: jsonb('attributes').$type<AttrMap>().notNull(),
activities: jsonb('activities').$type<BlueprintActivities>().notNull(),
treeJson: jsonb('tree_json').$type<TreeNode[]>().notNull(),
// activities.ts
export function isBlueprintActivitiesDocument(raw: unknown): raw is BlueprintActivities;
```

**Migration steps.**

1. Move TreeNode (tree-resolver.ts:19-24) and ActivityIO/BlueprintActivities (tree-resolver.ts:73-78) into types.ts. Complete ActivityIO with products[].probability and skills[] so it describes the stored CCP document. Update imports in tree-resolver.ts, blueprint-shaping.ts, queries.ts and src/features/industry-planner/{multibuy,build-tree,build-batch,queries,types}.ts. Do not leave a re-export in tree-resolver.
2. Add `.$type<...>()` to the three columns in schema.ts. $type is compile-time only, so drizzle-kit generate must produce no migration; confirm it does not.
3. ingest.ts:237-242: add a guard (isBlueprintActivitiesDocument in activities.ts: object, and each present activity's materials/products are arrays of {typeID:int, quantity:int}). Return null for rows that fail, the same way the existing `activities === undefined` check does. Dogma ingest already produces Record<string, number>, which is assignable to AttrMap.
4. Delete the casts: queries.ts:147, 164, 191, 199, 236; tree-resolver.ts:178-182 (the rows cast) and 303; blueprint-shaping.ts:55, 97 (change the row param types from `activities: unknown` to `BlueprintActivities` and drop `?? {}`); mapBlueprintActivities' derive param becomes `(activities: BlueprintActivities)`.
5. Left-join readers keep their null fallback but lose the cast: queries.ts:365 and character-facts.ts:166 become `r.attributes ?? {}`, and queries.ts:398 becomes `shipyard[0]?.attributes ?? {}`. structures.ts shapeStructureRigs param becomes `attributes: AttrMap | null`.
6. Keep parseBlueprintActivities as the normalised view for getBlueprintActivities (it accepts unknown, so typed input still compiles). Do not route the resolver, search or tracked-type readers through it.

**Tests.** Add an activities.test.ts case for isBlueprintActivitiesDocument (accepts the MFG_681/RXN_46175/INV_683 fixtures; rejects non-objects and entries without integer typeID/quantity). Add an ingest.db.test.ts case where a blueprint row with malformed activities is skipped. Adjust the fixtures that pass null into typed helpers: blueprint-shaping.test.ts:101 (`activities: null`) and structures.test.ts:148 (`attributes: null`), either keeping a `| null` param or changing the fixture. Existing guards: tree-resolver.test.ts (hashResolverInputs/activitiesToRows), blueprint-shaping.test.ts, activities.test.ts, structures.test.ts, eve-data queries.db.test.ts, capital-shipyard.db.test.ts, character-facts.db.test.ts.

**Notes.** The only runtime change is the new ingest guard. Everything else is type-only, and the DDL is unchanged. AttrMap is Record<number, number> while stored JSON keys are strings; numeric property access coerces, as it already does today. Keep the `?? {}` fallbacks on leftJoin reads (getStructureTypes, getSkillCatalog) and on the possibly-missing capital-shipyard row; drop them only on inner-join or base-table reads, where lint will flag them as unnecessary once the type is non-null. Do not unify the raw keyed model with BlueprintActivitySet. They are stored shape and normalised view; the resolver and hash read every blueprint and rely on the raw shape. The hash input (hashResolverInputs) counts materials and products across all keys, so rejecting rows at ingest can change the tree hash for malformed SDE rows. This is intended, and the resolver recomputes on hash change.

<sub>Reported by: area:data-eve.</sub>

<a id="p293"></a>

## P293: Read tree-resolver inputs once per resolveAllTrees and derive the hash, indexes and blueprint ids from them

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +12
- **Depends on:** [P233](#p233), [P172](#p172)

**Problem.** resolveAllTrees reads the whole industry_blueprints table (with activities JSON, left-joined to eve_types) once to hash it. On a rebuild it reads the identical result again in buildIndexes and then selects every blueprint id a third time. Two private functions hold the same query, so the hash and the indexes can in principle come from different snapshots.

**Verifier revision.** Partly holds. Confirmed: buildIndexes (168-184) and computeTreeResolverHash (332-342) run the identical select (industryBlueprints LEFT JOIN eveTypes on blueprintTypeId, columns blueprintTypeId/activities/published). resolveAllTrees then selects every blueprint id a third time (441-443), and those ids are exactly the blueprintTypeIds of the same rows, because the left join from industry_blueprints to the eve_types primary key yields one row per blueprint. runSdePipeline runs runIngest (which truncates and reloads industry_blueprints) right before resolveAllTrees, so a drift run nearly always takes the rebuild path and reads the table twice. One read also makes the stored tree hash describe exactly the rows the trees were built from. The payoff is modest: one full read of roughly 5k blueprint activity JSON rows on a cron that runs only on SDE drift and spends about 60s in the resolver against a 300s maxDuration. Rejected: running parseUniverse and parseIndustryRules together. Both already Promise.all their own readJsonl files, the work is CPU-bound JSON.parse on one thread over local temp files, so running them together gains almost no wall time and raises peak memory. Rejected: Promise.all for the hashBefore meta read, which saves a single indexed row lookup on a rare cron.

**Sites (6).**

- [`src/data/eve-data/tree-resolver.ts:168-184`](../../src/data/eve-data/tree-resolver.ts#L168-L184) — buildIndexes: select { blueprintTypeId, activities, published } from industryBlueprints leftJoin eveTypes, cast, then buildIndexesFromActivities.
- [`src/data/eve-data/tree-resolver.ts:332-342`](../../src/data/eve-data/tree-resolver.ts#L332-L342) — computeTreeResolverHash: the identical select, then hashResolverInputs.
- [`src/data/eve-data/tree-resolver.ts:417-443`](../../src/data/eve-data/tree-resolver.ts#L417-L443) — resolveAllTrees: meta read 421, hash read 422, buildIndexes re-read 438, third select of ids 441-443, loop over ids 464-467.
- [`src/data/eve-data/tree-resolver.ts:126-166,286-330`](../../src/data/eve-data/tree-resolver.ts#L126-L166) — buildIndexesFromActivities sorts a copy (order-independent, tested at tree-resolver.test.ts:353-354) and hashResolverInputs sorts its samples, so feeding both the same unordered rows is safe.
- [`src/composition/pipelines/sde-pipeline.ts:61-67`](../../src/composition/pipelines/sde-pipeline.ts#L61-L67) — runIngest then resolveAllTrees. The ingest reloads industry_blueprints, so the rebuild path is the common case on drift.
- [`src/scripts/ingest-sde-if-empty.ts:30-51`](../../src/scripts/ingest-sde-if-empty.ts#L30-L51) — Second caller (script); same behavior.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/ingest.ts:89-90`](../../src/data/eve-data/ingest.ts#L89-L90) — parseUniverse/parseIndustryRules: each already parallelizes its file reads (universe.ts:342-361, industry-rules.ts:225-234). Overlapping two CPU-bound single-thread parses gains little and raises peak memory, so rejected.
- [`src/data/eve-data/tree-resolver.ts:421`](../../src/data/eve-data/tree-resolver.ts#L421) — getSdeMetaValue is a single-row lookup; running it concurrently saves one round trip on a rare cron, so rejected.

</details>

**Home.** `In place: a private readResolverInputs(db) inside src/data/eve-data/tree-resolver.ts, replacing buildIndexes and computeTreeResolverHash.`

**Boundary check.** All changes stay in src/data/eve-data/tree-resolver.ts (data zone, data/eve-data). It already imports @/lib/db-types and @/lib/env (data → lib allowed) and ./schema, ./meta, ./constants (same zone). No new imports.

**API sketch.**

```ts
type ResolverInputRow = { blueprintTypeId: number; activities: BlueprintActivities; published: boolean | null };
async function readResolverInputs(db: AnyPgDb): Promise<ResolverInputRow[]>; // the single select, cast once
// resolveAllTrees:
const hashBefore = await getSdeMetaValue(db, SDE_META_KEY_TREE_HASH);
const rows = await readResolverInputs(db);
const hashAfter = hashResolverInputs(rows);
if (skip) return …;
const resolver = new TreeResolver(buildIndexesFromActivities(rows));
const blueprintIds = rows.map((r) => r.blueprintTypeId);
```

**Migration steps.**

1. Add private readResolverInputs(db) holding the select from buildIndexes (168-176) and the cast from 177-183.
2. resolveAllTrees: replace `await computeTreeResolverHash(db)` with `rows = await readResolverInputs(db); hashAfter = hashResolverInputs(rows)`.
3. On the rebuild path, replace `await buildIndexes(db)` with `buildIndexesFromActivities(rows)`. Replace the allBlueprintIds select (441-443) with `rows.map((r) => r.blueprintTypeId)`, and change the loop to iterate ids. blueprintsResolved becomes ids.length.
4. Do not reference `rows` after indexes and ids are built, so the row array can be collected during the long insert loop.
5. Delete buildIndexes and computeTreeResolverHash. Leave runIngest's parse order and the meta read unchanged.

**Tests.** No test exercises resolveAllTrees today; grep finds none. Add src/data/eve-data/tree-resolver.db.test.ts using createDbTestHarness (pattern from ingest.db.test.ts, describe.skipIf(!harness.reachable)). Seed a small industry_blueprints + eve_types set and run resolveAllTrees. Assert skipped=false, blueprintsResolved equals the seeded count, blueprint_trees/blueprint_flat_materials are populated, and the stored tree hash equals hashResolverInputs(seeded rows). A second run must return skipped=true. Guards that already exist: tree-resolver.test.ts covers buildIndexesFromActivities order-independence and hashResolverInputs.

**Notes.** The id loop currently follows the unordered third select. Switching to the order of the first select changes only insert order and the memoHits/memoMisses statistics, never the stored trees or flat rows, because TreeResolver memoizes per blueprint and is order-independent. Peak memory: today the hash rows go out of scope before buildIndexes re-reads, so with one read the implementer should keep `rows` unreferenced past index and id construction. The cron's maxDuration is 300s with about 60s typical in the resolver (src/app/api/cron/refresh-sde/route.ts:8-22). The time saved is a small share of that, so the main value is one query and consistency between hash and trees.

<sub>Reported by: area:data-eve.</sub>

<a id="p235"></a>

## P235: Move the repeated usage_logs fragments (day, outcome, summedInt, referrer predicates, refreshed-price-cron filter) into telemetry/sql.ts and drop getFallbackRate's redundant totals query

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** -35 / +20
- **Depends on:** —
- **Existing primitive:** `src/data/telemetry/sql.ts:jsonInt,jsonNumber,capabilityOutcome`

**Problem.** queries.ts and sli-breakdown.ts re-type the same usage_logs metadata expressions. The day expression `to_char(date_trunc('day', timestamp), 'YYYY-MM-DD')` appears 4 times. `metadata ->> 'outcome'` is rebuilt 5 times beside the exported capabilityOutcome. `coalesce(sum(jsonInt(k)), 0)` is inlined 4 times though summedInt exists at 517. The external-referrer predicate appears 3 times and its negation once. getFallbackRate and getRefreshVolume each spell the same cron_prices/refreshed WHERE. getFallbackRate issues a separate totals query whose result is the sum of its per-day rows.

**Verifier revision.** Confirmed duplication, all inside data/telemetry. The day-truncation expression appears 4 times, the outcome accessor is rebuilt 5 times although sql.ts:21 has it, summedInt is inlined 4 times before its own definition, the referrer predicate and its negation appear 4 times, the 'refreshed cron_prices' WHERE is written twice, and getFallbackRate runs a totals query that equals the sum of its per-day query. The design has to change in three ways. (1) A generic metaText(key) must not bind the key as a parameter. Drizzle renders each occurrence as a fresh $n, so `metadata ->> $1` in SELECT and `metadata ->> $3` in GROUP BY do not match. That is why topByMetadataKeyQuery groups by ordinal 1, and queries.test.ts:18-30 pins it, including that 'referrer' appears exactly twice in params. Shared accessors must render the key as an SQL literal. (2) Shared fragments must be functions or never have .mapWith()/.as() called on them, because Drizzle's SQL.mapWith mutates the instance. summedInt must stay a factory. (3) capabilityCode and capabilityErrorClass have one consumer (sli-breakdown.ts), so under the AGENTS.md second-consumer rule they stay where they are. Most of the roughly 20 `->>` sites are single-use keys (actorCharacterId, from, to, endpoint, windowStartedAt), and wrapping them in a helper is optional and cosmetic.

**Sites (16).**

- [`src/data/telemetry/sql.ts:5-34`](../../src/data/telemetry/sql.ts#L5-L34) — existing inRange, jsonInt, jsonNumber, capabilityFeature/Operation/Outcome (literal keys), esiDependent, capabilityRows
- [`src/data/telemetry/queries.ts:56`](../../src/data/telemetry/queries.ts#L56) — day expression (getDailyCounts)
- [`src/data/telemetry/queries.ts:178`](../../src/data/telemetry/queries.ts#L178) — day expression (getFallbackRate)
- [`src/data/telemetry/queries.ts:337`](../../src/data/telemetry/queries.ts#L337) — day expression (getRefreshVolume)
- [`src/data/telemetry/sli-breakdown.ts:23-25`](../../src/data/telemetry/sli-breakdown.ts#L23-L25) — fourth day copy at 25; capabilityCode/capabilityErrorClass private, single consumer
- [`src/data/telemetry/queries.ts:182, 284, 318, 347, 562`](../../src/data/telemetry/queries.ts#L182) — metadata ->> 'outcome' rebuilt; 318 typed string\|null, others string
- [`src/data/telemetry/queries.ts:124`](../../src/data/telemetry/queries.ts#L124) — getTopReferrers extraWhere: lower(referrer) <> EVE_SSO_HOST (null already excluded by isNotNull(col) at 89)
- [`src/data/telemetry/queries.ts:383-390`](../../src/data/telemetry/queries.ts#L383-L390) — getTrafficTotals.referrals at 387: external-referrer filter
- [`src/data/telemetry/queries.ts:392-404`](../../src/data/telemetry/queries.ts#L392-L404) — getSearchVsDirect: referred (393) is identical to 387; direct (396) is its exact negation
- [`src/data/telemetry/queries.ts:173-204`](../../src/data/telemetry/queries.ts#L173-L204) — getFallbackRate: summedInt inlined (174-177); totals + perDay over the same WHERE (185-193)
- [`src/data/telemetry/queries.ts:336-357`](../../src/data/telemetry/queries.ts#L336-L357) — getRefreshVolume: summedInt inlined (338-339); same cron_prices + outcome='refreshed' WHERE as 179-183
- [`src/data/telemetry/queries.ts:517-519`](../../src/data/telemetry/queries.ts#L517-L519) — summedInt defined after its inlined copies
- [`src/data/telemetry/queries.ts:129, 386`](../../src/data/telemetry/queries.ts#L129) — is_entry accessor twice
- [`src/data/telemetry/queries.ts:214, 224`](../../src/data/telemetry/queries.ts#L214) — budgetExhausted = 'true' predicate twice
- [`src/data/telemetry/queries.ts:235, 266`](../../src/data/telemetry/queries.ts#L235) — caller accessor twice
- [`src/data/telemetry/queries.test.ts:18-30`](../../src/data/telemetry/queries.test.ts#L18-L30) — pins GROUP BY 1 and that the param-bound key appears exactly twice; constrains the design

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/telemetry/queries.ts:78-116`](../../src/data/telemetry/queries.ts#L78-L116) — topByMetadataKeyQuery binds the key as a parameter on purpose and groups by ordinal; keep it and do not route it through a literal accessor
- [`src/data/telemetry/queries.ts:138-141, 257, 591`](../../src/data/telemetry/queries.ts#L138-L141) — single-use keys (actorCharacterId, targetCharacterId, from, to, windowStartedAt, endpoint); a helper is optional and cosmetic
- [`src/data/telemetry/sli-breakdown.ts:23-24`](../../src/data/telemetry/sli-breakdown.ts#L23-L24) — capabilityCode/capabilityErrorClass: one consumer, so leave them in place
- [`src/data/telemetry/sli-breakdown.ts:108-112`](../../src/data/telemetry/sli-breakdown.ts#L108-L112) — dependencyAverage uses a nested -> path; single site
- [`src/data/gsc/queries.ts:62-63`](../../src/data/gsc/queries.ts#L62-L63) — coalesce(sum(col)) over a real column in another zone, not usage_logs metadata

</details>

**Home.** `src/data/telemetry/sql.ts (existing)`

**Boundary check.** sql.ts, queries.ts and sli-breakdown.ts are all in the data/telemetry zone (intra-zone imports). sql.ts gains an import of EVE_SSO_HOST from src/lib/eve-provider.ts. Rule `data` allows `lib`, and queries.ts already imports it.

**API sketch.**

```ts
// sql.ts
export const usageDay = sql<string>`to_char(date_trunc('day', ${usageLogs.timestamp}), 'YYYY-MM-DD')`;
export const metadataOutcome = sql<string | null>`${usageLogs.metadata} ->> 'outcome'`; // replaces capabilityOutcome
export function summedInt(key: string): SQL<number>; // factory: fresh SQL per call because mapWith mutates
const referrer = sql<string | null>`${usageLogs.metadata} ->> 'referrer'`;
export const externalReferrer = sql<boolean>`(${referrer} is not null and lower(${referrer}) <> ${EVE_SSO_HOST})`;
export const directVisit = sql<boolean>`not ${externalReferrer}`;
export function refreshedPriceCron(range: DateRange): SQL; // and(inRange(range), eq(usageLogs.action, 'cron_prices'), eq(metadataOutcome, 'refreshed'))
// optional: export function metaText(key: MetadataKey) rendering the key with sql.raw as a literal; MetadataKey is a closed literal union
```

**Migration steps.**

1. In sql.ts, add usageDay, rename capabilityOutcome to metadataOutcome typed string | null (update its 9 uses in queries.ts and sli-breakdown.ts), move summedInt from queries.ts:517-519, and add externalReferrer, directVisit and refreshedPriceCron(range). Render every metadata key as an SQL literal, never as ${key}.
2. queries.ts: replace the day copies at 56, 178 and 337, and sli-breakdown.ts:25, with usageDay. Never call .mapWith or .as on the shared constant.
3. queries.ts: replace the outcome rebuilds at 182, 284, 318, 347 and 562 with metadataOutcome. The existing isNotNull + filter(r.outcome !== null) logic stays.
4. queries.ts: replace the inlined sums at 174-177 and 338-339 with summedInt('esiCount' | 'fuzzworkFallbackCount' | 'fetched' | 'written'), and delete the local summedInt definition.
5. getFallbackRate and getRefreshVolume: use refreshedPriceCron(range) as the WHERE. In getFallbackRate, drop the totals query and compute esi/fallback by reducing perDay.
6. getTopReferrers (124): pass externalReferrer as extraWhere. getTrafficTotals (387) and getSearchVsDirect (393, 396): count(*) filter (where ${externalReferrer}) and filter (where ${directVisit}).
7. Optional: hoist the is_entry (129, 386), budgetExhausted (214, 224) and caller (235, 266) accessors into module-level constants in queries.ts, since they have no consumer outside it.

**Tests.** Keep queries.test.ts:18-30 green. Using a literal key in externalReferrer keeps the 'referrer' param count at 2; a parameter-bound key would make it 3 and fail. queries.db.test.ts:269 (getFallbackRate totals esi 100 / fallback 5) guards the reduce, and queries.db.test.ts:71-77 guards the perDay shape. Add a sql.ts unit test asserting that usageDay and metadataOutcome render the key as a literal with no params, which protects GROUP BY use. Existing guards: sli-breakdown.db.test.ts, sli-queries.db.test.ts, cost-queries.test.ts, queries.shaping.test.ts.

**Notes.** All copies are currently identical, so there is no drift bug. The getTopReferrers copy omits 'is not null' only because topByMetadataKeyQuery already adds isNotNull(col). Two things to preserve: (1) GROUP BY validity in getCronOutcomes, getDegradationByCaller, getWriteBehindOutcomes, listCapabilityFailures and listDailyCapabilityFailures depends on the grouped accessor rendering identical SQL in SELECT and GROUP BY, which requires literal keys; (2) Drizzle SQL.mapWith mutates its instance, so mapped aggregates (summedInt, the filters counted with mapWith(Number)) must be built per call, not shared constants. The getFallbackRate reduce is exact, because usage_logs.timestamp is NOT NULL, so every matching row falls in exactly one day bucket. The efficiency gain is small (one fewer scan over refreshed cron_prices rows per admin render). getTrafficTotals.referrals and getSearchVsDirect.referred compute the same count. TrafficCards calls both (82 and 115), but in separate sections, so merging those queries is not proposed.

<sub>Reported by: area:data-services.</sub>

<a id="p236"></a>

## P236: Derive ESI refresh status sets from one constant module and claim due jobs in one UPDATE

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -15 / +10 in production code; about +40 test lines
- **Depends on:** —
- **Existing primitive:** `src/data/esi-refresh-jobs/constants.ts:LIVE_ESI_REFRESH_JOB_STATUSES; src/lib/batched-delete.ts:retentionCutoff`

**Problem.** The status set that defines a 'live' ESI refresh job has three spellings: the constant used by enqueue, residual and stats; a hand-written literal in the partial unique index predicate; and a literal inside requeueDeadLetteredJob's raw SQL. The claimable set (live minus running) has no constant and is typed twice in claimDueEsiRefreshJobs. If they drift, the idempotency index stops matching the code's idea of a live job. claimDueEsiRefreshJobs selects due rows and then claims them one HTTP UPDATE at a time (up to 6 Neon HTTP requests per drain). getEsiRefreshQueueStats computes its cutoff by hand even though retentionCutoff is already imported in the same file.

**Verifier revision.** The problem is real. The live status list is retyped in schema.ts:60 and queries.ts:260, the claimable list is written twice in claimDueEsiRefreshJobs, and the claim loop does one UPDATE per job. The advisory lock does serialize the drain. Three parts of the proposed design would break things. (1) Defining LIVE as [...CLAIMABLE, 'running'] reorders the list. The predicate drizzle-kit stores is order-sensitive (drizzle/meta/0079_snapshot.json:4707 holds 'queued','running','deferred_for_budget','failed_retryable'), so the reorder would produce a DROP/CREATE INDEX migration. (2) drizzle-kit 0.31.10 serializes an index .where() with dialect.sqlToQuery(where) and no param inlining (node_modules/drizzle-kit/bin.cjs:17203). A plain inArray() would write `in ($1, $2, $3, $4)` into the migration, so the predicate needs .inlineParams() (drizzle-orm sql.js:225). (3) The requeue predicate tests the alias `live`. inArray(esiRefreshJobs.status, ...) renders "esi_refresh_jobs"."status", which inside the aliased subquery resolves to the outer UPDATE row (always 'dead_lettered'). NOT EXISTS would then always pass, and the bug would be hidden because the unique-index catch still returns 'superseded'. The efficiency gain only shows up with a backlog (at most 5 UPDATEs per run, and 1 request when nothing is due), so the payoff is low. It is still worth doing for the single source of truth.

**Sites (9).**

- [`src/data/esi-refresh-jobs/constants.ts:11-28`](../../src/data/esi-refresh-jobs/constants.ts#L11-L28) — ESI_REFRESH_JOB_STATUSES and LIVE_ESI_REFRESH_JOB_STATUSES; no claimable constant
- [`src/data/esi-refresh-jobs/schema.ts:56-61`](../../src/data/esi-refresh-jobs/schema.ts#L56-L61) — partial unique index predicate as an inline literal list; the order must stay queued, running, deferred_for_budget, failed_retryable
- [`src/data/esi-refresh-jobs/queries.ts:148-187`](../../src/data/esi-refresh-jobs/queries.ts#L148-L187) — claimable list typed at 157-161 and 176-180; per-job UPDATE loop at 169-185
- [`src/data/esi-refresh-jobs/queries.ts:189-211`](../../src/data/esi-refresh-jobs/queries.ts#L189-L211) — line 202 computes the cutoff with 86_400_000 by hand; retentionCutoff is imported at line 4
- [`src/data/esi-refresh-jobs/queries.ts:233-280`](../../src/data/esi-refresh-jobs/queries.ts#L233-L280) — line 260 retypes the live list against the alias live.status
- [`src/data/esi-refresh-jobs/queries.ts:72, 96`](../../src/data/esi-refresh-jobs/queries.ts#L72) — enqueue coalescing and the residual already use the LIVE constant (reference form)
- [`src/data/esi-refresh-jobs/queries.ts:365-387`](../../src/data/esi-refresh-jobs/queries.ts#L365-L387) — prune writes the terminal set ['succeeded','failed_permanent'] inline; it already uses retentionCutoff
- [`src/composition/sync/esi-refresh-worker.ts:251-269`](../../src/composition/sync/esi-refresh-worker.ts#L251-L269) — the only production caller; it claims ESI_REFRESH_JOB_BATCH_SIZE (5) and processes jobs in the returned order
- [`src/app/api/cron/drain-esi-refresh-jobs/declaration.ts:29-32`](../../src/app/api/cron/drain-esi-refresh-jobs/declaration.ts#L29-L32) — the drain runs under the session advisory lock, so SKIP LOCKED is unnecessary

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/queue/queue-view.ts:11-16`](../../src/app/%28site%29/admin/queue/queue-view.ts#L11-L16) — Admin display buckets (waiting, deferred, retrying, dead), not the live/claimable invariant. Leave them alone.
- [`src/platform/owner-sync/engine.ts:120-149`](../../src/platform/owner-sync/engine.ts#L120-L149) — Owner-sync result kinds that happen to share status names; a different type.

</details>

**Home.** `src/data/esi-refresh-jobs/constants.ts (existing LIVE constant plus a new CLAIMABLE constant); query changes stay in src/data/esi-refresh-jobs/queries.ts and schema.ts`

**Boundary check.** Every edit stays inside the data zone module src/data/esi-refresh-jobs. schema.ts and queries.ts already import ./constants. queries.ts already imports retentionCutoff from src/lib/batched-delete (rule from:data allows lib). No new cross-zone imports.

**API sketch.**

```ts
// constants.ts — LIVE keeps its current literal order (it feeds the index predicate)
export const LIVE_ESI_REFRESH_JOB_STATUSES = ['queued','running','deferred_for_budget','failed_retryable'] as const;
export const CLAIMABLE_ESI_REFRESH_JOB_STATUSES = ['queued','deferred_for_budget','failed_retryable'] as const satisfies readonly (typeof LIVE_ESI_REFRESH_JOB_STATUSES)[number][];
// schema.ts
uniqueIndex('esi_refresh_jobs_live_key_unique').on(t.idempotencyKey)
  .where(inArray(t.status, LIVE_ESI_REFRESH_JOB_STATUSES).inlineParams())
// queries.ts requeue
and ${inArray(sql`live.status`, LIVE_ESI_REFRESH_JOB_STATUSES)}
// queries.ts claim
const due = db.select({ id: esiRefreshJobs.id }).from(esiRefreshJobs)
  .where(and(inArray(esiRefreshJobs.status, CLAIMABLE_ESI_REFRESH_JOB_STATUSES), lte(esiRefreshJobs.nextAttemptAt, now)))
  .orderBy(asc(esiRefreshJobs.nextAttemptAt), asc(esiRefreshJobs.createdAt)).limit(limit);
const claimed = await db.update(esiRefreshJobs).set({ status: 'running', updatedAt: now })
  .where(and(inArray(esiRefreshJobs.id, due), inArray(esiRefreshJobs.status, CLAIMABLE_ESI_REFRESH_JOB_STATUSES)))
  .returning();
return claimed.sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
```

**Migration steps.**

1. Add CLAIMABLE_ESI_REFRESH_JOB_STATUSES to constants.ts as its own literal, checked against LIVE with `satisfies`. Do not change LIVE or its order.
2. schema.ts: replace the sql literal at 59-61 with inArray(t.status, LIVE_ESI_REFRESH_JOB_STATUSES).inlineParams(). Run drizzle-kit generate locally and confirm it reports no changes. The rendered predicate must equal the snapshot string exactly, quotes and order included. If there is any diff, stop and revert to the literal.
3. queries.ts requeueDeadLetteredJob line 260: replace the literal with ${inArray(sql`live.status`, LIVE_ESI_REFRESH_JOB_STATUSES)}. Never use esiRefreshJobs.status inside the `live` subquery.
4. queries.ts claimDueEsiRefreshJobs: replace select-plus-loop with one UPDATE ... WHERE id IN (due subquery) AND status IN claimable RETURNING. The outer status recheck keeps the old per-row guard under READ COMMITTED. Sort the returned rows in JS by (nextAttemptAt, createdAt) to keep the processing order.
5. queries.ts line 202: use retentionCutoff(ESI_REFRESH_JOB_RETENTION_DAYS, now).
6. Optional: add TERMINAL_ESI_REFRESH_JOB_STATUSES = ['succeeded','failed_permanent'] for prune line 377 if a second consumer appears; otherwise leave it.

**Tests.** Add to src/data/esi-refresh-jobs/esi-refresh-jobs.db.test.ts (real Postgres harness): claimDueEsiRefreshJobs claims at most `limit` due rows in (nextAttemptAt, createdAt) order; it skips running, future, dead_lettered and succeeded rows; every returned row has status 'running'; a second call returns []. Add a unit test that renders the live-key index predicate with new PgDialect().sqlToQuery(getTableConfig(esiRefreshJobs).indexes[0].config.where) and asserts it equals the snapshot text `"esi_refresh_jobs"."status" in ('queued', 'running', 'deferred_for_budget', 'failed_retryable')`. Existing guards: esi-refresh-jobs.db.test.ts:98 (superseded when a live job exists) and :199 (requeue reset), queue-ops.test.ts:76-110, and composition/sync/esi-refresh-worker.test.ts, which mocks claim.

**Notes.** Correct behavior is the current partial-index predicate order. Any refactor must reproduce the exact string, or drizzle-kit emits an index rebuild migration. The requeue NOT EXISTS must test the `live` alias: a wrong column binding would be masked by the isUniqueViolation catch at line 277, which still answers 'superseded'. The single-statement claim needs no SKIP LOCKED, because ADVISORY_LOCK_ESI_REFRESH_QUEUE serializes drains and nothing else moves rows into 'running'. RETURNING order is not guaranteed, hence the JS sort.

<sub>Reported by: area:data-services, concern:efficiency.</sub>

<a id="p232"></a>

## P232: Give map lifecycle predicates and the active-admin selection one home, and write archive/restore SETs from the lifecycle contract

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** -45 / +30
- **Depends on:** [P223](#p223)
- **Existing primitive:** `src/data/maps/lifecycle-contract.ts:activeMapLifecycle,archivedMapLifecycle`

**Problem.** The active-map predicate (archived_at IS NULL AND tombstoned_at IS NULL) is written 5 times. The restorable predicate (archived, not purge-requested, not purge-claimed, not tombstoned, archived_at after the grace cutoff) is written 3 times, and requestAuthorizedMapPurge uses `gte` where list and restore use `gt`. The same `authorizedAdminMapsSelection(..., active)` wrapper exists privately in blocks.ts and queries.ts and inline in lifecycle.ts. archiveAuthorizedMap and restoreAuthorizedMap hand-write the SET columns that archivedMapLifecycle/activeMapLifecycle define, so archivedMapLifecycle has no production caller (only tests use it). Adding a lifecycle column would silently skip these two writes.

**Verifier revision.** The core is real. The active-admin selection is defined privately in blocks.ts and queries.ts and written inline in lifecycle.ts. The restorable predicate appears three times, and requestAuthorizedMapPurge uses gte where the others use gt. Archive and restore re-spell the archivedMapLifecycle/activeMapLifecycle columns in raw SQL. Four parts of the design change. (1) The predicates cannot live in lifecycle-contract.ts: schema.ts:18 imports MAP_LIFECYCLE_STATUSES from it, and lifecycle-contract would have to import `maps` from schema, which is a cycle that Fallow fails. They need a new lifecycle-sql.ts. (2) A lifecycleAssignments() helper that renders a SET list is not needed. Drizzle 0.45 PgUpdateBase implements SQLWrapper, so the archive/restore CTE can embed `database.update(maps).set({...archivedMapLifecycle(now), updatedAt: now})...getSQL()`, and the contract objects stay the only SET source. (3) The drift has almost no practical effect. Only a map archived exactly MAP_DELETE_GRACE_MS ago is affected, and the sweeper (purgeEligibility lte) already treats that map as expired, so accepting purge-now changes nothing observable. It is still worth fixing as part of the consolidation. (4) The character-scoping.ts:103-104 copy uses the `managed` alias in raw SQL and cannot take a column-bound fragment, so it is excluded.

**Sites (12).**

- [`src/data/maps/lifecycle.ts:47-69`](../../src/data/maps/lifecycle.ts#L47-L69) — archiveAuthorizedMap: inline active-admin selection (50-55) and hand-written SET (57-64) equal to archivedMapLifecycle(now) + updated_at
- [`src/data/maps/lifecycle.ts:80-108`](../../src/data/maps/lifecycle.ts#L80-L108) — restoreAuthorizedMap: restorable predicate with `>` (89-93) and hand-written SET (96-103) equal to activeMapLifecycle(now) + updated_at
- [`src/data/maps/lifecycle.ts:118-133`](../../src/data/maps/lifecycle.ts#L118-L133) — requestAuthorizedMapPurge: same restorable column set but gte(maps.archivedAt, cutoff) at 127 (the drift); also restricted to creator via eq(maps.userId)
- [`src/data/maps/lifecycle.ts:137-151`](../../src/data/maps/lifecycle.ts#L137-L151) — purgeEligibility uses lte(archivedAt, graceCutoff), the exact complement of `gt`; this confirms gt is the correct restorable bound
- [`src/data/maps/lifecycle-contract.ts:1-55`](../../src/data/maps/lifecycle-contract.ts#L1-L55) — contract objects; imported by schema.ts:18, so it cannot import schema
- [`src/data/maps/queries.ts:364-378`](../../src/data/maps/queries.ts#L364-L378) — listAuthorizedMapsForPrincipals: and(isNull(archivedAt), isNull(tombstonedAt))
- [`src/data/maps/queries.ts:380-403`](../../src/data/maps/queries.ts#L380-L403) — listDeletedRestorableMapsForPrincipals: restorable predicate with gt at 394
- [`src/data/maps/queries.ts:483-502`](../../src/data/maps/queries.ts#L483-L502) — private activeMapsAdminSelection/activeMapAdminSelection; used at 469, 556, 603
- [`src/data/maps/blocks.ts:26-33`](../../src/data/maps/blocks.ts#L26-L33) — private activeAdminMaps, identical to queries.ts copy; used at 67, 114, 137
- [`src/data/maps/character-scoping.ts:28-36`](../../src/data/maps/character-scoping.ts#L28-L36) — listUnscopedMapIds: active predicate plus characterScopedAt IS NULL
- [`src/data/maps/authorization-sql.ts:47-93`](../../src/data/maps/authorization-sql.ts#L47-L93) — authorizedAdminMapsSelection(lifecycleCondition: SQL), the natural home for activeAdminMapsSelection
- [`src/data/maps/lifecycle.db.test.ts:131-161`](../../src/data/maps/lifecycle.db.test.ts#L131-L161) — pins restore refused at exact grace boundary (gt)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/character-scoping.ts:103-104`](../../src/data/maps/character-scoping.ts#L103-L104) — Same active concept, but written against the raw alias `managed.` inside a hand-written CTE. A column-bound fragment would render "maps"."archived_at" and not bind to the alias. Leave it as is.
- [`src/data/maps/queries.ts:411-425`](../../src/data/maps/queries.ts#L411-L425) — getMapAccessSubject filters only tombstoned_at IS NULL (archived maps are intentionally visible). This is a different predicate.
- [`src/data/maps/character-scoping.ts:128-143`](../../src/data/maps/character-scoping.ts#L128-L143) — stampCharacterScoped: tombstoned-only guard, a different concept
- [`src/data/maps/queries.ts:320-341`](../../src/data/maps/queries.ts#L320-L341) — publishCreatedMap: staged-creation predicate (purge_requested set, not claimed). Different state; it already uses activeMapLifecycle for SET.
- [`src/composition/map-access-projection.ts:150`](../../src/composition/map-access-projection.ts#L150) — JS check on a loaded row, not SQL

</details>

**Home.** `New src/data/maps/lifecycle-sql.ts (activeMapCondition, restorableMapCondition); activeAdminMapsSelection added to existing src/data/maps/authorization-sql.ts`

**Boundary check.** All producers and consumers are in src/data/maps (one auto-discovered data zone). Imports inside a zone need no boundaries.rules entry. lifecycle-sql.ts imports only ./schema, ./lifecycle-contract and drizzle-orm. authorization-sql.ts adds an import of ./lifecycle-sql. lifecycle.ts, queries.ts, blocks.ts and character-scoping.ts import from both. No cycle: lifecycle-sql does not import authorization-sql, lifecycle or queries, and lifecycle-contract stays import-free, so schema.ts -> lifecycle-contract does not close a cycle. Putting the predicates in lifecycle-contract.ts would create schema <-> lifecycle-contract (circular-dependencies: error).

**API sketch.**

```ts
// src/data/maps/lifecycle-sql.ts
export function activeMapCondition(): SQL; // sql`(${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL)`
export function restorableMapCondition(now: Date): SQL; // archivedAt NOT NULL AND gt(maps.archivedAt, new Date(now - MAP_DELETE_GRACE_MS)) AND purgeRequestedAt/purgeClaimedAt/tombstonedAt IS NULL, parenthesised
// src/data/maps/authorization-sql.ts
export function activeAdminMapsSelection(userId: string, principals: MapPrincipals, mapIds: readonly string[]): SQL; // authorizedAdminMapsSelection(userId, principals, mapIds, activeMapCondition())
// lifecycle.ts CTE body (no new helper):
// updated AS (${database.update(maps).set({ ...archivedMapLifecycle(now), updatedAt: now }).where(sql`${maps.id} IN (SELECT id FROM authorized_map)`).returning({ id: maps.id }).getSQL()})
```

**Migration steps.**

1. Create src/data/maps/lifecycle-sql.ts with activeMapCondition() and restorableMapCondition(now). Build the bound with gt(maps.archivedAt, cutoff) so the Date is encoded through the column (both drivers), and return a parenthesised SQL (not `and(...)`, which is SQL | undefined), because authorizedAdminMapsSelection requires SQL.
2. In authorization-sql.ts add activeAdminMapsSelection(userId, principals, mapIds) that wraps authorizedAdminMapsSelection with activeMapCondition().
3. blocks.ts: delete activeAdminMaps (26-33) and call activeAdminMapsSelection at 67, 114, 137.
4. queries.ts: delete activeMapsAdminSelection/activeMapAdminSelection (483-502). Call activeAdminMapsSelection(userId, principals, uniqueMapIds) at 469 and activeAdminMapsSelection(userId, principals, [mapId]) at 556 and 603.
5. queries.ts:372 -> activeMapCondition(); queries.ts:389-395 -> restorableMapCondition(now); drop the now-unused gt/MAP_DELETE_GRACE_MS imports if Fallow/lint flag them.
6. character-scoping.ts:32 -> and(isNull(maps.characterScopedAt), activeMapCondition()). Leave 103-104 untouched.
7. lifecycle.ts archive: use activeAdminMapsSelection(userId, principals, [mapId]). Replace the hand-written UPDATE (56-67) with the drizzle update builder rendered via `.getSQL()` and `.set({ ...archivedMapLifecycle(now), updatedAt: now })`. Call .getSQL() explicitly: interpolating the builder object makes drizzle wrap it in parentheses, and `AS ((UPDATE ...))` is invalid.
8. lifecycle.ts restore: authorizedAdminMapsSelection(userId, principals, [mapId], restorableMapCondition(now)) and the same builder pattern with activeMapLifecycle(now).
9. lifecycle.ts requestAuthorizedMapPurge: where(and(eq(maps.id, mapId), eq(maps.userId, userId), restorableMapCondition(now))). This changes gte to gt. Remove the now-unused gte/isNotNull imports.
10. Optional: express purgeEligibility's grace arm next to restorableMapCondition so the complementary bounds sit side by side (it has a single caller, so do not extract it otherwise).

**Tests.** Add to src/data/maps/lifecycle.db.test.ts: (a) requestAuthorizedMapPurge(CREATOR, MAP_ID, new Date(NOW + MAP_DELETE_GRACE_MS)) resolves false, pinning the unified bound; (b) after archiveAuthorizedMap the stored row toMatchObject(archivedMapLifecycle(NOW)), which guards the new SET path. These existing tests must stay green: lifecycle.db.test.ts 94-129 (restore toMatchObject activeMapLifecycle), 131-161 (exact-boundary restore refused), 163-187 (creator-only purge), 270-319 (archive/restore roll back when the queue write fails; critical because the CTE body changes), 321-345; queries.db.test.ts listDeletedRestorableMapsForPrincipals (~389); blocks.db.test.ts; character-scoping.db.test.ts.

**Notes.** Correct bound: gt (strictly inside grace). It is the complement of purgeEligibility's lte(archivedAt, graceCutoff) and is pinned by lifecycle.db.test.ts:131-161. requestAuthorizedMapPurge's gte is the drifted copy, but its only effect is on a map archived exactly at the cutoff millisecond, which the sweeper already treats as expired, so the user sees no difference. Preserve these per-site differences: requestAuthorizedMapPurge is creator-only (eq(maps.userId)) while restore is admin-authorized; keep that outside the shared predicate. The archive SET must keep clearing purge_requested_at/purge_claimed_at/tombstoned_at, which archivedMapLifecycle already does. Use the timestamp-column predicates and do not switch to lifecycle_status = 'active'. The column is a denormalised mirror (createMapAtomic inserts 'purge_queued' rows with archived_at set), so switching changes semantics if the two ever diverge.

<sub>Reported by: area:data-eve.</sub>

<a id="p225"></a>

## P225: Derive the authorization-failure cutoff and the delayed check from authorization-policy instead of recomputing them at each site

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -8 / +14
- **Depends on:** [P223](#p223)
- **Existing primitive:** `src/platform/auth/authorization-policy.ts:AUTHORIZATION_MAX_FAILURE_AGE_MS`

**Problem.** 'An EVE account whose authorization has been failing for AUTHORIZATION_MAX_FAILURE_AGE_MS' is expressed in five places. authorization-store has an inclusive SQL overdue predicate, written twice. affiliation-store has a SQL complement for sharedAccessEligible. linked-characters has a JS authorizationDelayed. map-character-scoping computes a raw cutoff for data/maps' own sharedAccessEligible. Each site computes `new Date(Date.now() - MAX)` itself. The comparisons currently agree, but nothing ties them together.

**Verifier revision.** The drift claim is wrong. lte(first_at, now - MAX) is equivalent to now - first_at >= MAX, which is exactly the JS check in linked-characters, and gt(first_at, cutoff) with IS NULL is its precise complement, used for 'still eligible'. All five copies agree today. The duplication itself is real: three app-side cutoff computations, the 'overdue and not suspended' predicate written twice in authorization-store, a JS delayed check, and a second sharedAccessEligible SQL in data/maps/character-scoping. Unifying them keeps the UI's 'authorization delayed' badge and the access-eligibility cutoff tied to one definition. Scope narrowed: data/maps/character-scoping must keep receiving the cutoff as a parameter, because the data zone may not import platform/auth.

**Sites (7).**

- [`src/platform/auth/authorization-policy.ts:1`](../../src/platform/auth/authorization-policy.ts#L1) — only the constant is shared
- [`src/platform/auth/authorization-store.ts:11-20`](../../src/platform/auth/authorization-store.ts#L11-L20) — hasAuthorizationWork: and(eq(suspended,false), lte(firstAt, now - MAX)) at 16-17
- [`src/platform/auth/authorization-store.ts:37-41`](../../src/platform/auth/authorization-store.ts#L37-L41) — suspendOverdueAuthorizations: same overdue+unsuspended predicate
- [`src/platform/auth/affiliation-store.ts:64-70`](../../src/platform/auth/affiliation-store.ts#L64-L70) — sharedAccessEligible: refreshToken not null and (firstAt IS NULL or firstAt > cutoff)
- [`src/platform/auth/linked-characters.ts:91-92`](../../src/platform/auth/linked-characters.ts#L91-L92) — authorizationDelayed: firstAt != null && now - firstAt >= MAX
- [`src/composition/map-character-scoping.ts:109-114`](../../src/composition/map-character-scoping.ts#L109-L114) — raw cutoff new Date(Date.now() - MAX) passed to insertGrandfatherGrants
- [`src/data/maps/character-scoping.ts:38-44`](../../src/data/maps/character-scoping.ts#L38-L44) — second sharedAccessEligible in raw SQL over an alias; takes the cutoff as a parameter because data cannot import platform/auth

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/eve-token-service.ts:216-217`](../../src/platform/auth/eve-token-service.ts#L216-L217) — retry backoff gated on authorizationNextCheckAt; a different concept
- [`src/platform/auth/authorization-store.ts:22-27`](../../src/platform/auth/authorization-store.ts#L22-L27) — listDueAuthorizations uses authorizationNextCheckAt, not the failure age

</details>

**Home.** `src/platform/auth/authorization-policy.ts (pure helpers); src/platform/auth/authorization-store.ts (drizzle predicates, exported for affiliation-store)`

**Boundary check.** Both homes are in platform/auth. authorization-policy stays pure, with no imports. authorization-store already imports @/db and @/db/auth-schema (platform/auth allows db). Consumers: affiliation-store and linked-characters (same zone); composition/map-character-scoping (composition allows platform/auth, and it already imports authorization-policy). data/maps/character-scoping cannot import platform/auth (the data allow-list has no platform/auth), so it keeps its cutoff parameter and receives the value from authorizationFailureCutoff() through composition.

**API sketch.**

```ts
// authorization-policy.ts
export function authorizationFailureCutoff(now: number = Date.now()): Date { return new Date(now - AUTHORIZATION_MAX_FAILURE_AGE_MS); }
export function isAuthorizationDelayed(firstAt: Date | null, now: number = Date.now()): boolean { return firstAt !== null && firstAt.getTime() <= authorizationFailureCutoff(now).getTime(); }

// authorization-store.ts
export function authorizationFailureOverdue(cutoff: Date): SQL | undefined { return lte(account.authorizationFailureFirstAt, cutoff); }
export function authorizationFailureCurrent(cutoff: Date): SQL | undefined { return or(isNull(account.authorizationFailureFirstAt), gt(account.authorizationFailureFirstAt, cutoff)); }
```

**Migration steps.**

1. First write src/platform/auth/authorization-policy.test.ts to pin the boundary as it stands today: firstAt exactly MAX ago is delayed; 1 ms later is not; null is not.
2. Add authorizationFailureCutoff and isAuthorizationDelayed to authorization-policy.ts.
3. Add authorizationFailureOverdue and authorizationFailureCurrent to authorization-store.ts. Use and(eq(suspended,false), authorizationFailureOverdue(authorizationFailureCutoff(now))) in both hasAuthorizationWork and suspendOverdueAuthorizations.
4. In affiliation-store:66-69, use authorizationFailureCurrent(authorizationFailureCutoff()). In linked-characters:91-92, use isAuthorizationDelayed(r.authorizationFailureFirstAt).
5. In map-character-scoping:113, use authorizationFailureCutoff(). Leave data/maps/character-scoping.ts:38-44 parameterized, and add a comment that it mirrors authorizationFailureCurrent.

**Tests.** New authorization-policy.test.ts covering the boundary cases above. Existing guards: authorization-store.db.test.ts (suspendOverdueAuthorizations at line 46), affiliation-store.db.test.ts (sharedAccessEligible false cases at lines 80 and 88), linked-characters.db.test.ts, data/maps/character-scoping.db.test.ts (CUTOFF at line 30), and map-character-scoping.test.ts.

**Notes.** Keep the inclusive boundary: overdue is firstAt <= cutoff, and current is firstAt IS NULL or firstAt > cutoff. lte on NULL yields NULL, so the 'current' predicate must keep its explicit IS NULL branch. Every site uses the app clock (Date.now()), not SQL now(), and the data/maps copy gets a JS Date, so keep the cutoff app-side. Unifying the two sharedAccessEligible bodies (affiliation-store's typed columns and data/maps' raw alias SQL) would need a shared SQL helper in the db or lib zone, which both may import. That is not worth it for one predicate; a cross-reference comment is enough.

<sub>Reported by: area:platform.</sub>

← [Wave 4: Formatting, dates and names have one home](wave-04-formatting-dates-and-names-have-one-home.md) · [Index](README.md#roadmap) · [Wave 6: Config, env, ids and shared domain vocabularies](wave-06-config-env-ids-and-shared-domain-vocabularies.md) →
