# Wave 10 review: purge, map chains, map-access projections and housekeeping loops

Lens: P166, P240, P322, P164, P165. Diff reviewed with `git show` on commits de50ca87 (P164), 60d83f99 (P322), 1940d833 (P165), 3d724f5f (P166) and 1cfa24b2 (P240). Old and new code were compared on origin/claude/primitives-wave-09 and origin/claude/primitives-wave-10.

## Findings

None. I could not tie any change in these five items to a concrete failure. Every lead I checked is listed below with the reason it was dropped.

## Leads checked and refuted

### P240: generated purge contributors (src/platform/purge/contributors.ts)

- **Tables, WHERE clauses and order are unchanged for all 12 contributors.**
  - characterId-keyed: corp-roles, character-sheet, telemetry and corp-holdings each delete one table by `eq(<table>.characterId, id)`. skill-queue deletes characterSkills, then characterSkillSyncs.
  - Owner-keyed: owned-assets (assets, then syncs), owned-blueprints (blueprints, then syncs) and esi-snapshots use the injected `ownerKeyWhere(table, { ownerType: 'character', ownerId })`. This is the same predicate as before, and the deletes run in list order.
  - Durable: custom-structures, saved-plans, industry-profiles and preferences delete by `requireUserKeyColumn(table)`. That column is `user_id`, which is `userId` in `ownedRowIdentityColumns` and in `userPreferences.userId`, so it matches the old `eq(table.userId, userId)`.
- **Merge rules, tiers and claims are unchanged.** Merge rules are follows-character, rekey, or survivor-wins on `[userPreferences.key]`. Tiers are cache and durable. Claims are the same table lists. No contributor gained or lost `purgeUser` or `purgeCharacter`, and none had `retained`.
- **The registry is unchanged.** register-all.ts was not touched by P240: names and order are the same, and owned-assets still runs before esi-snapshots for the snapshot_id foreign key. The registry and coverage tests still see the same claims and rules.
- **Running at load time is safe.**
  - `requireUserKeyColumn`/`getTableConfig` don't call the lazy foreign-key `references(() => user.id)` callbacks; I checked drizzle-orm/pg-core/utils.js.
  - All four durable tables have `user_id`, so nothing throws at import.
  - Capturing the lazy `db` Proxy at load is safe. `database.delete(t)` still forwards to the real driver, the same way the old `db.delete` did.

### P166: purgeOwnedMapChains (src/composition/map-purge.ts:41)

- **Ownership query.** `getOwnedMapIds` is the same query as the reset's removed raw `select id from maps where user_id = ?`.
- **User deletion paths behave the same.** In teardownProjectionsForDeletedUser and the maps contributor's `purgeUser`, chains are purged one at a time in order. The first failure rejects and propagates; it is not caught by bestEffort. The user claim purge, `deleteOwnedMaps` and `forgetMapBlockAccounts` still run only after every chain is purged, so a mid-run failure leaves the deletion requested and retryable rather than marking the user purged. purge.db.test now also pins that maps still exist while chains purge.
- **The new reset order is harmless.**
  - The reset is gated to local Postgres and localhost.
  - Sessions are revoked before it starts.
  - Each map's fence (`teardownMapAccessProjection`) still reserves a fresh revision after all the purges, so it overrides any projection reserved earlier, even though /purge-map-chain drops the watermark.
  - A failure still throws before the user is deleted, and a rerun re-purges (idempotent) and fences.
  - This change is declared in the PR body.
- **No caller is left behind.** No production caller of the now-private `purgeMapChain` or of the removed hook name remains. The unlink route test's `@/data/maps/queries` mock lacks `getOwnedMapIds`, but `platform/auth/account-purge` is mocked there, so the path is never reached.

### P322: projectionPending and purgeTransferredCharacter

- **projectionPending.** It was always 0. Nothing in src reads `cron_map_purge` `projectionPending`; `map-lifecycle`'s separate boolean `projectionPending` is untouched. The purge-maps declaration spreads the result, so the body and telemetry simply lose the key, as declared.
- **purgeTransferredCharacter.** Its only production caller, `proveCharacter`, now calls `transferCharacter(row.userId, characterId, row.id)` with the same arguments.

### P164: stale rejected at the source

- **Same error as before.** `requireCurrentDelivery` throws the same `ProjectionUnavailableError` ('a newer projection already won') for stale that `requireCurrentProjection` threw, before the character-scoped check. The old code skipped that check for stale too, so the set of throws is identical.
- **Each removed caller-side check is covered:**
  - map-access-update and map-lifecycle catch `instanceof ProjectionUnavailableError`, which is the same class.
  - map-affiliation-access and tracking-merge-retry treat any throw as "retain for retry".
  - The map-creation and map-purge teardown checks were redundant, because teardown already rejected stale. Their try/catch blocks, which give cleanup 'queued' and wrap in `MapPurgeUnavailableError`, are kept.
- **Only two callers changed behaviour.** These are callers that never checked stale:
  - The creation ladder (declared). It is bounded by 4 attempts and a 20s deadline, and each attempt reserves a new revision, so it cannot loop.
  - The dev/operator scripts, which now exit with the error. This is accepted in the wave guide.
- **No fresh outcome is dropped.** Convex returns stale only when `revision < watermark` (convex/mapAccessProjection.ts:141). 'duplicate' still counts as success.
- **The new creation test is not vacuous.** It fails on the old code, which made one fetch instead of two.

### P165: runUntilDeadline (src/lib/fan-out.ts:61)

- **Every loop behaves the same.** Each one keeps a deadline check before each item, a throw counting as one failure and the loop continuing, and a throw from `onError` (the rotate write) aborting the run as before.
  - Deletion retries keep the pre-enqueue deadline check, and an `undefined` result still counts as nothing ('skipped').
  - Tracking merges keep the injected `writer` for rotation.
  - Scoping counts `false` as failed without logging.
  - Net worth keeps its deferred count and JSON log.
- **Work return types.** recordNetWorthSnapshot and deliverTrackingMerge resolve void, so a return value can't be miscounted.
- **Callers.** The `reconcileTrackingMerges` signature change reaches all three callers: account-merge passes `{ userId }`, and map-affiliation-access calls it with no arguments, so the default deadline is still taken after the read. The housekeeping budget start moved, as declared.
- **Housekeeping status.** Status still turns partial only on an error or `failed > 0`. Adding `deferred` to the telemetry is additive, and nothing in src reads those keys.
- **clock_timestamp() rotation is safe.** Both rotates are standalone statements outside any transaction; the tracking-merge job transaction has already rolled back when `onError` runs. queued_at is used only for ORDER BY fairness, in readDeletionJobs, jobsForCharacter and readPendingTrackingMerges. A rotated job now sorts after inserts that used the `now()` default, which is the intent. No query filters on queued_at, so no job can be hidden or starved by the clock change.
