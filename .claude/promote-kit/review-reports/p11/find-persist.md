# Wave 11 review: owned-data persistence, cache expiry, purge cache tags, rigs (P336, P239, P184, P241, P273)

Read-only review of `origin/claude/primitives-wave-10...origin/claude/primitives-wave-11`. Next 16.3.4 behaviour was checked in `node_modules/next/dist` (revalidate.js, revalidation-utils.js, after-context.js, app-route/module.js, build/templates/app-route.js, cache-handlers/default.js, cache-life-profile.js) and in `next/dist/docs/.../revalidateTag.md`.

## Findings

### 1. P241: a purge request that throws after the character rows are deleted loses its cache-tag expirations, and the retry never expires them again

- **Where:** `src/composition/purge/orchestrator.ts:12-24` (the `purgeCharacterFrom` comment and `expireNow`). The retry gap is in `src/composition/account-lifecycle/account-purge.ts:27-53`: `finishUserDeletion` with no links left only calls `runPurge({kind:'user'})`, and `finishCharacterDeletion` with the link already gone skips `purgeLink`.
- **Severity:** low.
- **Mechanism (Next 16.3.4):**
  - `revalidateTag` only pushes the tag onto `workStore.pendingRevalidatedTags`.
  - In a route handler, those tags are applied by `resolvePendingRevalidations()` in `app-route/module.js`. That function runs only when the handler returns a `Response`, or on a redirect error. For any other thrown error the module runs `throw err` and the pending tags are dropped. `build/templates/app-route.js` has no other flush on that path.
  - `runMutationRoute` → `runCapabilityRoute` rethrows errors. So both `POST /api/account/delete` and `POST /api/account/purge-character` throw out of the handler on any failure.
- **Concrete scenario:**
  1. A user deletes their account while Convex is unavailable, or while Convex is unconfigured. The maps contributor says it "throws and the deletion stays requested for the daily retry".
  2. `nukeAccount` → `finishUserDeletion` → `purgeLink(A)`. `runPurge(character A)` deletes the skills, sheet, jobs, assets and blueprint rows on the autocommit `db`. `expireNow('skills:A' …)` queues 5 tags. Then `db.delete(account)` commits.
  3. The loop moves on to `runPurge({kind:'user'})`. The maps `purgeUser` → `purgeOwnedMapChains` → `purgeMapChain` throws. The deletion transaction rolls back, the route returns 500, and the 5 pending expirations are discarded.
  4. Recovery comes either from the daily `retryRequestedDeletions` or from the user signing in again (`proveCharacter` → `finishPendingDeletion`). Both re-enter `finishUserDeletion` with `linked = []`, so they run only the user-subject purge. `cacheTags` is never consulted for a user subject.
  5. When character A is linked to the new account, `getOwnerAssetRows` and `getOwnedBlueprintMap` (`cacheLife('hours')`), and the skills, sheet and jobs readers (`'minutes'`), return the deleted rows from the cache until each entry's window passes. This is the exact symptom P241 says it fixes ("a re-linked character or a re-signed-up account was served the deleted … as ready").
  - The same thing happens for `purge-character` when `reconcileAfterCharacterRemoval` (Convex runners) throws after `purgeLink`. The retry finds `link === undefined` and only reconciles.
- **Evidence:**
  - New code: `await contributor.purgeCharacter?.(subject); for (const tag of contributor.cacheTags?.(subject) ?? []) expireNow(tag);`. Its comment claims "so a later contributor's failure still leaves these rows unserved". That holds only when the request still ends in a `Response`.
  - The tests mock `next/cache` (`orchestrator.test.ts`, `account-purge.db.test.ts`). They see `revalidateTag` being called but cannot see Next dropping the queue on a throw.
  - Old code had no expiry at all, so this path keeps the pre-P241 behaviour. The declared fix is incomplete rather than a regression.
- **Minimal fix (either one):**
  - (a) In the two purge routes, catch the error from `nukeAccount` / `purgeOwnCharacter` and return the endpoint's 500 problem `Response` instead of rethrowing. `resolvePendingRevalidations` then runs and the already-committed expirations apply. The cron and OAuth paths already end in a `Response`.
  - (b) Expire again on resume. Export a helper from the orchestrator that runs every cache-tier contributor's `cacheTags` for a character. Call it in `finishCharacterDeletion` when `link === undefined`. For the user scope, call it per character before the account rows are deleted, so a resumed `finishUserDeletion` can still name them. (a) is smaller.

## Leads checked and refuted

1. **Is `revalidateTag(tag, { expire: 0 })` valid in 16.3.4?** Yes.
   - The docs list `{ expire: 0 }` explicitly: "Stale content is never served, so the next request is a blocking revalidate/cache miss".
   - `validateAndNormalizeCacheLifeProfile` accepts it.
   - `revalidateTags` passes `{expire: 0}` to `updateTags`. The default handler sets `stale = expired = now`, and `areTagsExpired` then treats every earlier entry as expired. Entries filled between the write and the flush are expired too, because `expired` is stamped at flush time.
2. **Calling contexts for the 12 writer sites (P184).** Every site changed one-for-one from `revalidateTag(tag, 'max')` to `expireNow`.
   - `revalidate()` makes the same checks for every profile: no work store → throw; render phase → throw; inside `use cache` or `unstable_cache` → throw.
   - So no writer path changes behaviour by context. Writers run in route handlers, `after()` callbacks (the work store is kept, the phase switches to `'after'`, and `withExecuteRevalidates` flushes new tags), and cron routes, including the deferred-queue drain in `drain-esi-refresh-jobs` and `daily-batch`.
   - No script under `src/scripts` or `scripts/` imports a writer, the purge code or `cache-expiry`. The repo has no `'use server'` modules.
   - The only other difference is that `pathWasRevalidated` is set, which only matters in a Server Action.
3. **Calling contexts for runPurge (P241).** All production callers run inside a request work store:
   - `/api/account/delete` and `/api/account/purge-character`
   - `retryRequestedDeletions` in the housekeeping cron; per-job errors are caught, so the cron still returns a `Response` and flushes
   - the OAuth callback (`getUserInfo` → `proveCharacter` → `finishPendingDeletion` / `transferCharacter`)
   - `synthetic-pilot-store` does not call `runPurge`. The transfer path purges only the `credential` tier, and no contributor there has tags.
   - The only lost-flush case is the thrown-request case in finding 1.
4. **Network calls inside the new transactions (P239).** `replaceOwnerSnapshot`'s `lock` and `replace` steps issue only DB statements. Everything else happens before the transaction opens:
   - the ESI pages are fully parsed and aggregated
   - `getSystemFacts` runs before structures
   - `insertEsiSnapshot` and `buildHoldingIndex` run before corp assets
   - `timedPostgres` only adds local timing
   - No writer runs inside `withAdvisoryLock`'s reserved work except through the sequential queue drain, and none nests a direct transaction. With the direct pool at `max: 3`, one reserved by the advisory lock, there is no circular wait.
5. **Lock order and deadlocks.** Each writer upserts its own owner's sync or profile row first, then touches only that owner's rows:
   - structures: `corp_structure_syncs` → `corp_structures`
   - blueprints: `owned_blueprint_syncs` → `owned_blueprints`
   - character and corp assets: `owned_asset_syncs` → (`corp_holding_nodes`) → `owned_assets`
   - profile: `corp_profiles` → `corp_member_bases`

   No two writers share tables in opposite order. Purge contributors delete on the autocommit `db`, one statement per table, so they never hold one lock while waiting on another. The merge rule `follows-character` is a no-op. The cross-corp member-base re-homing order in `saveCorpProfile` was already the same transaction before this wave.
6. **Outcome for a writer that loses the race.**
   - The first publication also serializes: a second `INSERT … ON CONFLICT DO UPDATE` waits on the first one's speculative insert, then updates. A loser therefore waits and saves, as the declared change says.
   - `'superseded'` can now only come from duplicates inside one snapshot:
     - `owned_assets` rows are aggregated on the natural key
     - `owned_blueprints` has no unique index
     - the profile and bases are upserts, so they cannot raise 23505
     - `corp_holding_nodes` come from an index map
   - Only `corp_structures`' primary key could fire. That needs a duplicate `structure_id` inside one ESI snapshot. It would now be a silent no-op (rolled back) where it used to throw after emptying the corp. No real input produces that.
7. **ETags roll back with failed rows.** All five writers upsert the sync or profile row inside the same transaction as the replace. The corp-asset snapshot is still discarded on `'superseded'` or on a throw.
8. **insertInBatches.**
   - `chunk` slices in steps of `[i, i+1000)`, so 2001 rows go as 1000/1000/1 in order and none are dropped.
   - An empty set issues no insert after the delete, so it still clears the owner.
   - The widest statement binds 10 parameters × 1000 rows, well under 65,534.
   - The 9,000-row DB test covers it.
9. **cacheTags match the readers' cacheTag calls.**
   - These match: `sheetTag`, `industryJobsTag`, `skillsTag` (both readers), `ownedAssetsTag(character)` and `ownedBlueprintsTag(character)`.
   - `corp_member_bases` is never read under `use cache` (`readCorpMemberContext` is uncached).
   - The `corp-industry-jobs:{userId}:{corp}` tag is not expired by `purgeUser`. The deleted userId can never read again, so nothing is served from it.
   - The other `use cache` sites are SDE, prices, statics or private-session caches.
10. **Rigs route (P273).** It returns the same JSON:
    - `rigTypeIds` is the stored jsonb, equal to the request body.
    - `taxPct` comes from `RETURNING` on the same column the old route re-read, so a rig-only save still echoes the kept tax.
    - The validation reasons are unchanged.
    - Dropping `revalidateTag(corp-structures)` from the rig save is safe: `getCorpStructureRigs` is uncached and no cached reader under that tag reads rigs.
11. **pg_index flake fix.** `map_access` has no primary key and one unique index (`map_access_map_grantee_unique`). `indrelid = 'test_maps_schema.map_access'::regclass AND indisunique` selects that same index, and `pg_get_indexdef` still ends in `(map_id, owner_type, owner_id)`.
12. **Corp asset snapshot path.** `ownedResourcePath` builds the same string as the old `basePathFor`, so the writer and `readCorpAssetSnapshots` still agree.
13. **Purge racing an in-flight asset sync.** A purge running beside an asset sync can leave the writer's new rows behind, because the statement snapshot does not see them. That race already existed with the old non-transactional writes, so it is not new.
14. **Pre-existing, outside the diff.** `finishDeletionJob` holds the deletion-client transaction across the SSO revoke and Convex calls. Not introduced here.
