# Wave 14: Convex backend helpers

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 13: Industry planner and wormhole-sites verticals](wave-13-industry-planner-and-wormhole-sites-verticals.md) · [Index](README.md#roadmap) · [Wave 15: Mapper client: canvas, tracking, scanner and authoring](wave-15-mapper-client-canvas-tracking-scanner-and.md) →

Route capped reads and batch purges through convex/lib, then uniqueByUserCharacter, then the tracked-pilot memo, then the tracking cap, then principal-aware eventActor. Next: findLiveSystem, jump stamp and watermark finders, shared pagination and location-sync lifecycle helpers. Static claims take ids before writeDoorTypeAndClaim, then setRemovedPurgeAfter. The medium-risk single-read map tracking prune follows, then the decideCollapse simplification. Shared door request shapes come last; P246 later wraps them. Use P216's strict error-code assertions throughout.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P195](#p195) | Route every capped indexed read through takeIndexedOrThrow | convex | S | low | medium | — |
| ☐ | [P196](#p196) | Add deleteIndexedBatch to convex/lib/indexedQuery and rebuild Convex batch purges on it | convex | S | low | medium | — |
| ☐ | [P198](#p198) | Generalize uniqueByUserCharacter to all four single-row location tables and route the inline lookups and cache deletes through it | convex | S | low | medium | — |
| ☐ | [P199](#p199) | Move readTrackedPilotSystemIds into convex/lib and share one per-map tracked-pilot memo | convex | S | low | low | [P198](#p198) |
| ☐ | [P200](#p200) | Move the per-(map, user) tracking cap into lib/mapTrackingCapacity and read caller tracking through one bounded helper | convex | S | low | medium | — |
| ☐ | [P201](#p201) | Pass the authorized MapPrincipal into eventActor and share gatedAuthoringEdit across the four authoring entry points | convex | S | low | low | [P200](#p200), [P199](#p199) |
| ☐ | [P202](#p202) | Add findLiveSystem and move requireLiveSystem (with a caller-supplied error) into convex/lib/mapSystemLookup | convex | M | low | medium | — |
| ☐ | [P203](#p203) | Give the jump stamp and the projection watermark named finders, with a forward-only stamp upsert | convex | S | low | low | — |
| ☐ | [P204](#p204) | Move clampPageSize and deniedPage into convex/lib with an explicit max, and drop mapScan's private copies | convex | S | low | low | — |
| ☐ | [P205](#p205) | Fold the location-sync lifecycle steps into locationSchedule and subjects helpers | convex | S | low | medium | — |
| ☐ | [P289](#p289) | Route tombstone incident reads through readTouchingConnections, parallelize independent bounded reads, and let static claims take an id | efficiency | S | low | low | — |
| ☐ | [P206](#p206) | Share the stamp-patch-claim tail of door-type writes and drop the redundant re-reads | convex | S | low | low | [P289](#p289) |
| ☐ | [P207](#p207) | Route scan stub removal through retainRemovedConnection and share the removed-connection purgeAfter re-stamp | convex | S | low | low | — |
| ☐ | [P215](#p215) | Prune map tracking with one by_map read per claim-set apply instead of one query per claimant | efficiency | S | medium | medium | [P196](#p196), [P200](#p200) |
| ☐ | [P311](#p311) | Drop decideCollapse's pilotsPresent and decide pilot retention once in mapAuthoringCollapse | simplification | S | low | low | — |
| ☐ | [P208](#p208) | Share each Convex door's request shape with its Next caller, per data area | contracts-validation | M | low | medium | — |

<a id="p195"></a>

## P195: Route every capped indexed read through takeIndexedOrThrow

- **Status:** [ ] not started
- **Category:** convex · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -45/+20
- **Depends on:** —
- **Existing primitive:** `convex/lib/indexedQuery.ts:takeIndexedOrThrow; convex/lib/mapConnectionLookup.ts:readTouchingConnections`

**Problem.** Seven sites copy takeIndexedOrThrow by hand: mapTrackingCapacity.readMapTracking, mapConnectionLookup.readIndexedConnections, mapJumpReads.readTrackedLocation, mapAuthoringCollapse.readBoundedMapTopology (two reads in sequence), mapAuthoringHome.assertMapEmptyOfLiveSystems, accountMerge.snapshotMergeTracking and mapScanApply.requireTrackedSystem. Two copies have drifted. accountMerge throws string-data ConvexErrors, so they carry no code. mapScanApply throws TRACKING_CAP_EXCEEDED with no detail. mapAuthoringTombstone.readIncidentConnections rebuilds readTouchingConnections with sequential awaits.

**Sites (11).**

- [`convex/lib/indexedQuery.ts:100-110`](../../convex/lib/indexedQuery.ts#L100-L110) — the existing primitive
- [`convex/lib/mapScanState.ts:84-97`](../../convex/lib/mapScanState.ts#L84-L97) — reference caller
- [`convex/mapAuthoringTombstone.ts:35-58`](../../convex/mapAuthoringTombstone.ts#L35-L58) — uses the helper, but readIncidentConnections duplicates readTouchingConnections, reads in sequence and dedupes by _id
- [`convex/lib/mapConnectionLookup.ts:14-36`](../../convex/lib/mapConnectionLookup.ts#L14-L36) — readIndexedConnections hand-rolls the cap, with default code MAP_CONNECTION_SCAN_LIMIT and detail
- [`convex/lib/mapConnectionLookup.ts:72-83`](../../convex/lib/mapConnectionLookup.ts#L72-L83) — readTouchingConnections runs both reads in parallel and passes options to both
- [`convex/lib/mapTrackingCapacity.ts:8-19`](../../convex/lib/mapTrackingCapacity.ts#L8-L19) — readMapTracking, TRACKING_SCAN_LIMIT
- [`convex/mapJumpReads.ts:41-52`](../../convex/mapJumpReads.ts#L41-L52) — MAP_TOO_LARGE, jump-tracking read bound
- [`convex/mapAuthoringCollapse.ts:27-49`](../../convex/mapAuthoringCollapse.ts#L27-L49) — two sequential capped reads, one combined throw (MAP_TOO_LARGE)
- [`convex/mapAuthoringHome.ts:12-25`](../../convex/mapAuthoringHome.ts#L12-L25) — MAP_TOO_LARGE, empty-map proof bound
- [`convex/accountMerge.ts:73, 82-87`](../../convex/accountMerge.ts#L73) — drift: string-data ConvexError('Too many tracking selections...'), no code
- [`convex/lib/mapScanApply.ts:61-67`](../../convex/lib/mapScanApply.ts#L61-L67) — drift: { code: 'TRACKING_CAP_EXCEEDED' } with no detail

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapTrackingOptIn.ts:16-28, 48-54`](../../convex/mapTrackingOptIn.ts#L16-L28) — take(cap+1) feeds an insert-capacity check (>= cap), not an overflow throw
- [`convex/mapAuthoringSweep.ts:22-39`](../../convex/mapAuthoringSweep.ts#L22-L39) — returns an overflow flag and continues; never throws
- [`convex/accountMerge.ts:108-110, 159-161`](../../convex/accountMerge.ts#L108-L110) — argument-length checks, not indexed reads. They share the string-data drift; fix them in the same pass for consistency.
- [`convex/mapTrackingLive.ts:114-119`](../../convex/mapTrackingLive.ts#L114-L119) — argument-length check
- [`convex/mapJumpReads.ts:53-62`](../../convex/mapJumpReads.ts#L53-L62) — sequential characterLocation join loop; separate opportunity
- [`convex/mapPurge.ts:27-46`](../../convex/mapPurge.ts#L27-L46) — take(+1) for batch deletes, not a cap; covered by P196

</details>

**Home.** `convex/lib/indexedQuery.ts:takeIndexedOrThrow and convex/lib/mapConnectionLookup.ts:readTouchingConnections, both existing; no new primitive`

**Boundary check.** Every site and both primitives are in the convex zone (convex/**). Imports within the zone are unrestricted, and convex/lib is already imported by every touched module or its siblings. The optional MERGE_TRACKING_LIMIT move goes to src/data/location-tracking/constants.ts. The convex rule allows data, and convex/accountMerge.ts:2 and convex/httpAccountMerge.ts:2 already import that file.

**API sketch.**

```ts
takeIndexedOrThrow<T>(query: { take(n: number): Promise<T[]> }, cap: number, error: { code: string; detail: string }): Promise<T[]>  // unchanged
readTouchingConnections(ctx: QueryCtx, mapId: string, systemId: number, options?: { limit?: number; errorCode?: string; errorDetail?: string }): Promise<Doc<'mapConnections'>[]>  // unchanged
```

**Migration steps.**

1. convex/lib/mapConnectionLookup.ts readIndexedConnections: replace the take/throw body with `return takeIndexedOrThrow(ctx.db.query('mapConnections').withIndex(index, (q) => q.eq('mapId', mapId).eq(field, systemId)), limit, { code: options.errorCode ?? 'MAP_CONNECTION_SCAN_LIMIT', detail: options.errorDetail ?? `Map ${mapId} exceeds the ${limit}-connection ${boundLabel} scan bound.` })`, then drop its ConvexError import if unused.
2. convex/lib/mapTrackingCapacity.ts readMapTracking: wrap the by_map query in takeIndexedOrThrow with the same TRACKING_SCAN_LIMIT code and detail. Keep the ConvexError import, which requireMapTrackingSpace still uses.
3. convex/mapJumpReads.ts readTrackedLocation, lines 41-52: switch to takeIndexedOrThrow with the same MAP_TOO_LARGE code and detail.
4. convex/mapAuthoringHome.ts lines 16-25: switch to takeIndexedOrThrow with the same code and detail. Keep the MAP_NOT_EMPTY throw.
5. convex/mapAuthoringCollapse.ts readBoundedMapTopology: `const bound = { code: 'MAP_TOO_LARGE', detail: ... }; const [systems, connections] = await Promise.all([takeIndexedOrThrow(systemsQuery, COLLAPSE_MAP_SCAN_CAP, bound), takeIndexedOrThrow(connectionsQuery, COLLAPSE_MAP_SCAN_CAP, bound)]);`. The Promise.all-in-mutation precedent is readScanState at mapScanState.ts:117-121.
6. convex/lib/mapScanApply.ts requireTrackedSystem, lines 61-67: switch to takeIndexedOrThrow with code TRACKING_CAP_EXCEEDED and detail `At most ${TRACKED_CHARACTERS_PER_MAP_USER_CAP} tracked characters per map.`, the same text mapTrackingOptIn.ts:26 uses for that code.
7. convex/accountMerge.ts snapshotMergeTracking: switch to takeIndexedOrThrow with code 'MERGE_TRACKING_LIMIT' and detail 'Too many tracking selections to safely snapshot this merge'. In the same pass, give the arg checks at 108-110 and 159-161 object data, e.g. codes MERGE_TRACKING_LIMIT and MERGE_RECEIPT_BATCH_LIMIT, keeping their messages as detail.
8. Move MERGE_TRACKING_LIMIT (1000) to src/data/location-tracking/constants.ts beside MERGE_RECEIPT_BATCH_SIZE. Use it at convex/accountMerge.ts:73, at convex/httpAccountMerge.ts:38 (replacing the literal .max(1000)) and at src/data/location-tracking/merge.ts:20 (replacing the literal .max(1000)).
9. convex/mapAuthoringTombstone.ts: replace readIncidentConnections' body with `const rows = await readTouchingConnections(ctx, mapId, systemId, { limit: LIVE_CONNECTION_SCAN_CAP, errorCode: 'MAP_TOO_LARGE', errorDetail: <same detail> }); return [...new Map(rows.map((row) => [row._id, row])).values()];`. Swap the takeIndexedOrThrow import for readTouchingConnections.

**Tests.** Existing guards: convex/mapTracking.test.ts:331,333,526,581 (TRACKING_SCAN_LIMIT); convex/accountMerge.test.ts:115,236 (toThrow('Too many tracking selections'), which still passes because a ConvexError built from an object puts the stringified data, detail included, in its message; tighten it to assert code MERGE_TRACKING_LIMIT); convex/mapAuthoringCollapse.test.ts, convex/mapJump.test.ts and convex/mapScan.test.ts (MAP_TOO_LARGE, TRACKING_CAP_EXCEEDED, MAP_SIGNATURE_SCAN_LIMIT); convex/lib/mapConnectionLookup.test.ts (readIndexedConnections defaults). Add a tombstone test showing the incident-connection cap still throws MAP_TOO_LARGE with the liveness-proof detail through readTouchingConnections, and a mapScanApply cap test asserting the new detail field.

**Notes.** Keep every existing code and detail string character for character. The new behavior is limited to accountMerge errors gaining codes and mapScanApply gaining a detail. In mapAuthoringCollapse, the parallel reads throw the same code and detail whichever read overflows, so the observable error does not change. readTouchingConnections passes the same errorDetail to both index reads, which matches today's shared incidentBound object. Keep the _id dedupe: self-loops are rejected upstream (mapEntityContracts.ts:285), so it is defensive only, and a duplicate would just repeat a patch.

<sub>Reported by: area:convex, concern:efficiency, concern:persistence.</sub>

<a id="p196"></a>

## P196: Add deleteIndexedBatch to convex/lib/indexedQuery and rebuild Convex batch purges on it

- **Status:** [ ] not started
- **Category:** convex · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -45/+20
- **Depends on:** —
- **Existing primitive:** `convex/mapPurge.ts:purgeTable (private); src/lib/batched-delete.ts:deleteInBatches is the drizzle analogue and cannot be imported into Convex`

**Problem.** Six Convex batch-purge steps and one budgeted variant each hand-write take(N+1), slice(0, N), delete each row in order, and return { deleted, hasMore: rows.length > N }. The result type is declared four times (TablePurgeResult, UserClaimsPurgeResult, SignaturePurgeResult and an inline type). mapJumpBookkeeping.purgeForMap duplicates mapPurge's private purgeTable for a table already listed in MAP_PURGE_TABLES, under its own MAP_JUMP_BOOKKEEPING_PURGE_BATCH constant.

**Verifier revision.** The take(BATCH+1) / slice / delete-each / {deleted, hasMore} step is truly the same in 6 sites, and the budgeted deleteSystemChildren is the same step applied twice. mapJumpBookkeeping.purgeForMap is purgeTable('mapJumpBookkeeping') under a second batch constant of the same value (128). The proposal's fix for it is wrong, though. A new internal mutation taking an arbitrary `table` argument widens the internal surface and needs a union validator. Both the purge-coverage registry text (src/platform/purge/__tests__/coverage.ts:116-117) and httpMapAccess name internal.mapJumpBookkeeping.purgeForMap. The revision keeps that mutation and has it delegate to an exported purgeMapTable helper. Removal must stay sequential: deleteTrackingRow reads survivors after each delete (mapTrackingTeardown.ts:6-26), so a parallel remover would leave bookkeeping orphaned.

**Sites (7).**

- [`convex/mapPurge.ts:22-46`](../../convex/mapPurge.ts#L22-L46) — TablePurgeResult and private purgeTable<Table>, the best existing form
- [`convex/mapJumpBookkeeping.ts:4, 22-38`](../../convex/mapJumpBookkeeping.ts#L4) — purgeForMap re-implements purgeTable('mapJumpBookkeeping') with a duplicate batch constant
- [`convex/lib/mapSignatureCleanup.ts:5-28`](../../convex/lib/mapSignatureCleanup.ts#L5-L28) — purgeExpiredSignatures, result field deletedCount
- [`convex/mapChainCleanup.ts:214-227`](../../convex/mapChainCleanup.ts#L214-L227) — purgeExpiredEvents, result field deletedEvents
- [`convex/mapAccessProjection.ts:54-57, 256-280`](../../convex/mapAccessProjection.ts#L54-L57) — UserClaimsPurgeResult; mapAccess batch followed by the tracking batch
- [`convex/mapTrackingTeardown.ts:75-89`](../../convex/mapTrackingTeardown.ts#L75-L89) — same step, but the remover is deleteTrackingRow and must run in sequence
- [`convex/mapChainCleanup.ts:59-77`](../../convex/mapChainCleanup.ts#L59-L77) — budgeted variant: signatures, then activity, within the remaining budget

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/engineSweep.ts:46-105`](../../convex/engineSweep.ts#L46-L105) — take(N) without +1, capped by length === N, per-row side effects, budget shared across tables
- [`convex/onlineStatus.ts:4-8`](../../convex/onlineStatus.ts#L4-L8) — drainCharacterOnline uses take(limit) with no +1. It could adopt the helper only if engineSweep's `online === RETIRED_GC_BATCH` became hasMore, which changes the capped semantics, so it is left out
- [`convex/mapAccessProjection.ts:300-307`](../../convex/mapAccessProjection.ts#L300-L307) — purgeUserMapClaims takes per-(map, user) pair rows with no +1 and no hasMore; not a drain step
- [`convex/characterLocationPurge.ts:8-51`](../../convex/characterLocationPurge.ts#L8-L51) — unbounded collect() across five tables, not a bounded batch
- [`convex/mapChainCleanup.ts:79-97, 177-212`](../../convex/mapChainCleanup.ts#L79-L97) — per-row child cleanup and settle logic, not plain deletes

</details>

**Home.** `convex/lib/indexedQuery.ts (deleteIndexedBatch and IndexedBatchDeleteResult); convex/mapPurge.ts (exported purgeMapTable)`

**Boundary check.** Convex zone only (convex/**), with no cross-zone imports. src/lib/batched-delete.ts is drizzle-specific (it imports drizzle-orm and uses ctid SQL). The convex rule would allow importing lib, but that module does not fit Convex, so it is not reused. mapJumpBookkeeping.ts importing mapPurge.ts creates no cycle, because mapPurge imports only _generated.

**API sketch.**

```ts
// convex/lib/indexedQuery.ts
export interface IndexedBatchDeleteResult { readonly deleted: number; readonly hasMore: boolean }
export async function deleteIndexedBatch<T>(
  query: { take: (n: number) => Promise<T[]> },
  limit: number,
  remove: (row: T) => Promise<unknown>,   // awaited sequentially, in index order
): Promise<IndexedBatchDeleteResult>

// convex/mapPurge.ts
export function purgeMapTable<Table extends MapPurgeTable>(ctx: MutationCtx, table: Table, mapId: string): Promise<IndexedBatchDeleteResult>
```

**Migration steps.**

1. Add deleteIndexedBatch and IndexedBatchDeleteResult to convex/lib/indexedQuery.ts beside takeIndexedOrThrow. Use a plain `for (const row of doomed) await remove(row)` loop, never Promise.all.
2. convex/mapPurge.ts: rebuild purgeTable on the helper, keeping the Doc<Table> cast for the generic. Rename it to the exported purgeMapTable, and replace TablePurgeResult with IndexedBatchDeleteResult.
3. convex/mapJumpBookkeeping.ts: keep `export const purgeForMap = internalMutation({ args: { mapId }, handler: (ctx, { mapId }) => purgeMapTable(ctx, 'mapJumpBookkeeping', mapId) })`. Delete MAP_JUMP_BOOKKEEPING_PURGE_BATCH, and change convex/httpMapAccess.test.ts:5,128 to import MAP_PURGE_BATCH.
4. convex/lib/mapSignatureCleanup.ts: `const { deleted, hasMore } = await deleteIndexedBatch(query, SIGNATURE_PURGE_BATCH, (row) => ctx.db.delete(row._id)); return { deletedCount: deleted, hasMore };`
5. convex/mapChainCleanup.ts purgeExpiredEvents: the same pattern, returning { deletedEvents: deleted, hasMore }.
6. convex/mapAccessProjection.ts purgeUserClaims: replace the mapAccess block with deleteIndexedBatch, and return { deleted: access.deleted + tracking.deleted, hasMore: access.hasMore || tracking.hasMore }. Replace UserClaimsPurgeResult with IndexedBatchDeleteResult, or alias it.
7. convex/mapTrackingTeardown.ts purgeTrackingForUserBatch: `return deleteIndexedBatch(query, limit, (row) => deleteTrackingRow(ctx, row))`.
8. convex/mapChainCleanup.ts deleteSystemChildren: `const sigs = await deleteIndexedBatch(queryMapSignatures(...), budget, del); if (sigs.hasMore) return { deleted: sigs.deleted, done: false }; const act = await deleteIndexedBatch(queryMapSignatureActivity(...), budget - sigs.deleted, del); return { deleted: sigs.deleted + act.deleted, done: !act.hasMore };`

**Tests.** Existing guards: convex/mapPurge.test.ts:31-94 (MAP_PURGE_BATCH+2 rows; expects { deleted: MAP_PURGE_BATCH + 9, hasMore: true }); convex/httpMapAccess.test.ts:128 (bookkeeping drain over a batch boundary); convex/mapAccessProjection.test.ts:268-285 ({ deleted: MAP_ACCESS_PURGE_BATCH, hasMore: true }); convex/mapScan.test.ts:2218-2233 and convex/mapFixtures.test.ts:1234-1283 (deletedCount / hasMore); convex/lib/mapChainCleanup.test.ts (budgeted child purge). Add direct cases for deleteIndexedBatch: limit 0 (deletes nothing; hasMore true when any row exists), exactly limit rows (hasMore false), limit+1 rows (hasMore true), and the remover being called in index order. Add a mapTrackingTeardown test: two users tracking the same map+character, purged in one batch, leave bookkeeping only while a survivor remains. This guards the sequential-remover invariant.

**Notes.** Keep each site's result field names (deleted, deletedCount, deletedEvents, done) and every batch size. All are 128 today except the caller-supplied limits. The remover must stay sequential (see reason). In deleteSystemChildren, a zero budget must still return done:false when signatures remain; with the helper, take(1) and slice(0,0) give deleted 0 and hasMore true, which matches today. Keep the purgeForMap mutation name, because src/platform/purge/__tests__/coverage.ts:116-117 and convex/httpMapAccess.ts:66 reference it.

<sub>Reported by: area:convex, concern:persistence.</sub>

<a id="p198"></a>

## P198: Generalize uniqueByUserCharacter to all four single-row location tables and route the inline lookups and cache deletes through it

- **Status:** [ ] not started
- **Category:** convex · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -55 / +20
- **Depends on:** —
- **Existing primitive:** `convex/lib/indexedQuery.ts:uniqueByUserCharacter`

**Problem.** convex/lib/indexedQuery.ts:uniqueByUserCharacter covers only characterLocation and characterLocationCovered, through two overloads and a switch with one identical branch per table. Callers therefore inline `.withIndex('by_user_character', q => q.eq('userId').eq('characterId')).unique()`, even for characterLocation, which the helper already covers. characterLocationOnline and characterLocationAccess have the same unique (userId, characterId) index (schema.ts:216-241) but no helper. As a result, locationCaches.ts and characterLocationAccess.ts each wrote a private lookup-and-delete over these tables. Separately, characterLocationPurge.purgeForUser pastes the same optional-character scope lambda five times.

**Verifier revision.** The core holds. uniqueByUserCharacter is bypassed by about ten inline single-row lookups, including four characterLocation reads it already covers (characterLocationApply:185-187, characterLocationReads:43-44, mapScanApply:69-75, mapJumpReads:55-60). locationCaches.deleteCharacterCache and characterLocationAccess.findAccessLease/clearAccessLeases are a second ad-hoc lookup-and-delete over the same tables. Three parts of the proposal change. (1) onlineStatus is out. characterOnline is a retired table that engineSweep drains ahead of a wipe deploy (src/platform/purge/__tests__/coverage.ts:61), and it has its own by_user index. (2) A shared queryByUserScope in indexedQuery has only one real consumer, characterLocationPurge (5 copies in one file). The other user-scope reads (clearCoverageForUser, applyCoverageSet, accountMerge:47-50 and 82-84, mapTrackingTeardown:80-83) are one-line `q.eq('userId', userId)` prefixes that a helper would not shorten. So the scope helper stays module-local, per AGENTS.md's second-consumer rule. (3) locationCaches proves that a union-typed table parameter compiles. A generic `T` with a narrow `Doc<T>` return is not proven, so the cast or overload fallback below is part of the design.

**Sites (12).**

- [`convex/lib/indexedQuery.ts:5-45`](../../convex/lib/indexedQuery.ts#L5-L45) — two overloads plus a switch with identical bodies; only characterLocation and characterLocationCovered
- [`convex/lib/locationCaches.ts:3-22`](../../convex/lib/locationCaches.ts#L3-L22) — local CharacterCacheTable union (location/online/access); deleteCharacterCache repeats the unique lookup through a union-typed table, which proves the union form compiles
- [`convex/characterLocationReads.ts:41-49`](../../convex/characterLocationReads.ts#L41-L49) — three inline unique lookups per tracked character (location, online, access) inside Promise.all
- [`convex/characterLocationAccess.ts:27-36`](../../convex/characterLocationAccess.ts#L27-L36) — clearAccessLeases: per-character find-then-delete, the same as locationCaches.deleteCharacterCache for characterLocationAccess
- [`convex/characterLocationAccess.ts:51,69-79`](../../convex/characterLocationAccess.ts#L51) — findAccessLease: private copy of the unique lookup on characterLocationAccess
- [`convex/characterLocationApply.ts:177-188`](../../convex/characterLocationApply.ts#L177-L188) — inline characterLocationOnline and characterLocation lookups; both run only under a condition (a held probe or a 304 skips the read)
- [`convex/lib/mapScanApply.ts:69-75`](../../convex/lib/mapScanApply.ts#L69-L75) — raw characterLocation unique lookup per tracking row
- [`convex/mapJumpReads.ts:54-60`](../../convex/mapJumpReads.ts#L54-L60) — raw characterLocation unique lookup per tracking row
- [`convex/mapTrackingLive.ts:23-29`](../../convex/mapTrackingLive.ts#L23-L29) — findCharacterLocation: pass-through wrapper over the helper
- [`convex/mapFixtureTracking.ts:68-69`](../../convex/mapFixtureTracking.ts#L68-L69) — already uses the helper for characterLocation
- [`convex/lib/locationCoverage.ts:39-50`](../../convex/lib/locationCoverage.ts#L39-L50) — findCoverage: pass-through wrapper over the helper (keep as the named domain read; 3 callers)
- [`convex/characterLocationPurge.ts:8-42`](../../convex/characterLocationPurge.ts#L8-L42) — the scope lambda `byUser = q.eq('userId'); characterId === null ? byUser : byUser.eq('characterId')` written five times (location, online, mapTracking, access, covered)

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/onlineStatus.ts:10-28`](../../convex/onlineStatus.ts#L10-L28) — characterOnline is retired (drained by engineSweep.ts:71 via drainCharacterOnline ahead of a wipe deploy) and uses a separate by_user index. It will be deleted, not refactored.
- [`convex/characterLocationReads.ts:23-31`](../../convex/characterLocationReads.ts#L23-L31) — seek loop over mapTracking using .gt('characterId', previous).first(); a different access pattern
- [`convex/lib/locationCoverage.ts:12-15,28-37`](../../convex/lib/locationCoverage.ts#L12-L15) — user-prefix-only reads (characterId is never set); a scope helper would not shorten them
- [`convex/accountMerge.ts:47-50,82-84`](../../convex/accountMerge.ts#L47-L50) — user-prefix-only mapTracking reads; one-line eq, no gain
- [`convex/mapTrackingTeardown.ts:75-89`](../../convex/mapTrackingTeardown.ts#L75-L89) — user-prefix batched mapTracking purge; one-line eq, no gain
- [`convex/mapFixtureTracking.ts:70-76`](../../convex/mapFixtureTracking.ts#L70-L76) — mapTracking is not unique per (user, character) (one row per map); filtered by mapId, so it is not a uniqueByUserCharacter table
- [`convex/characterLocationAccess.ts:44-50`](../../convex/characterLocationAccess.ts#L44-L50) — mapTracking existence check with .first(); not a unique-row read

</details>

**Home.** `convex/lib/indexedQuery.ts (uniqueByUserCharacter and the UserCharacterTable type); convex/lib/locationCaches.ts (export deleteCharacterCache); the purge scope helper stays module-local in convex/characterLocationPurge.ts`

**Boundary check.** All homes and consumers are in the 'convex' zone (patterns ['convex/**']). Imports inside one zone are not restricted by boundaries.rules. The convex rule `{ from: 'convex', allow: ['platform/esi','platform/auth','data','lib'] }` only governs imports leaving the zone, and none are added. The root modules (characterLocationReads, characterLocationAccess, characterLocationApply, mapJumpReads) and lib modules (mapScanApply, locationCaches) already import convex/lib, so the direction is unchanged. No new files, so neither convex/__tests__/modules.setup.ts nor codegen changes.

**API sketch.**

```ts
// convex/lib/indexedQuery.ts
export type UserCharacterTable =
  | 'characterLocation' | 'characterLocationCovered'
  | 'characterLocationOnline' | 'characterLocationAccess';
export function uniqueByUserCharacter<T extends UserCharacterTable>(
  ctx: Pick<QueryCtx, 'db'>, table: T, userId: string, characterId: number,
): Promise<Doc<T> | null> {
  return ctx.db.query(table as UserCharacterTable)
    .withIndex('by_user_character', (q) => q.eq('userId', userId).eq('characterId', characterId))
    .unique() as Promise<Doc<T> | null>; // cast confined here
}
// Fallback if tsc rejects the single cast: keep one overload per table and use the union body above in place of the switch.

// convex/lib/locationCaches.ts
export async function deleteCharacterCache(
  ctx: MutationCtx, table: Exclude<UserCharacterTable, 'characterLocationCovered'>, userId: string, characterId: number,
): Promise<void> // body: const row = await uniqueByUserCharacter(...); if (row) await ctx.db.delete(table, row._id)

// convex/characterLocationPurge.ts (module-local)
function collectUserScope<T extends UserCharacterTable | 'mapTracking'>(
  ctx: MutationCtx, table: T, userId: string, characterId: number | null,
): Promise<Doc<T>[]>
```

**Migration steps.**

1. In convex/lib/indexedQuery.ts, rename UserCharacterIndexedTable to UserCharacterTable and add 'characterLocationOnline' and 'characterLocationAccess'. Replace the two overloads and the switch with the generic body above. If tsc rejects the single `as`, keep one overload per table and replace only the switch with the union-typed body. Run typecheck before touching any caller.
2. In convex/lib/locationCaches.ts, drop the local CharacterCacheTable type in favour of `Exclude<UserCharacterTable, 'characterLocationCovered'>`. Rewrite deleteCharacterCache on top of uniqueByUserCharacter and export it.
3. In convex/characterLocationAccess.ts, delete findAccessLease (69-79). Make clearAccessLeases loop over `deleteCharacterCache(ctx, 'characterLocationAccess', userId, id)`, and change upsertAccessLease:51 to call `uniqueByUserCharacter(ctx, 'characterLocationAccess', userId, lease.characterId)`.
4. In convex/characterLocationReads.ts:42-49, replace the three inline lookups with uniqueByUserCharacter calls and keep the Promise.all.
5. In convex/characterLocationApply.ts:179-187, replace both inline lookups with uniqueByUserCharacter and keep both conditions so held probes and 304 locations still skip the read.
6. In convex/lib/mapScanApply.ts:69-75 and convex/mapJumpReads.ts:55-60, replace the raw characterLocation lookups with `uniqueByUserCharacter(ctx, 'characterLocation', userId|tracking.userId, row.characterId|characterId)`.
7. In convex/mapTrackingLive.ts, delete the findCharacterLocation wrapper (23-29) and call uniqueByUserCharacter at 51 and 148. P199 may move the 148 caller instead.
8. In convex/characterLocationPurge.ts, add the module-local collectUserScope with the scope lambda written once. Replace the five queries at 8-42 with collectUserScope calls. The deletion loops, stamp logic and return counts stay as they are.
9. Delete the now-unused UserCharacterIndexedTable export and confirm Fallow reports no unused exports or types.

**Tests.** Existing guards: convex/characterLocationReads.test.ts (syncInputs payload), convex/characterLocationApply.test.ts (conditional probe and location reads), convex/characterLocationAccess.test.ts:80-117 (upsert, skip untracked, named-character clear, no-op when absent), convex/characterLocationPurge.test.ts:19-185 (whole-user and named-character purge, cross-user isolation), convex/mapScan.test.ts:148 (UNTRACKED_SCAN_SYSTEM), the convex/mapJump*.test.ts suites and convex/mapTracking.test.ts. Add convex/lib/indexedQuery.test.ts: one convex-test that seeds two users x two characters in each of the four tables and asserts that uniqueByUserCharacter returns only the matching row and null otherwise. Extend characterLocationPurge.test.ts:100 ('deletes only the named character...') to also seed characterLocationOnline, characterLocationAccess and characterLocationCovered for both characters and assert that only the named character's rows go.

**Notes.** Behaviour to preserve: (a) characterLocationApply reads only under its conditions (result.online/onlineExpiresAt non-null; error null with solarSystemId non-null). Do not hoist the lookups. (b) characterLocationPurge's stamp logic uses `locations` and `tracking` docs for characterIds, and tracking docs must stay Doc<'mapTracking'> for deleteTrackingRow, which is why the local helper is generic. (c) clearAccessLeases currently deletes sequentially; keep it sequential. No drift between the copies: every inline lookup uses the same index and unique() semantics, so this is pure consolidation. The fallow dupes file groups indexedQuery.ts:32-35/39-42, characterLocationReads.ts:43-48, characterLocationAccess.ts:75-78, locationCaches.ts:18-19 and mapScanApply.ts:62-63 together, which supports the merge.

<sub>Reported by: area:convex, concern:persistence.</sub>

<a id="p199"></a>

## P199: Move readTrackedPilotSystemIds into convex/lib and share one per-map tracked-pilot memo

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +20
- **Depends on:** [P198](#p198)
- **Existing primitive:** `convex/lib/indexedQuery.ts:uniqueByUserCharacter; convex/lib/mapTrackingCapacity.ts:readMapTracking`

**Problem.** readTrackedPilotSystemIds (the solar systems holding a tracked pilot on a map) is defined in convex/mapTrackingLive.ts, a public query module. Collapse decisions consume it from convex/lib/mapScanSelection.ts (a lib-to-root import), convex/mapAuthoringSweep.ts and convex/mapChainCleanup.ts. Each consumer hand-rolls its own memo: two Map<mapId, ReadonlySet<number>> caches with get/set boilerplate, and one lazy single-map closure that wraps the result into CollapsePilotsPresent.

**Verifier revision.** The join is not really 'implemented four times'. mapTrackingLive's two readers already share findCharacterLocation. After P198, the mapScanApply and mapJumpReads joins are a single uniqueByUserCharacter call per row, so a joinTrackedLocations primitive would save about two lines per site and add indirection. The mapJumpReads efficiency claim fails: the loop runs over the by_map_character rows of one character on one map. That is realistically one row (a second appears only around account reassignment) and is capped at 256, so the sequential loop costs nothing measurable. Two parts are real. (1) readTrackedPilotSystemIds lives in the public-query module mapTrackingLive.ts but has three non-query consumers, one of them a lib module (lib/mapScanSelection.ts:18). (2) Three hand-rolled per-map memos wrap it (mapAuthoringSweep, mapChainCleanup, mapScanSelection). The revision narrows the work to moving that function into lib and sharing one memo factory. Moving it removes only one of mapScanSelection's upward imports; ../mapAuthoringCollapse remains.

**Sites (6).**

- [`convex/mapTrackingLive.ts:142-155`](../../convex/mapTrackingLive.ts#L142-L155) — readTrackedPilotSystemIds: readMapTracking, then the characterLocation join, then a Set of solarSystemIds; exported from a public-query module
- [`convex/lib/mapScanSelection.ts:18,35-44,163,326`](../../convex/lib/mapScanSelection.ts#L18) — lib imports ../mapTrackingLive; trackedPresenceReader is a lazy single-map memo used twice
- [`convex/mapAuthoringSweep.ts:12,41-51,102,122`](../../convex/mapAuthoringSweep.ts#L12) — trackedByMap Map memo created per sweep and threaded into collapseDueRow
- [`convex/mapChainCleanup.ts:14,99-114,180`](../../convex/mapChainCleanup.ts#L14) — SettleState.tracked Map memo plus the trackedFor get/set helper
- [`convex/lib/mapTrackingCapacity.ts:8-19`](../../convex/lib/mapTrackingCapacity.ts#L8-L19) — readMapTracking, the bounded map-wide read the moved function builds on (throws TRACKING_SCAN_LIMIT; never truncates)
- [`convex/mapTracking.test.ts:8,330-333`](../../convex/mapTracking.test.ts#L8) — test imports readTrackedPilotSystemIds from ./mapTrackingLive and asserts TRACKING_SCAN_LIMIT on overflow

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapTrackingLive.ts:46-64`](../../convex/mapTrackingLive.ts#L46-L64) — readTrackedLocations: the 'freshest per character' payload is specific to the forMap query; it already shares the lookup and stays
- [`convex/lib/mapScanApply.ts:61-81`](../../convex/lib/mapScanApply.ts#L61-L81) — caller-scoped (by_map_user) 'any pilot in this system' check; after P198 its join is one uniqueByUserCharacter call, so no shared join helper is needed
- [`convex/mapJumpReads.ts:36-65`](../../convex/mapJumpReads.ts#L36-L65) — by_map_character read with an exactly-one policy. The sequential loop runs over one character's rows on one map (realistically 1, capped at 256), so there is no material efficiency problem. P198 converts the lookup.

</details>

**Home.** `New convex/lib/mapTrackedPilots.ts (readTrackedPilotSystemIds, trackedPilotSystemsByMap)`

**Boundary check.** The home and all consumers (convex/mapTrackingLive.ts, convex/mapAuthoringSweep.ts, convex/mapChainCleanup.ts, convex/lib/mapScanSelection.ts, convex/mapTracking.test.ts) are in the 'convex' zone, where imports are unrestricted. The new lib module imports only ./mapTrackingCapacity, ./indexedQuery and ../_generated, so it adds no upward lib-to-root edge and no cycle. convex/lib/mapScanSelection.ts keeps one upward import (../mapAuthoringCollapse for runCollapse/runBranchRestore/CollapsePilotsPresent); that is outside this change.

**API sketch.**

```ts
// convex/lib/mapTrackedPilots.ts
export async function readTrackedPilotSystemIds(ctx: QueryCtx, mapId: string): Promise<ReadonlySet<number>>; // moved verbatim; lookup via uniqueByUserCharacter(ctx, 'characterLocation', row.userId, row.characterId)

/** One read per map per transaction. Caches settled values only, so a TRACKING_SCAN_LIMIT throw is re-raised on the next call exactly as today. */
export function trackedPilotSystemsByMap(ctx: QueryCtx): (mapId: string) => Promise<ReadonlySet<number>> {
  const held = new Map<string, ReadonlySet<number>>();
  return async (mapId) => {
    const cached = held.get(mapId);
    if (cached !== undefined) return cached;
    const tracked = await readTrackedPilotSystemIds(ctx, mapId);
    held.set(mapId, tracked);
    return tracked;
  };
}
```

**Migration steps.**

1. Land P198 first so the moved function calls uniqueByUserCharacter directly and mapTrackingLive.findCharacterLocation is already gone.
2. Create convex/lib/mapTrackedPilots.ts with readTrackedPilotSystemIds (moved verbatim from mapTrackingLive.ts:142-155) and trackedPilotSystemsByMap. Add '../lib/mapTrackedPilots.ts' to convex/__tests__/modules.setup.ts (convex/__tests__/modules.test.ts enforces the list) and regenerate convex/_generated (api.d.ts lists every lib module).
3. Delete readTrackedPilotSystemIds from convex/mapTrackingLive.ts and update the import in convex/mapTracking.test.ts:8.
4. In convex/mapAuthoringSweep.ts, create `const tracked = trackedPilotSystemsByMap(ctx)` in sweepExpiredCeilings (in place of the Map at 102). Pass it to collapseDueRow in place of trackedByMap and replace lines 47-51 with `pilotsPresent: { trackedInSystemIds: await tracked(row.mapId) }` inside the existing try.
5. In convex/mapChainCleanup.ts, change SettleState.tracked to `(mapId: string) => Promise<ReadonlySet<number>>`, build it at line 180 with trackedPilotSystemsByMap(ctx), delete trackedFor (104-114) and call `state.tracked(connection.mapId)` at line 133.
6. In convex/lib/mapScanSelection.ts, make trackedPresenceReader (35-44) a thin adapter: `const tracked = trackedPilotSystemsByMap(ctx); return async () => ({ trackedInSystemIds: await tracked(mapId) });`. Alternatively inline it at 163 and 326. Replace the ../mapTrackingLive import with ./mapTrackedPilots.

**Tests.** Move the readTrackedPilotSystemIds overflow assertion (convex/mapTracking.test.ts:330-333) to the new import path unchanged. Existing behaviour guards: convex/mapAuthoringSweep.test.ts (collapse fallback after a failed read, with failedMapIds skipping later rows), convex/lib/mapChainCleanup.test.ts (held versus branch_removed when pilots are present), and the convex/mapScan.test.ts confident-removal collapse cases. Add one test for trackedPilotSystemsByMap that reads the same map twice and the second map once, and asserts one underlying read per map (for example, by seeding a location change between calls and checking that the memoized set is returned).

**Notes.** Preserve laziness. mapScanSelection reads tracked pilots only when a resolved connection is actually removed, and the memo factory must not read eagerly. Preserve failure behaviour by caching only settled values, never a rejected promise. mapAuthoringSweep catches the throw and adds the map to failedMapIds, and mapChainCleanup turns it into 'retry'. Today neither caches a failure, so repeat calls re-read and re-throw; with value-only caching that stays identical. The memo is safe within one mutation because collapses and settlements never write characterLocation; mapChainCleanup clears only its liveness cache after branch_removed (line 144), correctly.

<sub>Reported by: area:convex.</sub>

<a id="p200"></a>

## P200: Move the per-(map, user) tracking cap into lib/mapTrackingCapacity and read caller tracking through one bounded helper

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -15 / +12
- **Depends on:** —
- **Existing primitive:** `convex/lib/mapTrackingCapacity.ts:readMapTracking`

**Problem.** TRACKED_CHARACTERS_PER_MAP_USER_CAP is defined in the public-mutation module convex/mapTrackingOptIn.ts, so convex/lib/mapScanApply.ts imports a constant upward from a root module. The per-map cap and readMapTracking already live in convex/lib/mapTrackingCapacity.ts. Five sites read one account's mapTracking rows on one map through by_map_user with three bounds: take(CAP+1) at two sites, take(CAP) at two sites, and an unbounded collect() in eventActor.

**Verifier revision.** The constant placement is real: lib/mapScanApply.ts imports TRACKED_CHARACTERS_PER_MAP_USER_CAP upward from the mutation module mapTrackingOptIn.ts, while its sibling TRACKED_CHARACTERS_PER_MAP_CAP and readMapTracking already sit in lib/mapTrackingCapacity.ts. The scattered by_map_user reads are also real: five sites use three different bounds for the same 'one account's tracking rows on one map' read. Three corrections. (1) mapTrackingTeardown.deleteUserTrackingWhere must stay unbounded: revocation and character-scope teardown have to delete every row even past a cap breach. (2) A throwing reader is wrong for every site except mapScanApply. setTracking opt-out, account merge and actor naming must keep working past a breach, and the test at convex/mapTracking.test.ts:259-295 exercises toggle-off at the cap. (3) Two readers (throw and peek) are unnecessary. A single non-throwing read of CAP+1 rows serves every site: `>= CAP` decisions are unchanged and mapScanApply keeps its explicit `> CAP` breach check. The F429 'silent truncation' framing of accountMerge stays rejected; its take(CAP) is a deliberate full/dropped decision.

**Sites (8).**

- [`convex/lib/mapTrackingCapacity.ts:1-28`](../../convex/lib/mapTrackingCapacity.ts#L1-L28) — home: TRACKED_CHARACTERS_PER_MAP_CAP, readMapTracking and requireMapTrackingSpace already here
- [`convex/mapTrackingOptIn.ts:8,16-32,47-54`](../../convex/mapTrackingOptIn.ts#L8) — constant defined in a mutation module; setTracking reads take(CAP+1) without throwing; enableTracking throws TRACKING_CAP_EXCEEDED at >= CAP
- [`convex/lib/mapScanApply.ts:35,61-67`](../../convex/lib/mapScanApply.ts#L35) — lib imports ../mapTrackingOptIn; take(CAP+1) then throws TRACKING_CAP_EXCEEDED (no detail) when > CAP
- [`convex/accountMerge.ts:7,17-36`](../../convex/accountMerge.ts#L7) — moveTrackingRow: take(CAP); duplicate check, then a >= CAP 'dropped' decision without a throw
- [`convex/accountMerge.ts:199-217,236-253`](../../convex/accountMerge.ts#L199-L217) — restoreMapSelections: take(CAP) seeds the slots; restoreTrackingRow returns 'full' at >= CAP
- [`convex/mapAuthoringEvents.ts:28-33`](../../convex/mapAuthoringEvents.ts#L28-L33) — eventActor: unbounded collect() of the caller's tracking rows to find the earliest eligible character
- [`convex/accountMerge.test.ts:6`](../../convex/accountMerge.test.ts#L6) — test imports the constant from ./mapTrackingOptIn
- [`convex/mapTracking.test.ts:6,259-295`](../../convex/mapTracking.test.ts#L6) — test imports the constant from ./mapTrackingOptIn; the at-cap opt-in refusal and toggle-off test

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapTrackingTeardown.ts:28-41`](../../convex/mapTrackingTeardown.ts#L28-L41) — deleteUserTrackingWhere must delete every row on revocation or scope change; bounding it would strand rows past a breach. Keep collect().
- [`convex/mapFixtureTracking.ts:156-166`](../../convex/mapFixtureTracking.ts#L156-L166) — lead, not part of this change: fixture seeding enforces the per-map cap but not the per-user cap, so the invariant that every reader relies on can be broken from the test-only fixture path

</details>

**Home.** `convex/lib/mapTrackingCapacity.ts (TRACKED_CHARACTERS_PER_MAP_USER_CAP, readUserMapTracking)`

**Boundary check.** Everything is in the 'convex' zone (patterns ['convex/**']), so the intra-zone imports are unrestricted by boundaries.rules. The change removes the lib-to-root edge convex/lib/mapScanApply.ts -> convex/mapTrackingOptIn.ts. Consumers convex/mapTrackingOptIn.ts, convex/accountMerge.ts and convex/mapAuthoringEvents.ts (or convex/lib/mapAuthoringEvents.ts after P201) already import from convex/lib. No new file, so modules.setup.ts and codegen are unchanged.

**API sketch.**

```ts
// convex/lib/mapTrackingCapacity.ts
export const TRACKED_CHARACTERS_PER_MAP_USER_CAP = 32;

/**
 * One account's tracking rows on one map, oldest first (by_map_user ends in _creationTime).
 * Writers keep this at or under the cap; the extra row lets a caller detect a breach.
 * Never throws, so opt-out, merge and actor naming keep working past a breach.
 */
export function readUserMapTracking(
  ctx: Pick<QueryCtx, 'db'>, mapId: string, userId: string,
): Promise<Doc<'mapTracking'>[]> {
  return ctx.db.query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP + 1);
}
```

**Migration steps.**

1. Move `export const TRACKED_CHARACTERS_PER_MAP_USER_CAP = 32` from convex/mapTrackingOptIn.ts:8 to convex/lib/mapTrackingCapacity.ts and add readUserMapTracking. Do not leave a re-export in mapTrackingOptIn: update convex/accountMerge.test.ts:6 and convex/mapTracking.test.ts:6 to import from './lib/mapTrackingCapacity', so Fallow sees no duplicate or unused export.
2. convex/mapTrackingOptIn.ts: import the constant from lib and replace 48-53 with `readUserMapTracking(ctx, mapId, principal.userId)`; the bound is unchanged at CAP+1.
3. convex/lib/mapScanApply.ts: drop the ../mapTrackingOptIn import and replace 61-64 with readUserMapTracking. Keep the `> CAP` breach throw at 65-67 so the behaviour is identical. Optionally add the detail string used by mapTrackingOptIn.
4. convex/accountMerge.ts: replace 22-25 and 210-212 with readUserMapTracking. The bound moves from CAP to CAP+1, but the `>= CAP` checks at 30 and 244 give the same decisions. Past a breach, the duplicate check at 26 now sees one more row, which is strictly better.
5. convex/mapAuthoringEvents.ts: replace the collect() at 28-31 with readUserMapTracking. P201 rewrites this function; if P201 lands first, apply this there instead.
6. Leave convex/mapTrackingTeardown.ts:28-41 on collect() and note why in a one-line comment if reviewers ask.

**Tests.** Existing guards: convex/mapTracking.test.ts:259-295 (at-cap opt-in refusal with TRACKING_CAP_EXCEEDED, toggle-off and re-add), convex/accountMerge.test.ts (survivor full means dropped, restore skips when full, at 42/68/95/124/280), convex/mapTrackingScoped.test.ts:110-144 (eventActor picks the earliest tracked eligible character), and convex/mapScan.test.ts:148 (UNTRACKED_SCAN_SYSTEM). Add one mapScan test that seeds CAP+1 tracking rows for the caller directly and asserts applyScan rejects with TRACKING_CAP_EXCEEDED. Nothing guards that breach path today.

**Notes.** Per-site bounds to reconcile: setTracking take(CAP+1) without a throw, mapScanApply take(CAP+1) with a throw past CAP, accountMerge take(CAP) twice without a throw, eventActor collect(). The design keeps every observable decision while the invariant holds. Past a breach, eventActor may name a different character (only if none of the first CAP+1 rows is eligible), which is acceptable for a display name. The by_map_user index ends in _creationTime, so 'earliest tracked' is preserved by any prefix bound. Related bypass outside this scope: readMapTracking (mapTrackingCapacity.ts:8-19), mapJumpReads.ts:41-52 and accountMerge.ts:82-87 hand-write take(N+1)-then-throw instead of indexedQuery.takeIndexedOrThrow.

<sub>Reported by: area:convex, concern:persistence.</sub>

<a id="p201"></a>

## P201: Pass the authorized MapPrincipal into eventActor and share gatedAuthoringEdit across the four authoring entry points

- **Status:** [ ] not started
- **Category:** convex · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -15 / +15 (net neutral; removes one claim read per authoring edit)
- **Depends on:** [P200](#p200), [P199](#p199)
- **Existing primitive:** `convex/lib/mapAccess.ts:requireMapAccess (returns MapPrincipal); convex/mapAuthoringCollapse.ts:gatedAuthoringEdit`

**Problem.** eventActor(ctx, mapId) independently re-derives the caller (getUserIdentity), re-reads the mapAccess claim, and runs an unbounded tracking collect(). Every caller has just run requireMapAccess(ctx, mapId, 'edit'), which read that claim and returned principal.characters. mapAuthoringCollapse.ts has a private gatedAuthoringEdit for that pair, while mapAuthoringTombstone.restoreConnection, mapScan.applyScan and mapScan.signatureSelectionMutation (through lib/mapScanSelection.changeSignatureSelection) each restate it inline. The helpers live in the root module convex/mapAuthoringEvents.ts, which lib/mapScanSelection.ts imports upward.

**Verifier revision.** Confirmed: eventActor re-reads the caller's mapAccess claim by_map_user (mapAuthoringEvents.ts:20-23) right after requireMapAccess read the same row and returned a MapPrincipal with userId and characters (mapAccess.ts:134-146). The requireMapAccess(edit)-then-eventActor pair appears at four entry points but is wrapped only in mapAuthoringCollapse's private gatedAuthoringEdit. Two parts of the framing change. (1) The efficiency gain is small: one indexed point read per authoring edit, plus the eager actor in applyScan that runs even when no rows are missing. The payoff is mainly one authorization-plus-actor primitive with the principal passed explicitly, not performance. (2) The module move removes mapScanSelection's import of ../mapAuthoringEvents but not its import of ../mapAuthoringCollapse, so lib still imports upward once. Passing a plain `actor: string` into changeSignatureSelection keeps the lib function free of auth types and is simpler than passing the principal.

**Sites (10).**

- [`convex/mapAuthoringEvents.ts:8-34`](../../convex/mapAuthoringEvents.ts#L8-L34) — accountName and eventActor: identity read, claim re-read (20-23), unbounded tracking collect (28-31)
- [`convex/mapAuthoringEvents.ts:36-65`](../../convex/mapAuthoringEvents.ts#L36-L65) — writeMapEvent, which moves with eventActor
- [`convex/lib/mapAccess.ts:44-65,128-147`](../../convex/lib/mapAccess.ts#L44-L65) — requireMapAccess reads the same claim and returns { userId, roles, characters: claim.characters ?? null }
- [`convex/mapAuthoringCollapse.ts:18,429-457`](../../convex/mapAuthoringCollapse.ts#L18) — private gatedAuthoringEdit used by severConnection and restoreSeveredBranch
- [`convex/mapAuthoringTombstone.ts:14,185-191`](../../convex/mapAuthoringTombstone.ts#L14) — restoreConnection: requireMapAccess then eventActor inline
- [`convex/mapScan.ts:30,194-230`](../../convex/mapScan.ts#L30) — applyScan: principal at 197; eventActor evaluated eagerly as an argument at 219 even when missingRows is empty
- [`convex/mapScan.ts:253-261`](../../convex/mapScan.ts#L253-L261) — signatureSelectionMutation: requireMapAccess with the principal discarded
- [`convex/lib/mapScanSelection.ts:17,253-275`](../../convex/lib/mapScanSelection.ts#L17) — changeSignatureSelection calls eventActor after its validation reads; lib imports ../mapAuthoringEvents
- [`convex/mapTrackingScoped.test.ts:5,110-144`](../../convex/mapTrackingScoped.test.ts#L5) — unit tests call eventActor(ctx, MAP) directly
- [`convex/mapAuthoringSweep.test.ts:523-531`](../../convex/mapAuthoringSweep.test.ts#L523-L531) — source-text guard: mapAuthoringCollapse.ts must contain 'gatedAuthoringEdit'

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapAuthoringSweep.ts:52-57,132-140`](../../convex/mapAuthoringSweep.ts#L52-L57) — system actor CEILING_SWEEP_ACTOR; no principal, so it uses writeMapEvent only
- [`convex/mapAuthoringTombstone.ts:161-182`](../../convex/mapAuthoringTombstone.ts#L161-L182) — tombstoneSystem, tombstoneConnection and restoreSystem are edit-gated but write no map event, so they need no actor
- [`convex/mapAuthoringFields.ts:55`](../../convex/mapAuthoringFields.ts#L55) — edit gate without a map event
- [`convex/mapAuthoringHome.ts:107`](../../convex/mapAuthoringHome.ts#L107) — edit gate without a map event
- [`convex/mapScan.ts:164,241`](../../convex/mapScan.ts#L164) — edit-gated mutations that write no event

</details>

**Home.** `convex/lib/mapAuthoringEvents.ts (git mv of convex/mapAuthoringEvents.ts; eventActor, writeMapEvent, gatedAuthoringEdit)`

**Boundary check.** The home and every consumer (convex/mapAuthoringCollapse.ts, convex/mapAuthoringTombstone.ts, convex/mapAuthoringSweep.ts, convex/mapScan.ts, convex/lib/mapScanSelection.ts, convex/mapTrackingScoped.test.ts) are in the 'convex' zone, where imports are unrestricted. The new lib module imports '@/data/maps/chain-events' (zone 'data', allowed by `{ from: 'convex', allow: [..., 'data', 'lib'] }`, as today), ./mapAccess and ./mapTrackingCapacity. It must not import ../mapAuthoringCollapse, which would create a cycle with mapAuthoringCollapse importing it. This removes the lib-to-root edge mapScanSelection -> ../mapAuthoringEvents. The edge mapScanSelection -> ../mapAuthoringCollapse remains.

**API sketch.**

```ts
// convex/lib/mapAuthoringEvents.ts
export async function eventActor(
  ctx: MutationCtx, mapId: string, principal: MapPrincipal,
): Promise<string> {
  const characters = principal.characters ?? [];
  const [first] = characters;
  if (first === undefined) return accountName(await ctx.auth.getUserIdentity());
  const eligible = new Map(characters.map((c) => [c.characterId, c.name]));
  const tracked = await readUserMapTracking(ctx, mapId, principal.userId);
  return tracked.map((row) => eligible.get(row.characterId)).find((n) => n !== undefined) ?? first.name;
}

export async function gatedAuthoringEdit<T>(
  ctx: MutationCtx, mapId: string,
  run: (actor: string, principal: MapPrincipal) => Promise<T>,
): Promise<T> {
  const principal = await requireMapAccess(ctx, mapId, 'edit');
  return run(await eventActor(ctx, mapId, principal), principal);
}

export async function writeMapEvent<Kind extends MapEventKind>(...): Promise<void>; // unchanged

// convex/lib/mapScanSelection.ts
export async function changeSignatureSelection(
  ctx: MutationCtx, mapId: string, systemId: number,
  signatureIds: readonly string[], mode: SignatureSelectionMode, actor: string,
)
```

**Migration steps.**

1. Land P200 first so eventActor can use readUserMapTracking. Otherwise inline a take(CAP + 1) and switch it later.
2. git mv convex/mapAuthoringEvents.ts convex/lib/mapAuthoringEvents.ts. In convex/__tests__/modules.setup.ts, replace '../mapAuthoringEvents.ts' with '../lib/mapAuthoringEvents.ts' (modules.test.ts enforces the list) and regenerate convex/_generated (api.d.ts imports every module).
3. Change eventActor to take the principal as sketched, and call getUserIdentity only on the account-name fallback path. Move gatedAuthoringEdit from mapAuthoringCollapse.ts:429-436 into the new module, export it, and pass the principal to `run` as the second argument.
4. Update the imports in mapAuthoringCollapse.ts:18 (now writeMapEvent and gatedAuthoringEdit), mapAuthoringTombstone.ts:14, mapAuthoringSweep.ts:6 and mapScan.ts:30. severConnection and restoreSeveredBranch need no other change.
5. mapAuthoringTombstone.restoreConnection (185-191): `handler: (ctx, { mapId, connectionId }) => gatedAuthoringEdit(ctx, mapId, (actor) => restoreLiveConnection(ctx, mapId, connectionId, actor))`.
6. lib/mapScanSelection.changeSignatureSelection: add an `actor: string` parameter, use it at 272, and drop the eventActor import (keep writeMapEvent from ./mapAuthoringEvents). mapScan.signatureSelectionMutation (253-261): `gatedAuthoringEdit(ctx, mapId, (actor) => changeSignatureSelection(ctx, mapId, systemId, signatureIds, mode, actor))`.
7. mapScan.applyScan (194-230): wrap the body in `gatedAuthoringEdit(ctx, mapId, async (actor, principal) => { await requireTrackedSystem(ctx, mapId, systemId, principal.userId); ... removeConfidentRows(..., actor, now) })`. Alternatively keep requireMapAccess and call `eventActor(ctx, mapId, principal)` only when missingRows.length > 0, which avoids the actor reads on scans with nothing missing.
8. Update convex/mapTrackingScoped.test.ts:110-114 so actorFor runs `const principal = await requireMapAccess(ctx, MAP, 'view'); return eventActor(ctx, MAP, principal);` under asUser, then fix its import path.

**Tests.** Existing end-to-end actor assertions guard the behaviour: convex/mapScan.test.ts:1846-2128 ('Editor Pilot' on signature removal and collapse events) and convex/mapAuthoringCollapse.test.ts:46-91 ('Scout One' on sever and restore events). convex/mapTrackingScoped.test.ts:110-144 covers legacy claims (account name, or 'unknown' without a name), scoped claims (earliest tracked eligible character, else the first eligible) and a creator with characters: []; keep all three cases, now with the principal passed. convex/mapAuthoringSweep.test.ts:523-531 still passes because mapAuthoringCollapse.ts keeps calling gatedAuthoringEdit. Add one restoreConnection test asserting the connection_restored event's actor is the caller's tracked eligible character; today only the collapse paths assert actors.

**Notes.** Equivalence: principal.characters is `claim.characters ?? null`, so `principal.characters ?? []` equals today's `claim?.characters ?? []` for every claim that passed requireMapAccess. The identity === null branch becomes unreachable because requireMapAccess throws UNAUTHENTICATED first; accountName still returns 'unknown' for an identity without a name. Order change: with gatedAuthoringEdit, changeSignatureSelection's actor is resolved before requireLiveSystem and the bounded-id and undo-window validation, not after. That is read-only, and a validation throw still aborts the transaction, so there is no observable difference beyond a couple of extra reads on rejected calls. applyScan already resolves the actor eagerly. Optional follow-up: requireTrackedSystem and eventActor both read the caller's by_map_user tracking rows in applyScan, and eventActor could accept those rows to save a second read. Not required.

<sub>Reported by: area:convex.</sub>

<a id="p202"></a>

## P202: Add findLiveSystem and move requireLiveSystem (with a caller-supplied error) into convex/lib/mapSystemLookup

- **Status:** [ ] not started
- **Category:** convex · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -55 / +25 (four private helpers and eight inline checks removed; two exported helpers added)
- **Depends on:** —
- **Existing primitive:** `convex/lib/mapSystemLookup.ts:findSystem; convex/lib/mapScanState.ts:requireLiveSystem`

**Problem.** Convex has no named primitive for "the live mapSystems row for (mapId, systemId)". Thirteen sites write `findSystem(...)` followed by `=== null || isTombstoned(...)` by hand. Five private throwers each re-implement the existing mapScanState.requireLiveSystem with their own code. mapChainCleanup bypasses findSystem twice with raw by_map_system queries. The liveness rule is simple, but it is spread across 11 files, and the require-live helper lives in a scan-specific module, so the authoring and jump modules never found it.

**Verifier revision.** The core holds up. Thirteen sites call findSystem and then test `=== null || isTombstoned`. Six of them throw a ConvexError and seven return a falsy or empty result. An exported requireLiveSystem already exists in mapScanState, but only the two scan modules use it. mapConnectionLookup.requireLiveConnectionOnMap is the matching primitive for connections and sits next to its finder, so a system version beside findSystem follows existing practice. Three parts of the proposal change. (1) Drop `systemLookupCache`. The two mapChainCleanup loops answer different questions: endpointIsLive (33-52) caches liveness and is cleared after a branch removal, while deleteOrphanedChildren (318-330) caches existence only, so a tombstoned system must still protect its children. Both caches are file-local and have no second consumer, so they should just call findLiveSystem and findSystem instead of the raw by_map_system query. (2) requireLiveSystem should take QueryCtx and return the Doc, as requireLiveConnectionOnMap does. (3) Error codes must pass through unchanged: tests assert UNKNOWN_ORIGIN, ENDPOINT_TOMBSTONED and UNKNOWN_ENDPOINT, and the client string-matches OFF_MAP_SCAN_SYSTEM (src/mapper/signatures/use-scanner-paste.ts:17).

**Sites (15).**

- [`convex/lib/mapSystemLookup.ts:15-24`](../../convex/lib/mapSystemLookup.ts#L15-L24) — findSystem, the existing finder; the new helpers go here
- [`convex/lib/mapScanState.ts:72-82`](../../convex/lib/mapScanState.ts#L72-L82) — exported requireLiveSystem (calls requireSystemId, throws { code: 'UNKNOWN_SYSTEM' } with no detail); used at convex/lib/mapScanApply.ts:584 and convex/lib/mapScanSelection.ts:260
- [`convex/mapAuthoringHome.ts:56-68`](../../convex/mapAuthoringHome.ts#L56-L68) — private requireLiveOrigin: UNKNOWN_ORIGIN with detail; called at 116, after requireSystemId at 108
- [`convex/mapAuthoringTombstone.ts:112-124`](../../convex/mapAuthoringTombstone.ts#L112-L124) — private requireLiveEndpoint: ENDPOINT_TOMBSTONED with detail; called at 133 and 135 with stored connection endpoint ids
- [`convex/mapFixtureHoles.ts:55-66`](../../convex/mapFixtureHoles.ts#L55-L66) — private requireUnresolvedHoleOrigin: UNKNOWN_ENDPOINT with detail; called at 171 after validateUnresolvedHoleInput has checked the id
- [`convex/mapJumpIdentity.ts:62-65`](../../convex/mapJumpIdentity.ts#L62-L65) — inline throw of { code: 'UNKNOWN_ORIGIN' } with no detail
- [`convex/lib/mapScanApply.ts:82-88`](../../convex/lib/mapScanApply.ts#L82-L88) — inline throw of OFF_MAP_SCAN_SYSTEM with detail; requireSystemId already ran at 60; the client matches this code
- [`convex/lib/mapScanElimination.ts:103-106`](../../convex/lib/mapScanElimination.ts#L103-L106) — returns an empty evidence object when the system is not live
- [`convex/lib/mapScanElimination.ts:400-407`](../../convex/lib/mapScanElimination.ts#L400-L407) — marks every deduction 'stale' when the system is not live
- [`convex/lib/mapStaticClaim.ts:223-224`](../../convex/lib/mapStaticClaim.ts#L223-L224) — returns null
- [`convex/mapJumpReads.ts:97-98`](../../convex/mapJumpReads.ts#L97-L98) — returns false
- [`convex/mapJumpEvidence.ts:149-160`](../../convex/mapJumpEvidence.ts#L149-L160) — checks both endpoints and returns connection: null
- [`convex/mapStatics.ts:141-142`](../../convex/mapStatics.ts#L141-L142) — returns { inserted: 0 }
- [`convex/mapChainCleanup.ts:33-52`](../../convex/mapChainCleanup.ts#L33-L52) — endpointIsLive: raw by_map_system query plus a liveness memo; the memo is cleared at 144 after branch_removed
- [`convex/mapChainCleanup.ts:318-330`](../../convex/mapChainCleanup.ts#L318-L330) — deleteOrphanedChildren: raw by_map_system query plus an existence memo (deliberately not liveness)

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapJumpEvidence.ts:97-104`](../../convex/mapJumpEvidence.ts#L97-L104) — Treats a missing origin (falls back to hasAwaitingReturn) differently from a tombstoned one, so it needs the raw findSystem
- [`convex/mapJumpAuthoring.ts:215-224`](../../convex/mapJumpAuthoring.ts#L215-L224) — endpointLapse also separates missing from tombstoned; stays on findSystem
- [`convex/mapAuthoringHome.ts:42-50`](../../convex/mapAuthoringHome.ts#L42-L50) — Throws DESTINATION_TOMBSTONED for a tombstoned row and returns a live one; not a require-live check
- [`convex/mapAuthoringHome.ts:70-84`](../../convex/mapAuthoringHome.ts#L70-L84) — upsertLiveDestination revives a tombstoned system instead of rejecting it
- [`convex/mapFixtureTracking.ts:139-149`](../../convex/mapFixtureTracking.ts#L139-L149) — Inserts when missing and throws FIXTURE_ORIGIN_TOMBSTONED only when tombstoned
- [`convex/mapAuthoringTombstone.ts:19-32`](../../convex/mapAuthoringTombstone.ts#L19-L32) — loadMappedSystem checks existence only; callers branch on the tombstone themselves
- [`convex/mapFixtureSignatures.ts:29-35`](../../convex/mapFixtureSignatures.ts#L29-L35) — Fixture checks existence only (UNKNOWN_SYSTEM)
- [`convex/mapFixturePlace.ts:38-43`](../../convex/mapFixturePlace.ts#L38-L43) — Fixture checks existence only (UNKNOWN_ENDPOINT)
- [`convex/mapAuthoringCollapse.ts:366-374`](../../convex/mapAuthoringCollapse.ts#L366-L374) — Same ENDPOINT_TOMBSTONED code, but checks an in-memory topology snapshot rather than findSystem

</details>

**Home.** `convex/lib/mapSystemLookup.ts (existing module; findSystem, requireSystemId and beginSystemEdit already live there)`

**Boundary check.** Every consumer is in the `convex` zone (convex/**), and imports within a zone are unrestricted. The only new cross-zone import is isTombstoned from '@/data/maps/chain-contract' in mapSystemLookup.ts. The rule `{ from: 'convex', allow: ['platform/esi','platform/auth','data','lib'] }` permits it, and mapScanState.ts:2 already makes the same import. No cycle results: mapSystemLookup imports only ./mapAccess and ./mapEntityContracts, and neither imports mapScanState or the root modules.

**API sketch.**

```ts
export async function findLiveSystem(ctx: QueryCtx, mapId: string, systemId: number): Promise<Doc<'mapSystems'> | null> // null if missing or tombstoned

type LiveSystemError = { readonly code: string; readonly detail?: string };
export async function requireLiveSystem(ctx: QueryCtx, mapId: string, systemId: number, error: LiveSystemError = { code: 'UNKNOWN_SYSTEM' }): Promise<Doc<'mapSystems'>> {
  requireSystemId(systemId);
  const system = await findLiveSystem(ctx, mapId, systemId);
  if (system === null) throw new ConvexError(error); // pass the caller's object through untouched
  return system;
}
```

**Migration steps.**

1. Add findLiveSystem and requireLiveSystem (signatures above) to convex/lib/mapSystemLookup.ts, importing isTombstoned from '@/data/maps/chain-contract' and Doc from '../_generated/dataModel'.
2. Delete requireLiveSystem from convex/lib/mapScanState.ts (72-82). In that file, remove findSystem and requireSystemId from the ./mapSystemLookup import if nothing else uses them; keep isTombstoned, which line 162 still uses. Repoint the imports in convex/lib/mapScanApply.ts:41 and convex/lib/mapScanSelection.ts:28 to './mapSystemLookup'. Both callers keep the default UNKNOWN_SYSTEM.
3. Replace the throwers, keeping each code and detail string exactly as written today: mapAuthoringHome.ts requireLiveOrigin becomes `requireLiveSystem(ctx, mapId, fromSystemId, { code: 'UNKNOWN_ORIGIN', detail: ... })`, and the private function is deleted. mapAuthoringTombstone.ts requireLiveEndpoint becomes ENDPOINT_TOMBSTONED (delete the private function and inline both calls at 133 and 135). mapFixtureHoles.ts requireUnresolvedHoleOrigin becomes UNKNOWN_ENDPOINT (delete). mapJumpIdentity.ts:62-65 becomes `{ code: 'UNKNOWN_ORIGIN' }` with no detail. mapScanApply.ts:82-88 becomes OFF_MAP_SCAN_SYSTEM with detail.
4. Replace the non-throwing forms with `(await findLiveSystem(...)) === null`: mapScanElimination.ts 103-106 and 400-407 (keep the requireSystemId calls already at 102 and 398), mapStaticClaim.ts 223-224, mapJumpReads.ts 97-98, mapStatics.ts 141-142, and mapJumpEvidence.ts 149-160 (Promise.all of two findLiveSystem calls, then `fromSystem === null || toSystem === null`).
5. mapChainCleanup.ts: inside endpointIsLive, replace the raw query (43-49) with `const live = (await findLiveSystem(ctx, mapId, systemId)) !== null`. Inside deleteOrphanedChildren, replace 324-328 with `exists = (await findSystem(ctx, row.mapId, row.systemId)) !== null`. Keep both local Maps and the `state.liveness.clear()` at 144. Do not add a cache primitive.
6. Remove isTombstoned imports that are now unused (most of these files still use it for connection rows). Then run `pnpm check` through test-runner; Fallow will flag any leftover unused export or import.

**Tests.** Add convex/lib/mapSystemLookup.test.ts (convex-test, with the module already listed in convex/__tests__/modules.setup.ts:69) covering: findLiveSystem returns null for a missing row, null for a tombstoned row (deletedAt set), and the doc for a live row; requireLiveSystem throws the default { code: 'UNKNOWN_SYSTEM' }, passes a custom { code, detail } through unchanged, and adds no `detail` key when none is given. Existing guards: convex/mapAuthoringHome.test.ts:204-213 (UNKNOWN_ORIGIN), convex/mapAuthoringTombstone.test.ts:152 and convex/mapAuthoringCollapse.test.ts:356 (ENDPOINT_TOMBSTONED), convex/mapFixtures.test.ts:902 (UNKNOWN_ENDPOINT), convex/lib/mapChainCleanup.test.ts (purge liveness and orphan backfill), mapJump*.test.ts, mapStatics.test.ts, lib/mapStaticClaim.test.ts, mapScan*.test.ts. Coverage gaps: no test pins OFF_MAP_SCAN_SYSTEM (which the client string-matches) or mapJumpIdentity's UNKNOWN_ORIGIN, so add a mapScan.test.ts case pasting into a tracked but tombstoned system.

**Notes.** No drift bug. Every site applies the same rule (missing or tombstoned means not live). The codes are inconsistent: mapFixtureHoles uses UNKNOWN_ENDPOINT for an origin, and mapJumpIdentity's UNKNOWN_ORIGIN has no detail while mapAuthoringHome's has one. They are client- and test-visible, so preserve them exactly; renaming is a separate decision. Adding requireSystemId inside the shared requireLiveSystem changes nothing for any caller, because each already validated the id (mapAuthoringHome:108, mapScanApply:60, validateUnresolvedHoleInput in mapEntityContracts.ts:296) or uses an id read from a stored row (mapAuthoringTombstone, mapJumpIdentity). Pass the error object to ConvexError as given; building `{ code, detail: undefined }` would change the payload shape. mapChainCleanup's second loop must stay existence-only: a tombstoned system's signatures are still restorable within its undo window.

<sub>Reported by: area:convex, dupes-triage-1.</sub>

<a id="p203"></a>

## P203: Give the jump stamp and the projection watermark named finders, with a forward-only stamp upsert

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -55 / +25
- **Depends on:** —

**Problem.** Five sites open-code the mapJumpBookkeeping by_map_character unique lookup. Two sites upsert lastProcessedTransitionAt under different rules: accountMerge.restoreTransitionStamp only moves the stamp forward, while mapJumpAuthoring.stampTransition patches unconditionally and depends on an earlier converged check in its caller. The mapAccessProjectionWatermarks by_map unique read is written 4 times. These are one concept per table with no named owner.

**Verifier revision.** The duplication is real but small. The by_map_character stamp lookup appears 5 times in 4 files. The stamp upsert is written twice with different rules. The projection-watermark by_map read appears 4 times. Forward-only is safe for mapJumpAuthoring: resolveJumpAuthoring returns 'converged' at 441-447 whenever stamp >= transitionObservedAt, then passes that same stamp row into stampTransition at 479-485, so within one transaction the patch only ever moves the stamp forward. Two design changes. (1) No new convex/lib/jumpBookkeeping.ts and no move of deleteForMapCharacter: convex/mapJumpBookkeeping.ts already owns the table, already exports a helper imported by a root module (mapTrackingTeardown.ts:4), and imports nothing but _generated/server, so new helpers there cannot create a cycle and modules.setup.ts needs no edit. (2) The payoff is low; the finding survives only as a cleanup that names the 'stamp only advances' rule, which accountMerge relies on and no test pins.

**Sites (11).**

- [`convex/mapJumpBookkeeping.ts:6-20`](../../convex/mapJumpBookkeeping.ts#L6-L20) — deleteForMapCharacter performs the lookup inline
- [`convex/mapJumpEvidence.ts:69-75`](../../convex/mapJumpEvidence.ts#L69-L75) — stamp lookup, then `?.lastProcessedTransitionAt ?? null`
- [`convex/mapJumpAuthoring.ts:192-202`](../../convex/mapJumpAuthoring.ts#L192-L202) — private readTransitionStamp, the same lookup
- [`convex/mapJumpAuthoring.ts:132-150`](../../convex/mapJumpAuthoring.ts#L132-L150) — stampTransition: unconditional insert-or-patch
- [`convex/mapJumpAuthoring.ts:441-447,479-485`](../../convex/mapJumpAuthoring.ts#L441-L447) — converged early return when stamp >= transition, then stampTransition with the same stamp row
- [`convex/accountMerge.ts:88-94`](../../convex/accountMerge.ts#L88-L94) — snapshotMergeTracking per-row stamp lookup
- [`convex/accountMerge.ts:255-266`](../../convex/accountMerge.ts#L255-L266) — restoreTransitionStamp: forward-only insert-or-patch
- [`convex/lib/mapAccess.ts:22-24`](../../convex/lib/mapAccess.ts#L22-L24) — watermark read inside requireMapTrackingOpen
- [`convex/mapAccessProjection.ts:234-249`](../../convex/mapAccessProjection.ts#L234-L249) — reconcileMapClaims reads the watermark, then inserts or patches revision, characterScoped and scopingPending
- [`convex/mapAccessProjection.ts:291-299`](../../convex/mapAccessProjection.ts#L291-L299) — purgeUserMapClaims reads the watermark, then inserts or advances revision only
- [`convex/mapAccessProjection.ts:346-353`](../../convex/mapAccessProjection.ts#L346-L353) — freezeMapTrackingForScoping reads the watermark, then inserts or sets scopingPending

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/characterLocationPurge.ts:57-64`](../../convex/characterLocationPurge.ts#L57-L64) — Uses the by_character index across all maps, with deleteBookkeepingIfUntracked; a different lookup
- [`convex/mapJumpBookkeeping.ts:22-38`](../../convex/mapJumpBookkeeping.ts#L22-L38) — purgeForMap does a by_map batch drain; a different lookup
- [`convex/mapAccessProjection.ts:234-249,291-299,346-353`](../../convex/mapAccessProjection.ts#L234-L249) — The three watermark writes patch different fields under different conditions; share only the read, not the upsert

</details>

**Home.** `convex/mapJumpBookkeeping.ts (existing table owner) for the stamp helpers; convex/lib/mapAccess.ts (existing) for findProjectionWatermark`

**Boundary check.** Every file involved is in the `convex` zone (convex/**), and imports within a zone are unrestricted, so no .fallowrc.json cross-zone rule applies. Cycle check: mapJumpBookkeeping.ts imports only ./_generated/server, and lib/mapAccess.ts imports only @/data/maps/access-contract (data, allowed by `{ from: 'convex', allow: [..., 'data', 'lib'] }`) and ./mapEntityContracts. Neither imports accountMerge, mapJumpAuthoring, mapJumpEvidence or mapAccessProjection, so the new imports cannot create a cycle.

**API sketch.**

```ts
// convex/mapJumpBookkeeping.ts
export function findJumpStamp(ctx: Pick<QueryCtx, 'db'>, mapId: string, characterId: number): Promise<Doc<'mapJumpBookkeeping'> | null>;
/** Inserts, or patches only when `at` is newer; never moves the stamp backward. */
export async function advanceJumpStamp(ctx: MutationCtx, mapId: string, characterId: number, at: number, existing?: Doc<'mapJumpBookkeeping'> | null): Promise<void>; // existing === undefined -> look it up

// convex/lib/mapAccess.ts
export function findProjectionWatermark(ctx: Pick<QueryCtx, 'db'>, mapId: string): Promise<Doc<'mapAccessProjectionWatermarks'> | null>;
```

**Migration steps.**

1. In convex/mapJumpBookkeeping.ts, add findJumpStamp and advanceJumpStamp, and rewrite deleteForMapCharacter (6-20) to use findJumpStamp.
2. convex/mapJumpAuthoring.ts: delete readTransitionStamp (192-202) and stampTransition (132-150). At 441 call `findJumpStamp(ctx, args.mapId, args.characterId)`. Keep the converged early return at 442-447 unchanged. At 479 call `advanceJumpStamp(ctx, args.mapId, args.characterId, args.transitionObservedAt, stamp)`.
3. convex/mapJumpEvidence.ts:69-74: replace with `findJumpStamp(ctx, mapId, characterId)`.
4. convex/accountMerge.ts: at 89-91 use findJumpStamp, delete restoreTransitionStamp (255-266), and at 230 call `advanceJumpStamp(ctx, mapId, characterId, lastProcessedTransitionAt)`.
5. In convex/lib/mapAccess.ts, add findProjectionWatermark and use it in requireMapTrackingOpen (22-24). In convex/mapAccessProjection.ts, replace the three reads at 234-237, 291-294 and 346-347 with it, leaving each insert or patch branch exactly as it is.
6. Run `pnpm check` through test-runner.

**Tests.** Existing guards: convex/mapJump.test.ts:210-250 (concurrent and repeated resolve yields 'converged'/'processed', and the stamp equals OBSERVED_AT); convex/accountMerge.test.ts:247-273 (the snapshot carries the stamp and restore advances it to processedAt + 10) and 343-372 (restore during scoping leaves stamp 10, and after reconcile it becomes 20); convex/httpAccountMerge.test.ts:107-116; convex/mapTrackingScoped.test.ts and convex/mapAccessProjection.test.ts for the watermark. Add: an accountMerge.test.ts case where restoreMergeTracking carries an older lastProcessedTransitionAt than the stored stamp and the stamp stays unchanged (forward-only is not pinned today), and a mapJump.test.ts case where a stale transition older than the stamp returns converged without writing.

**Notes.** accountMerge.restoreTransitionStamp is the correct rule (forward-only). mapJumpAuthoring's unconditional patch is correct only because of the converged check at 442-447, so keep that check: it also short-circuits all topology work, not just the write. Passing `existing` into advanceJumpStamp avoids a second read in resolveJumpAuthoring. The mapChainCleanup findSystem bypass that F430 raised is covered by P202.

<sub>Reported by: area:convex, concern:persistence.</sub>

<a id="p204"></a>

## P204: Move clampPageSize and deniedPage into convex/lib with an explicit max, and drop mapScan's private copies

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -12 / +3 (plus one-line edits in two tests and modules.setup.ts)
- **Depends on:** —
- **Existing primitive:** `convex/mapChainPage.ts:clampPageSize, deniedPage`

**Problem.** convex/mapScan.ts privately re-implements the Convex paging helpers in convex/mapChainPage.ts. deniedPage is byte-identical, and boundedPageOptions is clampPageSize with a different (equal) bound, because clampPageSize hard-wires MAP_CHAIN_MAX_PAGE_SIZE. The shared helpers sit in a helper-only root module whose name ties them to the chain, so the scan readers never imported them.

**Verifier revision.** The private copies are real. mapScan.ts:120-122 deniedPage is identical to mapChainPage.ts:12-14, and mapScan.ts:124-129 boundedPageOptions is clampPageSize with MAP_SIGNATURE_PAGE_SIZE in place of MAP_CHAIN_MAX_PAGE_SIZE (both 100). No other module repeats either helper (grep for `continueCursor: ''` and `Math.min(...numItems`). Drop the proposed viewableMapPage gate. It is two lines (tryMapAccess, then deniedPage), mapChainConnections needs a per-mode branch and overload casts, mapScan's callers post-process the page, and convex/mapChain.test.ts:586-617 has source-text security pins that require each chain reader module to call tryMapAccess before ctx.db.query and to contain deniedPage. Centralizing the gate would mean rewriting those pins for little saving.

**Sites (7).**

- [`convex/mapChainPage.ts:1-14`](../../convex/mapChainPage.ts#L1-L14) — MAP_CHAIN_MAX_PAGE_SIZE = 100, clampPageSize (hard-wired to that max), deniedPage
- [`convex/mapScan.ts:120-129`](../../convex/mapScan.ts#L120-L129) — private deniedPage (identical) and boundedPageOptions (Math.max(1, Math.min(n, MAP_SIGNATURE_PAGE_SIZE)))
- [`convex/mapScan.ts:275-284`](../../convex/mapScan.ts#L275-L284) — viewableSignaturePage calls boundedPageOptions
- [`convex/mapScan.ts:296,323`](../../convex/mapScan.ts#L296) — deniedPage call sites
- [`convex/lib/mapScanState.ts:21`](../../convex/lib/mapScanState.ts#L21) — MAP_SIGNATURE_PAGE_SIZE = 100, re-exported from mapScan.ts:62-66
- [`convex/mapChainSystems.ts:10-23`](../../convex/mapChainSystems.ts#L10-L23) — imports clampPageSize and deniedPage from ./mapChainPage
- [`convex/mapChainConnections.ts:10,33-39`](../../convex/mapChainConnections.ts#L10) — imports clampPageSize and deniedPage from ./mapChainPage

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapChainSystems.ts:17-18`](../../convex/mapChainSystems.ts#L17-L18) — Access gate left inline; mapChain.test.ts:586-617 pins tryMapAccess-before-query and deniedPage per module
- [`convex/mapChainConnections.ts:34-37`](../../convex/mapChainConnections.ts#L34-L37) — Access gate left inline for the same reason; mode branching and overload casts would not fit a generic run callback cleanly
- [`convex/mapStatics.ts:118-122`](../../convex/mapStatics.ts#L118-L122) — Internal backfill paginate with no client page size; no clamp needed
- [`convex/mapFixtures.ts:31-37`](../../convex/mapFixtures.ts#L31-L37) — Internal fixture reads; no clamp or denial needed

</details>

**Home.** `convex/lib/pagination.ts (moved from convex/mapChainPage.ts, which registers no Convex functions, so no api path changes)`

**Boundary check.** All consumers (convex/mapScan.ts, convex/mapChainSystems.ts, convex/mapChainConnections.ts and their tests) and the new home are in the `convex` zone (convex/**). Imports within a zone are unrestricted, and the only external import is the `convex/server` type PaginationResult (an npm package, not a zone). No cycle: the module imports nothing local.

**API sketch.**

```ts
// convex/lib/pagination.ts
export const MAP_CHAIN_MAX_PAGE_SIZE = 100;
export function clampPageSize<T extends { numItems: number }>(paginationOpts: T, max: number): T; // numItems clamped to [1, max]
export function deniedPage<Row>(): PaginationResult<Row>; // { page: [], isDone: true, continueCursor: '' }
```

**Migration steps.**

1. Create convex/lib/pagination.ts with the contents of convex/mapChainPage.ts, giving clampPageSize a required `max` parameter. Delete convex/mapChainPage.ts.
2. Update the convex/__tests__/modules.setup.ts glob list: remove '../mapChainPage.ts' (line 32) and add '../lib/pagination.ts' to the lib block.
3. convex/mapChainSystems.ts:10,22 and convex/mapChainConnections.ts:10,39: import from './lib/pagination' and call `clampPageSize(paginationOpts, MAP_CHAIN_MAX_PAGE_SIZE)`.
4. convex/mapScan.ts: delete the private deniedPage and boundedPageOptions (120-129), import clampPageSize and deniedPage from './lib/pagination', and at 283 call `clampPageSize(paginationOpts, MAP_SIGNATURE_PAGE_SIZE)`. Import MAP_SIGNATURE_PAGE_SIZE from './lib/mapScanState' alongside the existing re-export at 62-66. Drop the PaginationResult type import if it becomes unused (viewableSignaturePage still uses it).
5. convex/mapChain.test.ts:10: import MAP_CHAIN_MAX_PAGE_SIZE from './lib/pagination'.
6. convex/mapScanSubscriptions.test.ts:192: update the source-text regex from `boundedPageOptions\(paginationOpts\)` to `clampPageSize\(paginationOpts, MAP_SIGNATURE_PAGE_SIZE\)`.
7. Run `pnpm check` through test-runner.

**Tests.** Existing guards: convex/mapChain.test.ts:345-357 (the page clamps to MAP_CHAIN_MAX_PAGE_SIZE) and 586-617 (source pins, still satisfied because the gate stays inline and deniedPage is still named); convex/mapScanSubscriptions.test.ts:55-56 and 85 (pages of MAP_SIGNATURE_PAGE_SIZE), 183-186 (exact denied-page shape), and 189-195 (source pin, needs the regex update). Optionally add a small unit test for clampPageSize covering numItems 0, -5, max + 1 and an in-range value, since both copies relied on Math.max(1, ...).

**Notes.** The two copies behave identically: same [1, max] clamp and same denied shape. boundedPageOptions was typed PaginationOptions -> PaginationOptions, while clampPageSize is generic over T, so it is a drop-in. Keep MAP_SIGNATURE_PAGE_SIZE and MAP_CHAIN_MAX_PAGE_SIZE as separate named bounds even though both are 100; they bound different subscriptions. A required `max` keeps each bound explicit at the call site. Moving the file is optional: the minimum fix is adding the `max` parameter and having mapScan import from ./mapChainPage, but a chain-named module serving signature pages reads wrong, and convex/lib is where helper-only modules live.

<sub>Reported by: area:convex, concern:generic-utils, concern:persistence.</sub>

<a id="p205"></a>

## P205: Fold the location-sync lifecycle steps into locationSchedule and subjects helpers

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -30 / +20
- **Depends on:** —
- **Existing primitive:** `convex/lib/locationSchedule.ts:stopSync, runState; @/lib/sync-engine:isColdFromPresence`

**Problem.** Three lifecycle steps of location sync are written out separately in the engine modules, which are churn hotspots (engineComplete 21.4, engine 16.9, engineSweep 14.9 in health-targets). Retiring a user's sync (stop the run if a state exists, otherwise just clear coverage) is written at all 3 stopSync call sites. The scheduled-job liveness test is duplicated between runState and ensurePresenceExpiry. The location presence lookup and cold check are repeated with the dataset literal and cold window passed in at every site.

**Verifier revision.** All three repeated steps are real. (1) Every stopSync caller (engineLeave.ts:28-33, engine.ts:207-209, engineSweep.ts:90-101) runs getLocationSync, then stopSync when a state exists or clearCoverageForUser when it does not, so the lookup and fallback belong inside the helper. (2) runState (locationSchedule.ts:50-59) and ensurePresenceExpiry (engine.ts:177-180) apply the same 'scheduled function still pending or inProgress' rule to a job id. (3) The cold-watcher check (getPresence('characterLocation') plus isColdFromPresence with LOCATION_COLD_AFTER_MS) is repeated three times, and every one of the 7 getPresence callers passes the literal 'characterLocation'. The design shrinks: instead of three new names next to the old ones, fold the lookup into stopSync's replacement (stopSync then has no external caller), change runState to take a job id rather than adding scheduledJobState, and replace getPresence with a dataset-fixed getLocationPresence plus isLocationWatcherCold in the existing presence module.

**Sites (12).**

- [`convex/engineLeave.ts:28-33`](../../convex/engineLeave.ts#L28-L33) — getLocationSync, then stopSync or clearCoverageForUser
- [`convex/engine.ts:205-209`](../../convex/engine.ts#L205-L209) — expirePresence: the same retire step
- [`convex/engineSweep.ts:90-101`](../../convex/engineSweep.ts#L90-L101) — sweepAbandoned: the same step, plus deleting the locationSync row and counting it
- [`convex/lib/locationSchedule.ts:96-104`](../../convex/lib/locationSchedule.ts#L96-L104) — stopSync: cancelPending, bump runId, clear jobId, clearCoverageForUser; only the three sites above call it
- [`convex/lib/locationSchedule.ts:50-59`](../../convex/lib/locationSchedule.ts#L50-L59) — runState(db, state): reads _scheduled_functions; pending or inProgress counts as live
- [`convex/engine.ts:173-183`](../../convex/engine.ts#L173-L183) — ensurePresenceExpiry repeats the same job-kind check inline for presence.expiryJobId
- [`convex/engineComplete.ts:15-16`](../../convex/engineComplete.ts#L15-L16) — getPresence('characterLocation') + isColdFromPresence(LOCATION_COLD_AFTER_MS)
- [`convex/engineSweep.ts:52-57`](../../convex/engineSweep.ts#L52-L57) — the same cold check, using Date.now()
- [`convex/characterLocationApply.ts:88-89`](../../convex/characterLocationApply.ts#L88-L89) — the same cold check in finishSync
- [`convex/lib/subjects.ts:5-11`](../../convex/lib/subjects.ts#L5-L11) — getPresence is a pass-through to uniqueByUserDataset
- [`convex/engine.ts:47`](../../convex/engine.ts#L47) — getPresence(ctx.db, 'characterLocation', userId) in heartbeat
- [`convex/engineLeave.ts:15`](../../convex/engineLeave.ts#L15) — getPresence(ctx.db, 'characterLocation', userId)

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/characterLocationApply.ts:90-94`](../../convex/characterLocationApply.ts#L90-L94) — finishSync's cold branch only patches jobId: null and clears coverage. It is the running job itself, so it must not cancel or bump runId; keep it off retireLocationSync (its cold check at 88-89 does migrate)
- [`convex/engineComplete.ts:19-30`](../../convex/engineComplete.ts#L19-L30) — handOffLocationSync reads the job row's args to identify a legacy generation; not a liveness check
- [`convex/mapFixtureTracking.ts:104`](../../convex/mapFixtureTracking.ts#L104) — Fixture-only clearCoverageForUser; no sync state is involved

</details>

**Home.** `convex/lib/locationSchedule.ts (retireLocationSync; runState takes a job id) and convex/lib/subjects.ts (getLocationPresence, isLocationWatcherCold)`

**Boundary check.** All consumers (engine.ts, engineLeave.ts, engineSweep.ts, engineComplete.ts, characterLocationApply.ts) and both homes are in the `convex` zone, and imports within a zone are unrestricted. The one cross-zone import, subjects.ts importing isColdFromPresence and LOCATION_COLD_AFTER_MS from '@/lib/sync-engine' (zone `lib`), is permitted by `{ from: 'convex', allow: ['platform/esi','platform/auth','data','lib'] }`, and engine*.ts already import it today. No cycle: locationSchedule imports ./locationCoverage and _generated, and subjects imports ./indexedQuery.

**API sketch.**

```ts
// convex/lib/locationSchedule.ts
export async function runState(db: DatabaseReader, jobId: Id<'_scheduled_functions'> | null | undefined): Promise<RunState>; // was (db, state)
/** Stops the user's sync if they have state, otherwise clears coverage; returns the state that was stopped. */
export async function retireLocationSync(ctx: MutationCtx, userId: string, now: number): Promise<LocationSyncState | null>;
// stopSync stays as a non-exported internal used by retireLocationSync

// convex/lib/subjects.ts
export function getLocationPresence(db: DatabaseReader, userId: string): Promise<Doc<'syncPresence'> | null>;
export async function isLocationWatcherCold(db: DatabaseReader, userId: string, now: number): Promise<boolean>;
```

**Migration steps.**

1. convex/lib/subjects.ts: replace getPresence with getLocationPresence(db, userId), which calls uniqueByUserDataset(db, 'characterLocation', userId), and add isLocationWatcherCold(db, userId, now), which returns isColdFromPresence(await getLocationPresence(db, userId), LOCATION_COLD_AFTER_MS, now). Drop the StoredDataset import.
2. Point the four doc-using callers at getLocationPresence: engine.ts:47, engine.ts:174, engineLeave.ts:15 (and any other remaining getPresence call).
3. Replace the three cold checks with isLocationWatcherCold: engineComplete.ts:15-16 (`if (await isLocationWatcherCold(ctx.db, userId, now)) return;`), engineSweep.ts:52-53 (pass Date.now() as today), and characterLocationApply.ts:88-89 (`const cold = await isLocationWatcherCold(ctx.db, args.userId, now);`). Drop the now-unused isColdFromPresence and LOCATION_COLD_AFTER_MS imports.
4. convex/lib/locationSchedule.ts: change runState to take a job id (`if (jobId == null) return 'none'`, then the same system.get and kind test). Update its callers: cancelPending:67 (`runState(ctx.db, state.jobId)`), engine.ts:91, engineComplete.ts:19, and engine.ts:177-180, which becomes `if (await runState(ctx.db, presence.expiryJobId) !== 'none') return;`.
5. convex/lib/locationSchedule.ts: add retireLocationSync(ctx, userId, now): `const state = await getLocationSync(ctx.db, userId); if (state !== null) await stopSync(ctx, state, now); else await clearCoverageForUser(ctx, userId); return state;`. Remove `export` from stopSync.
6. Replace the callers: engineLeave.ts:28-33 becomes `await retireLocationSync(ctx, userId, now)`. engine.ts:207-209 becomes `await retireLocationSync(ctx, presence.userId, now)`. engineSweep.ts:90-101 becomes `if (presence.dataset === 'characterLocation') { const state = await retireLocationSync(ctx, presence.userId, now); if (state !== null) { await ctx.db.delete('locationSync', state._id); deleted += 1; } }`. Remove the now-unused getLocationSync, stopSync and clearCoverageForUser imports from those files.
7. Run `pnpm check` through test-runner. Fallow confirms stopSync and getPresence have no stray importers.

**Tests.** Existing guards in convex/engine.test.ts: 604-760 'engine.leave' (retires a matching tab, cancels the pending run, clears coverage for a user with no sync state, drops a late finish), 767-860 (hand-off for warm users; nothing for cold or absent watchers), 1028 (finishSync stops when cold, jobId null, coverage cleared), 1095-1160 'engine.sweep' (retention, retired-dataset drain), 1332-1400 (presence expiry after a dead action; one liveness check per presence), and the runState terminal-state cases near line 139. convex/characterLocationApply.test.ts covers finishSync. Add: an engine.test.ts sweep case where an abandoned characterLocation presence has no locationSync row, so coverage is cleared and `deleted` does not count it, and a case where ensurePresenceExpiry re-arms after the prior expiry job finished (runState(jobId) reads 'none').

**Notes.** Preserve these behaviors: (a) sweepAbandoned's `deleted` counts only locationSync rows deleted, not presence rows; keep that quirk. (b) sweepAbandoned retires only presences whose dataset is 'characterLocation'; retired-dataset presences are just deleted. (c) In sweepAbandoned, stopSync patches the locationSync row right before it is deleted; the wasted write is harmless and keeping it keeps one code path. (d) finishSync must not route through retireLocationSync: it is the in-flight job, so cancelling or bumping runId there would differ from today. (e) runState's job-id form must treat undefined (presence.expiryJobId) and null (locationSync.jobId) the same way. (f) engineSweep.sweepRetiredRows evaluates Date.now() per row; passing Date.now() keeps that.

<sub>Reported by: area:convex.</sub>

<a id="p289"></a>

## P289: Route tombstone incident reads through readTouchingConnections, parallelize independent bounded reads, and let static claims take an id

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30 / +8
- **Depends on:** —
- **Existing primitive:** `convex/lib/mapConnectionLookup.ts:readTouchingConnections (already uses Promise.all)`

**Problem.** Three Convex mutation helpers run independent bounded reads in sequence, and one of them re-implements the shared readTouchingConnections primitive. Separately, the static-claim entry points take a Doc but immediately re-read it by id. Three callers therefore patch a connection, ctx.db.get it, null-check it (a check that cannot fail), and pass it in, only for runClaim to read it again.

**Verifier revision.** The bundle mixes a few real items with several that are not.

Real:
- readIncidentConnections (mapAuthoringTombstone.ts:35-58) re-implements readTouchingConnections, a shared primitive that already accepts limit, errorCode and errorDetail, and runs its two reads in sequence. This is a bypass of an existing primitive.
- readBoundedMapTopology and readPairRows await independent bounded reads one after another. Promise.all is the repo convention (readTouchingConnections, readScanState, answerAwaitingSignature), and it changes no error behavior: collapse checks both bounds only after both reads finish, and readPairRows' two reads throw the same code and detail.
- runClaim always re-reads the claimant (mapStaticClaim.ts:176) and uses only row._id from its argument. That makes the post-patch ctx.db.get in three callers redundant, including the null guards that cannot fire. The finders cited one caller; there are three.

Not real:
- rowMaps rebuilt per row: at most 256 rows times at most 256 signatures (MAP_SCAN_ROW_LIMIT) is about 65k Map sets, dwarfed by each row's database writes. State arrays are never mutated, so this is cosmetic.
- readTrackedLocation: the loop is over mapTracking rows for one (map, character), effectively one row.
- rebindAwaitingCandidates: its second readOriginConnections must observe the merge's own writes. mergeSigIntoPlaceholder deletes the claimant and patches the placeholder, so reusing pre-merge rows changes semantics and could patch a deleted doc.
- characterLocationPurge: a rare internal purge whose reads precede sequential deletes, so read latency does not matter.
- answerAwaitingSignature sharing readPairRows: the predicates differ (see excludedSites).

**Sites (9).**

- [`convex/mapAuthoringTombstone.ts:35-58`](../../convex/mapAuthoringTombstone.ts#L35-L58) — readIncidentConnections hand-rolls two takeIndexedOrThrow reads on by_map_from and by_map_to (LIVE_CONNECTION_SCAN_CAP=32, MAP_TOO_LARGE) in sequence, then dedupes by _id.
- [`convex/lib/mapConnectionLookup.ts:14-36,72-83`](../../convex/lib/mapConnectionLookup.ts#L14-L36) — The existing primitive: readTouchingConnections(ctx, mapId, systemId, { limit, errorCode, errorDetail }) runs both index reads with Promise.all and the same take(limit+1)-then-throw bound.
- [`convex/mapAuthoringCollapse.ts:27-50`](../../convex/mapAuthoringCollapse.ts#L27-L50) — Systems and connections take(129) in sequence. The bound check runs only after both.
- [`convex/mapJumpAuthoring.ts:91-113`](../../convex/mapJumpAuthoring.ts#L91-L113) — readPairRows awaits the forward and reverse readConnectionsFrom calls in sequence. Both throw an identical MAP_TOO_LARGE with the same detail.
- [`convex/lib/mapStaticClaim.ts:168-216`](../../convex/lib/mapStaticClaim.ts#L168-L216) — runClaim uses only row._id for side 'to' and re-reads the claimant with ctx.db.get(row._id) at line 176. claimStaticPlaceholder and claimStaticOrKeepId are thin wrappers.
- [`convex/mapAuthoringFields.ts:179-194`](../../convex/mapAuthoringFields.ts#L179-L194) — Pre-patch claim passes connection (line 180). Post-patch: ctx.db.get, a null guard, then the claim (191-194).
- [`convex/lib/mapScanApply.ts:501-522`](../../convex/lib/mapScanApply.ts#L501-L522) — The same pattern: claimStaticOrKeepId(connection) at 513, then patch, ctx.db.get and an unreachable 'typed === null' return at 515-522.
- [`convex/lib/mapScanElimination.ts:182,191-197`](../../convex/lib/mapScanElimination.ts#L182) — The same pattern: pre-patch claim at 182, then patch, ctx.db.get, a null guard and the claim at 191-197.
- [`convex/characterLocationReads.ts:38-53`](../../convex/characterLocationReads.ts#L38-L53) — Optional: the outer loop over trackedIds is sequential while each iteration's three reads are already parallel. This internalQuery runs on the location-sync path.

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapJumpIdentity.ts:66-76`](../../convex/mapJumpIdentity.ts#L66-L76) — Already uses Promise.all. Its predicate differs from readPairRows: it counts only live rows that directly connect the two systems by toSystemId, while readPairRows also admits awaiting-signature rows whose destination is the other system, including the source row itself. Sharing would need a re-filter and save nothing.
- [`convex/lib/mapScanApply.ts:146,395`](../../convex/lib/mapScanApply.ts#L146) — rowMaps(state.signatures) per row is bounded at 256×256 and dwarfed by the per-row writes. Called from convex/mapScan.ts:208-211.
- [`convex/lib/mapStaticClaim.ts:146-166`](../../convex/lib/mapStaticClaim.ts#L146-L166) — The second readOriginConnections runs after mergeSigIntoPlaceholder deletes the claimant and patches the placeholder. It must see those writes, so reusing the earlier rows is unsafe.
- [`convex/mapJumpReads.ts:36-65`](../../convex/mapJumpReads.ts#L36-L65) — Loops over the mapTracking rows for one (map, character), effectively one row. Not a real fan-out.
- [`convex/characterLocationPurge.ts:5-42`](../../convex/characterLocationPurge.ts#L5-L42) — A rare internal purge with sequential deletes after the reads; read concurrency is irrelevant. The fivefold-repeated by_user_character closure is a simplification lead, not an efficiency issue.

</details>

**Home.** `convex/lib/mapConnectionLookup.ts:readTouchingConnections (existing) for the tombstone reads; convex/lib/mapStaticClaim.ts for the id-taking claim signature; the Promise.all changes stay in place in their own files`

**Boundary check.** Every file is in the convex zone (convex/**). The convex rule allows platform/esi, platform/auth, data and lib, and every import involved is convex-internal (./lib/...) or an existing @/data import. mapAuthoringTombstone.ts already imports requireConnectionOnMap from ./lib/mapConnectionLookup, so adding readTouchingConnections creates no new edge.

**API sketch.**

```ts
// convex/lib/mapStaticClaim.ts
export async function claimStaticPlaceholder(ctx: MutationCtx, connectionId: Id<'mapConnections'>, side: 'from' | 'to'): Promise<'claimed' | 'none'>;
export async function claimStaticOrKeepId(ctx: MutationCtx, connectionId: Id<'mapConnections'>, side: 'from' | 'to'): Promise<Id<'mapConnections'>>;
// runClaim(ctx, connectionId, side): if side==='to' return { outcome:'none', survivorId: connectionId }; claimant = await ctx.db.get(connectionId) ...
// convex/mapAuthoringTombstone.ts
const rows = await readTouchingConnections(ctx, mapId, systemId, { limit: LIVE_CONNECTION_SCAN_CAP, errorCode: 'MAP_TOO_LARGE', errorDetail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.` });
return [...new Map(rows.map((row) => [row._id, row])).values()];
```

**Migration steps.**

1. Tombstone: in convex/mapAuthoringTombstone.ts, replace the body of readIncidentConnections (35-58) with readTouchingConnections, passing limit, errorCode and the existing errorDetail string verbatim. Keep the _id dedupe, because readTouchingConnections does not dedupe a row that appears in both index reads. Drop the takeIndexedOrThrow import if nothing else in the file uses it.
2. Collapse: in convex/mapAuthoringCollapse.ts readBoundedMapTopology (27-50), run the two .take(COLLAPSE_MAP_SCAN_CAP + 1) queries with Promise.all. Leave the combined bound check after them unchanged.
3. Pairs: in convex/mapJumpAuthoring.ts readPairRows (91-113), run the forward and reverse readConnectionsFrom calls with Promise.all. Leave answerAwaitingSignature as it is.
4. Static claims: change runClaim, claimStaticPlaceholder and claimStaticOrKeepId in convex/lib/mapStaticClaim.ts to take connectionId: Id<'mapConnections'>. runClaim keeps its ctx.db.get, which is now the only read.
5. Update the claim callers. Pre-patch callers pass the id: mapAuthoringFields.ts:180 passes connection._id, mapScanApply.ts:513 passes connection._id, mapScanElimination.ts:182 passes source._id. Post-patch callers drop the ctx.db.get and the null guard and pass the id: mapAuthoringFields.ts:191-194 passes input.connectionId; mapScanApply.ts:520-522 becomes return await claimStaticOrKeepId(ctx, connectionId, 'from'); mapScanElimination.ts:196-197 passes source._id.
6. Update convex/lib/mapStaticClaim.test.ts call sites (lines 80, 129, 159, 172, 195, 211, 243) to pass ._id.
7. Optional: in convex/characterLocationReads.ts syncInputs (38-53), map trackedIds through Promise.all to get per-character triples, then build locations, online and leases in trackedIds order so the output order is unchanged.
8. Run pnpm check through test-runner.

**Tests.** Existing guards that must stay green:
- convex/mapAuthoringTombstone.test.ts (SYSTEM_IN_USE at about 109-116) and convex/mapChain.test.ts:443,499.
- convex/mapAuthoringCollapse.test.ts:391 (MAP_TOO_LARGE).
- convex/mapJump.test.ts (pair and tracking bounds).
- Static-claim behavior suites: convex/lib/mapStaticClaim.test.ts, convex/mapStatics.test.ts, convex/mapAuthoringFields.test.ts, convex/mapScan.test.ts, convex/mapScanIdentify.test.ts and convex/mapJumpPending.test.ts.
- convex/characterLocationReads.test.ts, if the optional syncInputs step lands.

New test: a tombstone case where incident connections exceed LIVE_CONNECTION_SCAN_CAP on the inbound index only. It should still raise MAP_TOO_LARGE with the liveness-proof detail, which proves the readTouchingConnections options pass through.

**Notes.** Error equivalence:
- Collapse checks bounds only after both reads, so its error is unchanged.
- readPairRows' two reads throw the same code and detail, 'jump-pair read bound' with no system id, so whichever rejects first produces an identical error.
- For the tombstone, pass the existing detail string verbatim so the MAP_TOO_LARGE detail is unchanged.

Claim behavior: the post-patch 'typed === null' guards cannot fire. ctx.db.patch throws on a missing doc, and runClaim already handles a null claimant by returning the input id as survivorId. mapScanApply's 'return undefined' branch therefore disappears with no reachable behavior change.

Lead, not in scope: convex/lib/indexedQuery.ts:11-45 already exports uniqueByUserCharacter for characterLocation and characterLocationCovered, yet convex/mapJumpReads.ts:55-60 and convex/characterLocationReads.ts:43-44 query characterLocation by_user_character .unique() inline. These look like bypasses of that primitive and are worth a separate pass.

<sub>Reported by: area:convex.</sub>

<a id="p206"></a>

## P206: Share the stamp-patch-claim tail of door-type writes and drop the redundant re-reads

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -18 / +25: three re-read blocks and three inline predicates removed, one helper and one predicate added
- **Depends on:** [P289](#p289)
- **Existing primitive:** `@/data/maps/connection-door-types:connectionTypePatch; convex/lib/mapStaticClaim.ts:claimStaticOrKeepId; convex/lib/observationKey.ts:stampObservationKey`

**Problem.** Setting a wormhole type on a sig/connection door and claiming its static placeholder is hand-written at three Convex sites: the authoring setter, scan identify, and elimination deduction. Each copy stamps the observation key, patches, re-reads the row with ctx.db.get, and passes it to claimStaticPlaceholder or claimStaticOrKeepId. runClaim re-reads the row by id anyway, so the extra read does nothing. Copying the stamp-before-claim order three times is also risky: if a future copy claims before stamping, the observationKey never reaches the merged placeholder. Each site restates the 'doors and identity already equal' test in its own form: identityEquals at authoring, an inline typed+human check at scan, and an inline typed+assumed check on the from door only at elimination.

**Verifier revision.** Three real sites share one sequence: build a connectionTypePatch, skip if unchanged, stamp the observation key, patch, then claim the static. The order matters because sigClaimPatch (mapStaticClaim.ts:116-118) copies the claimant's observationKey onto the placeholder, so the key must be stamped before the claim. Every post-patch ctx.db.get is redundant: runClaim reads row._id and re-reads the claimant itself (mapStaticClaim.ts:176). Two parts of the proposal do not hold. (1) mapFixtureHoles is a different concept: an internal fixture upsert that merges type, size and hint field patches, with no stamp and no claim. (2) The proposal wants one unchanged predicate. The predicates differ partly by policy, not drift: elimination writes 'assumed' and must leave human types alone (its protected rule); authoring also compares resolution and the death window; scan also requires an observationKey so it can backfill one. Forcing one predicate would change behavior. The revised design shares the common core (a door-typing equality predicate, plus a stamp-patch-claim tail), and each site keeps its own extra conditions.

**Sites (7).**

- [`convex/mapAuthoringFields.ts:133-196`](../../convex/mapAuthoringFields.ts#L133-L196) — applyConnectionWormholeType: connectionTypePatch with 'human' (160-165); unchanged = both door codes + identityEquals + resolution.kind + sameDeathWindow (173-182); patch also writes lifetime and resolution; stamp only when value!==null (184-190); re-get, then claimStaticPlaceholder (191-194)
- [`convex/lib/mapScanApply.ts:489-523`](../../convex/lib/mapScanApply.ts#L489-L523) — stampIdentifiedWormholeType: gets the row by id; unchanged = both codes + typed/human + observationKey!==undefined + resolution.kind (505-514); patch type + resolution + stamp (515-519); re-get, then claimStaticOrKeepId (520-522). Callers at 553-557 and 599-603 use the survivor id
- [`convex/lib/mapScanElimination.ts:167-199`](../../convex/lib/mapScanElimination.ts#L167-L199) — applyTypeDeduction: unchanged = from code + typed/assumed only (175-184); protected rule (185-190); stamp, patch connectionTypePatch with 'assumed' (191-195); re-get, then claimStaticPlaceholder (196-197); returns the stamped observationKey
- [`convex/lib/mapStaticClaim.ts:100-120,168-216`](../../convex/lib/mapStaticClaim.ts#L100-L120) — runClaim re-reads the claimant (176) and otherwise uses only row._id; sigClaimPatch copies claimant.observationKey (116-118), which is why the stamp must land before the claim
- [`convex/lib/observationKey.ts:6-12`](../../convex/lib/observationKey.ts#L6-L12) — stampObservationKey: existing key, or a new UUID plus patch
- [`src/data/maps/connection-door-types.ts:74-93`](../../src/data/maps/connection-door-types.ts#L74-L93) — connectionTypePatch, the shared patch builder already used by all three sites
- [`src/data/maps/connection-hallway.ts:136-144,228-237`](../../src/data/maps/connection-hallway.ts#L136-L144) — identityFromDoors and identityEquals, the inputs to a shared equality predicate

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapFixtureHoles.ts:82-101`](../../convex/mapFixtureHoles.ts#L82-L101) — Internal fixture upsert that merges type, size and hint patches into one write (123-139, 180-185). It has no observation stamp and no claim, and its per-field no-op check is fixture semantics. Not the same concept
- [`src/mapper/chain/optimistic-authoring.ts:303-345`](../../src/mapper/chain/optimistic-authoring.ts#L303-L345) — Client optimistic mirror of the authoring setter. It has no unchanged check, no stamp and no claim, and lives in the mapper zone

</details>

**Home.** `convex/lib/mapStaticClaim.ts for writeDoorTypeAndClaim. src/data/maps/connection-door-types.ts for the pure sameDoorTyping predicate, next to connectionTypePatch`

**Boundary check.** All three consumers are in the convex zone (convex/mapAuthoringFields.ts, convex/lib/mapScanApply.ts, convex/lib/mapScanElimination.ts). An import inside the convex zone is always legal, and each consumer already imports from ./lib/mapStaticClaim. The predicate lives in the data zone (src/data/maps). The rule 'convex -> [platform/esi, platform/auth, data, lib]' allows it, and all three sites already import connectionTypePatch from @/data/maps/connection-door-types. mapStaticClaim.ts would add an import of ./observationKey (convex/lib), which is also inside the zone.

**API sketch.**

```ts
// src/data/maps/connection-door-types.ts
export function sameDoorTyping(
  hallway: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue; readonly identity: ConnectionIdentity },
  patch: { readonly from: ConnectionDoorValue; readonly to: ConnectionDoorValue; readonly identity: ConnectionIdentity },
): boolean; // from.typeCode, to.typeCode and identityEquals

// convex/lib/mapStaticClaim.ts
export async function writeDoorTypeAndClaim(
  ctx: MutationCtx,
  row: Pick<Doc<'mapConnections'>, '_id' | 'observationKey'>,
  side: 'from' | 'to',
  patch: Partial<Doc<'mapConnections'>>,
): Promise<{ readonly observationKey: string; readonly outcome: 'claimed' | 'none'; readonly survivorId: Id<'mapConnections'> }>;
// stamps the key, patches {...patch, ...stamped.patch}, then runs runClaim(ctx, row, side) with no extra get
// narrow runClaim's row param to Pick<Doc<'mapConnections'>, '_id'> so no caller relies on stale fields
```

**Migration steps.**

1. Pin current behavior before refactoring. The existing guards are mapAuthoringFields.test.ts:88 and :114, mapScan.test.ts:255/289/328, mapScanIdentify.test.ts:101/210 and mapStaticClaim.test.ts. Add an elimination case asserting that the applied outcome returns the same observationKey the claimed placeholder ends up with.
2. Add sameDoorTyping to src/data/maps/connection-door-types.ts with unit tests in connection-door-types.test.ts: equal doors and identity, a provenance mismatch, and a to-door difference.
3. Narrow runClaim's row parameter to Pick<Doc<'mapConnections'>, '_id'>. claimStaticPlaceholder and claimStaticOrKeepId keep their signatures, so the tests compile unchanged.
4. Add writeDoorTypeAndClaim to convex/lib/mapStaticClaim.ts. It calls stampObservationKey, then ctx.db.patch, then runClaim, and returns { observationKey, outcome, survivorId }.
5. mapScanElimination.applyTypeDeduction: compute typePatch = connectionTypePatch(source, 'from', typeCode, 'assumed'), use sameDoorTyping(source, typePatch) as the unchanged test, keep the protected rule, and replace the stamp/patch/get/claim block with writeDoorTypeAndClaim, returning its observationKey.
6. mapScanApply.stampIdentifiedWormholeType: unchanged = sameDoorTyping && observationKey !== undefined && resolution kind equal. On change, call writeDoorTypeAndClaim(ctx, connection, 'from', { ...typePatch, resolution }) and return survivorId.
7. mapAuthoringFields.applyConnectionWormholeType: unchanged = sameDoorTyping && resolution kind equal && sameDeathWindow. When value===null, keep the plain ctx.db.patch, with no stamp and no claim. Otherwise call writeDoorTypeAndClaim(ctx, connection, door, { ...typePatch, resolution, lifetime }) and keep returning typeSetterSemanticWrite({ changed: true, claimed: false }).
8. Delete the three `const typed = await ctx.db.get(...)` re-reads and their null branches.

**Tests.** Guarding tests: convex/mapAuthoringFields.test.ts (88 'mutated then idle for a repeated wormhole type', 114 'claimed when a no-field-change type set absorbs a static placeholder', 233 'records manual type identity and clears pending'); convex/mapScan.test.ts (255, 289, 328 elimination, 855); convex/mapScanIdentify.test.ts (101 'repeat ... is a no-op', 210 'wormhole identify claims a static placeholder'); convex/lib/mapStaticClaim.test.ts. New tests: sameDoorTyping unit tests; a writeDoorTypeAndClaim test in mapStaticClaim.test.ts asserting that a freshly stamped observationKey is copied onto the surviving placeholder.

**Notes.** Behavior to preserve per site. Authoring stamps and claims only when value !== null, and reports claimed: false on the changed path. Scan requires observationKey !== undefined in its unchanged test, so a typed/human row without a key still gets one; keep that conjunct at the scan site only. Elimination writes 'assumed' and keeps its protected gate, and does not clear a pending resolution (authoring and scan call clearPendingResolution); do not add that silently. One small difference: elimination's unchanged test today checks only from.typeCode. With sameDoorTyping it also compares the to door that connectionTypePatch would write (K162 when the type is an entrance and to is null). That edge only arises on rows that break the invariant connectionTypePatch and typedDoorsFrom maintain. Decide deliberately and add a test if the behavior changes. Efficiency gain is one indexed get per typed write, which is negligible. The value is a single owner for the stamp-before-claim order.

<sub>Reported by: area:convex.</sub>

<a id="p207"></a>

## P207: Route scan stub removal through retainRemovedConnection and share the removed-connection purgeAfter re-stamp

- **Status:** [ ] not started
- **Category:** convex · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +12
- **Depends on:** —
- **Existing primitive:** `src/data/maps/connection-hallway.ts:liveTombstone, connectionTombstoneStamps; convex/mapAuthoringCollapse.ts:retainRemovedConnection`

**Problem.** Two connection-tombstone writes bypass, or have no, shared helper. (1) Scan removal of a confident-missing stub writes the removed tombstone, deletes activity and respawns the static by hand. This duplicates mapAuthoringCollapse.retainRemovedConnection, so a change to stub retention (for example a new side effect) would miss the scan path. (2) Six sites re-arm a removed connection's purgeAfter with an inline `ctx.db.patch(id, { tombstone: { ...t, purgeAfter } })` behind a hand-written `kind === 'removed'` guard. Only one site skips the write when the value is already equal.

**Verifier revision.** Only part of the proposal holds. Real: (a) removeConfidentRow's stub branch restates retainRemovedConnection exactly: patch connectionRemovedTombstone(now), delete the signature activity, respawnAfterTombstone. mapScanSelection.ts already imports runCollapse and runBranchRestore from ../mapAuthoringCollapse, so it can call the existing primitive directly with no move. (b) The 'set a removed connection's purgeAfter' write is hand-written six times across four files, guarded differently each time. Rejected: replacing the `{ kind: 'live' }` literals with liveTombstone() adds a call with no semantic gain, since the literal is the type. The mapScanState removed literal carries a nullable purgeAfter that connectionTombstoneStamps(number, number) does not accept, and mapHallwayBackfill is a one-shot migration. A pure withPurgeAfter(t, x) saves nothing over `{ ...t, purgeAfter: x }`. reviveSystem would collapse two lines at two sites. The runBranchRestore 'drift' is intentional, not drift. stampRemovedRows tombstones incident stubs, static placeholders included, with the branch's deletedAt, and runBranchRestore revives every connection with that deletedAt, so the placeholders come back without ensureStaticPlaceholders.

**Sites (8).**

- [`convex/lib/mapScanSelection.ts:288-313`](../../convex/lib/mapScanSelection.ts#L288-L313) — removeConfidentRow stub branch 309-312: connectionRemovedTombstone(now), state.activities lookup and delete, respawnAfterTombstone. The connection's fromSystemId and from.signatureId equal the scan's systemId and signatureId (findOriginLifecycleConnection, caller 340-358)
- [`convex/mapAuthoringCollapse.ts:191-199`](../../convex/mapAuthoringCollapse.ts#L191-L199) — retainRemovedConnection: the same three steps, with the activity deleted via deleteSignatureActivity keyed by the connection (178-189)
- [`convex/lib/mapScanSelection.ts:12-16,33`](../../convex/lib/mapScanSelection.ts#L12-L16) — already imports runBranchRestore and runCollapse from ../mapAuthoringCollapse
- [`convex/mapAuthoringCollapse.ts:252-260`](../../convex/mapAuthoringCollapse.ts#L252-L260) — stampRemovedRows: skeletonsToRearm re-stamp, guard kind!=='removed' then continue
- [`convex/mapAuthoringTombstone.ts:76-85`](../../convex/mapAuthoringTombstone.ts#L76-L85) — stampSystemTombstone: guard removed && purgeAfter differs (the only site with the no-op skip)
- [`convex/mapJumpAuthoring.ts:365-379`](../../convex/mapJumpAuthoring.ts#L365-L379) — supersedeDyingPairConnections: guard, then patch purgeAfter: now
- [`convex/mapChainCleanup.ts:136-140,155-157`](../../convex/mapChainCleanup.ts#L136-L140) — settle path: held, and retry after a settle failure, both re-arm now+MAP_CHAIN_UNDO_WINDOW_MS on an already-narrowed tombstone
- [`convex/mapChainCleanup.ts:296-306`](../../convex/mapChainCleanup.ts#L296-L306) — expireKeptConnections: guard, then purgeAfter: now

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/lib/mapScanState.ts:165-184`](../../convex/lib/mapScanState.ts#L165-L184) — tombstoneConnectionRow takes a nullable purgeAfter, and connectionTombstoneStamps(deletedAt, purgeAfter: number) does not accept null. The live literal is clear as written
- [`convex/mapAuthoringCollapse.ts:329,413`](../../convex/mapAuthoringCollapse.ts#L329) — `{ kind: 'live' }` literals. liveTombstone() adds nothing
- [`convex/mapAuthoringTombstone.ts:138`](../../convex/mapAuthoringTombstone.ts#L138) — `{ kind: 'live' }` literal, same reason
- [`convex/mapHallwayBackfill.ts:45-67`](../../convex/mapHallwayBackfill.ts#L45-L67) — One-shot legacy migration that already uses connectionRemovedTombstone for the removed side
- [`convex/mapAuthoringHome.ts:70-83`](../../convex/mapAuthoringHome.ts#L70-L83) — System revive plus ensureStaticPlaceholders: two lines, two sites. A helper is not worth it
- [`convex/mapAuthoringTombstone.ts:100-110`](../../convex/mapAuthoringTombstone.ts#L100-L110) — clearSystemTombstone: the same two-line revive
- [`convex/mapAuthoringCollapse.ts:379-415`](../../convex/mapAuthoringCollapse.ts#L379-L415) — runBranchRestore revives systems without ensureStaticPlaceholders on purpose. stampRemovedRows (225-262) tombstones incident stubs, placeholders included, with the same deletedAt, and the restore loop at 411-414 revives them. Not drift

</details>

**Home.** `New convex/lib/mapConnectionTombstone.ts for setRemovedPurgeAfter. retainRemovedConnection stays in convex/mapAuthoringCollapse.ts`

**Boundary check.** Every consumer is in the convex zone (convex/mapAuthoringCollapse.ts, convex/mapAuthoringTombstone.ts, convex/mapJumpAuthoring.ts, convex/mapChainCleanup.ts, convex/lib/mapScanSelection.ts). Imports inside the convex zone are unrestricted. The new module needs only the convex _generated types. mapScanSelection.ts → ../mapAuthoringCollapse is an existing edge (line 12-16).

**API sketch.**

```ts
// convex/lib/mapConnectionTombstone.ts
export async function setRemovedPurgeAfter(
  ctx: MutationCtx,
  row: Pick<Doc<'mapConnections'>, '_id' | 'tombstone'>,
  purgeAfter: number,
): Promise<boolean>; // false for live rows or an already-equal purgeAfter; otherwise patches { tombstone: { ...row.tombstone, purgeAfter } }
```

**Migration steps.**

1. In convex/lib/mapScanSelection.ts, replace lines 309-312 with `await retainRemovedConnection(ctx, connection, input.now);` imported from '../mapAuthoringCollapse'. Remove the now-unused `state` parameter from removeConfidentRow and its call at 351, and drop the connectionRemovedTombstone and respawnAfterTombstone imports if they are unused.
2. Add convex/lib/mapConnectionTombstone.ts with setRemovedPurgeAfter.
3. Replace the six re-stamp blocks: mapAuthoringCollapse.ts 252-260, mapAuthoringTombstone.ts 76-85, mapJumpAuthoring.ts 374-377, mapChainCleanup.ts 137-140, 155-157 and 302-305. Keep each site's outer selection logic (chainTombstoneState dying check, skeleton filter, index query).

**Tests.** Guarding tests: convex/mapScan.test.ts (confident-missing removal and stub respawn cases, e.g. 855, 927, 990), convex/mapAuthoringTombstone.test.ts, convex/mapAuthoringCollapse*.test.ts, convex/mapChainCleanup*.test.ts, convex/mapJumpPending.test.ts. New: unit tests for setRemovedPurgeAfter covering a live row, an equal value (no write) and a removed row (patched).

**Notes.** retainRemovedConnection finds the activity with an indexed read (findSignatureActivity keyed by mapId, fromSystemId and from.signatureId) instead of the in-memory state.activities. That is the same row, plus one bounded read per removed stub (at most MAP_SCAN_ROW_LIMIT). Neither version updates state.activities afterwards, so downstream behavior is unchanged. setRemovedPurgeAfter's no-op skip changes five sites from writing an identical value to not writing. The visible state is the same, with fewer subscription invalidations. In expireKeptConnections, keep returning `changed: kept.length` as today, or switch to counting true returns if the backfill loop's done test is updated with it.

<sub>Reported by: area:convex.</sub>

<a id="p215"></a>

## P215: Prune map tracking with one by_map read per claim-set apply instead of one query per claimant

- **Status:** [ ] not started
- **Category:** efficiency · **Kind:** efficiency · **Verdict:** revised
- **Effort:** S · **Risk:** medium · **Payoff:** medium · **Size:** About -45 in mapTrackingTeardown.ts (four helpers) +15 (pruneMapTracking); applyClaimSet about -11 +8
- **Depends on:** [P196](#p196), [P200](#p200)
- **Existing primitive:** `convex/lib/mapTrackingCapacity.ts:readMapTracking`

**Problem.** reconcileMapClaims.applyClaimSet calls deleteTrackingOutsideCharacters for every character-scoped desired user and deleteTrackingForUser for every revoked user. Each call is a separate by_map_user collect in the same mutation. A map granted to a corporation or alliance with hundreds of LGI users therefore costs hundreds of index-range reads per projection, though most claimants track nothing. Revocation is also keyed on existing mapAccess rows rather than on the desired set. If a user's claim was already removed by purgeUserMapClaims, as in the character-unlink flow, their remaining tracking rows are never revoked. mapTrackingLive.forMap shows every tracking row without checking the tracker's access, and syncInputs keeps syncing any character that has a tracking row.

**Verifier revision.** The inefficiency is real. applyClaimSet issues one by_map_user collect per character-scoped desired claimant and one per revoked user. All three teardown helpers have applyClaimSet as their only caller, and the by_map read they all approximate is bounded by the insert-time cap. The repo already batches the sibling revocation mutation to stay under Convex read/write limits (src/composition/map-access-projection.ts:291-303), and the claims array is unbounded (convex/httpMapAccess.ts:11-24). Two design changes are needed. (1) Do not use readMapTracking: it throws above the cap, and this is the revocation path, which must never fail closed. Use the same by_map collect that deleteAllTrackingForMap already performs; every insert path enforces the cap. (2) Verification turned up drift that the single read fixes. Tracking is revoked only for users who still have a mapAccess row. purgeUserMapClaims deletes mapAccess rows but leaves tracking, so the user's legacy-claim tracking of other characters survives every later reconcile and keeps publishing locations.

**Sites (11).**

- [`convex/mapAccessProjection.ts:171-206`](../../convex/mapAccessProjection.ts#L171-L206) — applyClaimSet: per-desired-user deleteTrackingOutsideCharacters (191-193); revoked set = users with existing mapAccess rows not desired (196); per-revoked-user deleteTrackingForUser (201-203); deleteAllTrackingForMap when desired is empty (198-199)
- [`convex/mapTrackingTeardown.ts:28-73`](../../convex/mapTrackingTeardown.ts#L28-L73) — deleteUserTrackingWhere (by_map_user collect), its two wrappers, and deleteAllTrackingForMap (by_map collect). All are used only by applyClaimSet
- [`convex/lib/mapTrackingCapacity.ts:6-19`](../../convex/lib/mapTrackingCapacity.ts#L6-L19) — readMapTracking: take(cap+1) and throws TRACKING_SCAN_LIMIT above 1024. Unsuitable for the revocation path
- [`convex/mapTrackingOptIn.ts:29-31`](../../convex/mapTrackingOptIn.ts#L29-L31) — Every insert path enforces the cap (also mapFixtureTracking.ts:158-165 and accountMerge.ts:246-248), so a by_map collect is bounded in practice
- [`convex/mapAccessProjection.ts:285-310`](../../convex/mapAccessProjection.ts#L285-L310) — purgeUserMapClaims deletes the user's mapAccess rows on the listed maps but no tracking
- [`src/composition/map-access-identity.ts:29-35, 49-57`](../../src/composition/map-access-identity.ts#L29-L35) — Unlink revokes claims via purgeUserMapClaims, then tears down tracking for the unlinked character only (teardownLocationTracking(userId, characterId))
- [`convex/lib/mapAccess.ts:10-20`](../../convex/lib/mapAccess.ts#L10-L20) — Legacy (characters null) claims let a user track any character, so tracking of other characters can outlive the claim
- [`convex/mapTrackingLive.ts:66-84`](../../convex/mapTrackingLive.ts#L66-L84) — forMap returns every tracking row's location with no check of the tracker's access
- [`convex/characterLocationReads.ts:21-34`](../../convex/characterLocationReads.ts#L21-L34) — trackedIds come from the user's mapTracking rows, so an orphaned row keeps that character syncing
- [`convex/httpMapAccess.ts:11-24`](../../convex/httpMapAccess.ts#L11-L24) — The claims array has no size cap
- [`src/composition/map-access-projection.ts:288-303`](../../src/composition/map-access-projection.ts#L288-L303) — The repo already batches the sibling revocation to stay under Convex read/write limits

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/mapTrackingTeardown.ts:75-89`](../../convex/mapTrackingTeardown.ts#L75-L89) — purgeTrackingForUserBatch is a cross-map, user-keyed, batched purge (account deletion), a different concept. Keep it
- [`convex/mapTrackingTeardown.ts:6-26`](../../convex/mapTrackingTeardown.ts#L6-L26) — deleteTrackingRow and deleteBookkeepingIfUntracked stay as the per-row primitive (also used by characterLocationPurge.ts:48, accountMerge.ts:31, mapTrackingOptIn.ts:77)

</details>

**Home.** `convex/mapTrackingTeardown.ts: pruneMapTracking replaces deleteUserTrackingWhere, deleteTrackingForUser, deleteTrackingOutsideCharacters and deleteAllTrackingForMap`

**Boundary check.** The primitive and its only consumer are both in the convex zone (convex/mapTrackingTeardown.ts and convex/mapAccessProjection.ts), which is an intra-zone import. No cross-zone imports are added.

**API sketch.**

```ts
// convex/mapTrackingTeardown.ts
/** Reads the map's tracking once (by_map) and deletes every row `keep` rejects, cascading bookkeeping. Returns rows deleted. */
export async function pruneMapTracking(
  ctx: MutationCtx,
  mapId: string,
  keep: (row: Doc<'mapTracking'>) => boolean,
): Promise<number>
```

**Migration steps.**

1. Add pruneMapTracking to convex/mapTrackingTeardown.ts. Read `ctx.db.query('mapTracking').withIndex('by_map', q => q.eq('mapId', mapId)).collect()`, the same non-throwing read deleteAllTrackingForMap does today, and call deleteTrackingRow on each row where keep(row) is false.
2. In applyClaimSet, remove the per-user calls (lines 191-193 and 196-204). After the claim loop and deleteClaimRows, build `const claimed = new Set(desired.keys())` and `const eligible = new Map(...)`, mapping userId to a Set of characterIds only for claims whose characters are defined. Then call `await pruneMapTracking(ctx, mapId, (row) => claimed.has(row.userId) && (eligible.get(row.userId)?.has(row.characterId) ?? true))`.
3. Do NOT add the pruned count to counts.deleted. Today's counts exclude tracking deletions, and mapTrackingScoped.test.ts:86-90 asserts deleted: 0 after a character leaves the eligible set.
4. Delete deleteUserTrackingWhere, deleteTrackingForUser, deleteTrackingOutsideCharacters and deleteAllTrackingForMap, and update the imports at mapAccessProjection.ts:16-21.
5. If reviewers want byte-for-byte semantics instead of the stricter rule, use a keep predicate that rejects only users in revokedUserIds (or every user when desired is empty) plus scoped users' ineligible characters. See notes.

**Tests.** Existing tests that guard this: convex/mapTracking.test.ts:645-735 (a revoked user's tracking is deleted in the same apply), 737+ (claims: [] sweeps every row); convex/mapTrackingScoped.test.ts:78-98 (an ineligible character is dropped while the claim stays; counts unchanged), 62-76 (legacy claims keep any character); convex/mapAccessProjection.test.ts:298-330 (purge backstop). Add a test where a legacy-claim user's mapAccess row was removed by purgeUserMapClaims and the next reconcileMapClaims that omits them deletes their remaining tracking; this codifies the drift fix. Add a smoke test where a reconcile with many scoped claimants (for example 300 desired users, a few tracking) completes and prunes only the ineligible rows.

**Notes.** Efficiency: index-range reads per projection drop from 1 + N(scoped desired) + N(revoked) to 1 (plus the existing per-deleted-row bookkeeping probe). The documents read are bounded by the 1024 insert cap. The read set widens slightly for unscoped maps with no revocations: today they read no tracking, and now one by_map range, so a concurrent setTracking can force an OCC retry of the projection. That is acceptable for an infrequent mutation. Semantics: the recommended predicate (keep only desired users, and only their eligible characters when scoped) equals today's behavior in three cases: when desired is empty (everything deleted), for revoked users, and for scoped claimants. It is stricter in one case, a tracking row whose user has no mapAccess row and is not desired. Today that row survives, which is the orphan path: purgeUserMapClaims (mapAccessProjection.ts:285-310) removes the claim, the unlink teardown removes only the unlinked character's tracking (map-access-identity.ts:49-57), and a legacy claim (mapAccess.ts:17-20) allowed tracking other characters. Such a row keeps that character syncing (characterLocationReads.ts:21-34) and visible on the map (mapTrackingLive.ts:66-84). Treat the stricter rule as a deliberate fix with its own test, not as an incidental refactor. Never let this path throw on capacity: readMapTracking's TRACKING_SCAN_LIMIT would make access revocation fail for an over-cap legacy map.

<sub>Reported by: concern:efficiency.</sub>

<a id="p311"></a>

## P311: Drop decideCollapse's pilotsPresent and decide pilot retention once in mapAuthoringCollapse

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -22/+8 (chain-collapse.ts -3, mapAuthoringCollapse.ts -10/+8, chain-collapse.test.ts -8)
- **Depends on:** —
- **Existing primitive:** `src/data/maps/chain-collapse.ts:decideCollapse`

**Problem.** decideCollapse carries a tri-state PilotsPresent that it reads only once, as a blanket 'retain everything'. Its sole 'present' caller is collapseOutcome's second collapseDecision, which re-validates, re-remaps rows and re-walks the graph only to return retain. The 'is a tracked pilot in the removed branch' predicate is written twice, in collapseOutcome and in settleRemovedConnection.

**Sites (12).**

- [`src/data/maps/chain-collapse.ts:1, 14-19, 74-81`](../../src/data/maps/chain-collapse.ts#L1) — PilotsPresent union, an input field, and its single read at :77
- [`convex/mapAuthoringCollapse.ts:8-12`](../../convex/mapAuthoringCollapse.ts#L8-L12) — Imports the PilotsPresent type
- [`convex/mapAuthoringCollapse.ts:80-130`](../../convex/mapAuthoringCollapse.ts#L80-L130) — collapseDecision: validation, row remapping and the decideCollapse call, threading pilotsPresent through at :83/:128
- [`convex/mapAuthoringCollapse.ts:132-152`](../../convex/mapAuthoringCollapse.ts#L132-L152) — CollapsePilotsPresent union; an 'absent' preview, then a full second collapseDecision(…, 'present') that can only return retain
- [`convex/mapAuthoringCollapse.ts:154`](../../convex/mapAuthoringCollapse.ts#L154) — RemoveCollapseDecision type, declared after collapseOutcome
- [`convex/mapAuthoringCollapse.ts:322-351`](../../convex/mapAuthoringCollapse.ts#L322-L351) — settleRemovedConnection: collapseDecision(…, 'absent') at :334; repeated predicate at :336
- [`convex/mapAuthoringCollapse.ts:438-449`](../../convex/mapAuthoringCollapse.ts#L438-L449) — severConnection passes 'unknown'
- [`convex/mapAuthoringSweep.ts:41-58`](../../convex/mapAuthoringSweep.ts#L41-L58) — Passes { trackedInSystemIds: tracked }
- [`convex/lib/mapScanSelection.ts:35-44, 56-77, 288-310`](../../convex/lib/mapScanSelection.ts#L35-L44) — trackedPresenceReader builds { trackedInSystemIds } and passes it through to runCollapse
- [`src/data/maps/chain-collapse.test.ts:9-39`](../../src/data/maps/chain-collapse.test.ts#L9-L39) — input() default 'unknown'; loop over unknown/absent at :34-36; the 'present' case at :37-39
- [`convex/mapAuthoringSweep.test.ts:173-207, 524-531`](../../convex/mapAuthoringSweep.test.ts#L173-L207) — Integration guard for a tracked pilot in a branch through runCollapse; 'one collapse-decision owner' asserts a single decideCollapse( in mapAuthoringCollapse.ts
- [`convex/lib/mapChainCleanup.test.ts:193-230`](../../convex/lib/mapChainCleanup.test.ts#L193-L230) — Integration guard for settleRemovedConnection's 'held' path

**Home.** `src/data/maps/chain-collapse.ts (pure decision, pilot concept removed) plus a module-private pilotInRemovedBranch in convex/mapAuthoringCollapse.ts`

**Boundary check.** chain-collapse.ts stays in the data zone (autoDiscover src/data) and loses a type with no new imports. convex/mapAuthoringCollapse.ts is in the convex zone, whose rule {from:'convex', allow:['platform/esi','platform/auth','data','lib']} already permits the existing '@/data/maps/chain-collapse' import. pilotInRemovedBranch is module-private in convex. convex/lib/mapScanSelection.ts and convex/mapAuthoringSweep.ts are convex-zone importers of CollapsePilotsPresent from the same zone.

**API sketch.**

```ts
// src/data/maps/chain-collapse.ts
export interface CollapseDecisionInput { readonly cutConnectionId: string; readonly systems: readonly CollapseSystem[]; readonly connections: readonly CollapseConnection[] }
export function decideCollapse(input: CollapseDecisionInput): CollapseDecision
// convex/mapAuthoringCollapse.ts
export type CollapsePilotsPresent = 'unknown' | { readonly trackedInSystemIds: ReadonlySet<number> };
function collapseDecision(topology: BoundedMapTopology, cut: Doc<'mapConnections'>): CollapseDecision
function pilotInRemovedBranch(decision: RemoveCollapseDecision, tracked: ReadonlySet<number>): boolean
function collapseOutcome(topology, cut, pilots: CollapsePilotsPresent): CollapseDecision {
  const decision = collapseDecision(topology, cut);
  if (pilots === 'unknown' || decision.kind === 'retain') return decision;
  return pilotInRemovedBranch(decision, pilots.trackedInSystemIds) ? { kind: 'retain' } : decision;
}
```

**Migration steps.**

1. chain-collapse.ts: delete `export type PilotsPresent` (:1) and the pilotsPresent field (:18). Reduce `retained` (:75-77) to `[...component].some((systemId) => rootIds.has(systemId))`.
2. mapAuthoringCollapse.ts: drop PilotsPresent from the import (:11). Move `type RemoveCollapseDecision` (:154) above collapseDecision. Remove the pilotsPresent parameter and the pass-through from collapseDecision (:83, :128).
3. Narrow CollapsePilotsPresent to `'unknown' | { readonly trackedInSystemIds: ReadonlySet<number> }` and add pilotInRemovedBranch(decision, tracked) = decision.systemIds.some((id) => tracked.has(id)).
4. Rewrite collapseOutcome as in apiSketch: one collapseDecision call, and {kind:'retain'} when a tracked pilot is in the removed branch.
5. settleRemovedConnection: call collapseDecision(withCut, live) and replace :336 with `if (pilotInRemovedBranch(decision, trackedInSystemIds)) return 'held';`.
6. Callers need no change: severConnection already passes 'unknown'; mapAuthoringSweep.ts and mapScanSelection.ts already pass { trackedInSystemIds } and type-check against the narrowed union.
7. chain-collapse.test.ts: drop `pilotsPresent: 'unknown'` from input(), the unknown/absent loop (:34-36) and the 'present' expectation (:37-39). Rename the test to 'removes cut-off branches unless a loop still reaches home'.

**Tests.** Existing guards: convex/mapAuthoringSweep.test.ts:173 ('retains a branch holding a tracked pilot and removes the dead connection alone') covers collapseOutcome's tracked path end to end. convex/lib/mapChainCleanup.test.ts:193 ('holds a branch with a tracked pilot inside...') covers settleRemovedConnection 'held'. convex/mapAuthoringSweep.test.ts:524-531 keeps a single decideCollapse( call, which still holds. Add one convex test, e.g. in mapAuthoringSweep.test.ts next to :173: a tracked pilot on the root side only (not in the removed branch) still removes the branch. This pins that the predicate checks the removed systemIds, not any tracked pilot on the map. Since 'present' used to retain every component, a regression here would be silent.

**Notes.** Behavior is the same. The old second call could only return retain and could not throw, because validation already passed on identical input. Keep 'unknown' as the explicit no-pilot-info value so severConnection and the CollapsePilotsPresent signature at mapScanSelection.ts:38/:61/:297 stay readable. The 'already_applied' early return in runCollapse (:294-296) comes before collapseOutcome and is unaffected.

<sub>Reported by: gap:graph-traversal-and-mapper-layout.</sub>

<a id="p208"></a>

## P208: Share each Convex door's request shape with its Next caller, per data area

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -35 / +30
- **Depends on:** —
- **Existing primitive:** `src/lib/convex-http-door.ts:postConvexHttpDoor, ConvexHttpDoorError`

**Problem.** The Next caller and the convex/http*.ts handler each hand-write the same payload shapes, and nothing ties them together. (1) A location-tracking merge selection leaves Convex in the snapshot response and returns in the restore request. Next validates the response without nonnegative(), Convex validates the request with it, and the 1000 bound is a literal in three files. A negative timestamp would pass the snapshot, get stored in Postgres, and then fail every restore retry. (2) The receipt candidate {receiptId, operationId} is defined on both sides. (3) The leave-sync {dataset, tabId} rules exist in api-contract.ts, convex/httpLocation.ts and leave-door.ts's hand-typed input. Widening tabId on the Next side alone would turn every leave into a 503. (4) Revoke batches are sliced at a literal 32 in Next and capped with max(32) in Convex. (5) The purge body {userId, characterId|null} is identical in two Convex HTTP modules.

**Verifier revision.** Step 1 does not hold. The six door error classes follow the repo-wide named-error convention: 18 Error subclasses set this.name, for example src/platform/esi/errors.ts and src/data/wh-statics/*. The claim that they exist 'only to pass as error:' is false. ProjectionUnavailableError is thrown directly in six places, imported by map-character-scoping, and used as a type in map-access-update.ts:35. MapPurgeUnavailableError is thrown three times in map-purge.ts. A defineDoorError factory returns an anonymous class type, loses the nominal type those sites rely on, and saves about 5 lines per class. A bound convexDoor poster is also unnecessary: jump-resolver and signature-elimination already bind locally, and merge.ts's repetition is a local const. Step 2 is real but needs a different home. Every Next→Convex door contract is split between the two ends. Proven duplication and drift exist for the location-tracking merge shapes (selection: nonnegative only on the Convex side, limit 1000 copied three times; the receipt candidate shape is defined twice), leaveSync (field rules copied in three places), and the revoke batch size 32 (copied three times). The proposed src/data/convex/doors.ts is illegal for the data/location-tracking and data/online-status consumers. src/data is autoDiscover'd into per-child zones, and the data rule lets one child import only data/eve-data among its siblings. Each shared contract must live in its owner's data child.

**Sites (15).**

- [`src/data/location-tracking/merge.ts:13-26`](../../src/data/location-tracking/merge.ts#L13-L26) — snapshot response selection: strictObject without nonnegative on lastProcessedTransitionAt, max(1000)
- [`convex/httpAccountMerge.ts:30-42`](../../convex/httpAccountMerge.ts#L30-L42) — restore request selection: z.object with nonnegative, max(1000)
- [`convex/accountMerge.ts:73`](../../convex/accountMerge.ts#L73) — MERGE_TRACKING_LIMIT = 1000, the third copy of the bound
- [`src/data/location-tracking/schema.ts:6-10`](../../src/data/location-tracking/schema.ts#L6-L10) — TrackingSelection interface, the same shape as a TS type
- [`src/data/location-tracking/merge.ts:47-55,57-84`](../../src/data/location-tracking/merge.ts#L47-L55) — receiptCandidateSchema plus a hand-written TrackingReceiptCandidate interface; delete request body
- [`convex/httpAccountMerge.ts:50-65`](../../convex/httpAccountMerge.ts#L50-L65) — delete request receipts: the same {receiptId, operationId} shape, already sharing MERGE_RECEIPT_BATCH_SIZE from @/data/location-tracking/constants (the precedent)
- [`src/data/convex/api-contract.ts:4-9`](../../src/data/convex/api-contract.ts#L4-L9) — browser→Next leaveSync strictObject {dataset, tabId min 8 max 64}; the file imports @/transport/endpoint, so Convex cannot import it
- [`convex/httpLocation.ts:11-15`](../../convex/httpLocation.ts#L11-L15) — Next→Convex leaveSync z.object {userId, dataset, tabId min 8 max 64}
- [`src/data/convex/leave-door.ts:15-27`](../../src/data/convex/leave-door.ts#L15-L27) — third copy of the shape as a TS input type
- [`src/app/api/sync-leave/route.ts:22-37`](../../src/app/api/sync-leave/route.ts#L22-L37) — parses with leaveSyncRequestSchema, forwards to Convex, and maps LeaveSyncDoorError to 503
- [`src/composition/map-access-projection.ts:288-302`](../../src/composition/map-access-projection.ts#L288-L302) — revokeUserMapClaims slices with a literal 32, twice
- [`convex/httpMapAccess.ts:43-47`](../../convex/httpMapAccess.ts#L43-L47) — purgeUserMapClaims body .max(32)
- [`convex/httpLocation.ts:6-9`](../../convex/httpLocation.ts#L6-L9) — purge body {userId, characterId nullable}
- [`convex/httpEngine.ts:6-9`](../../convex/httpEngine.ts#L6-L9) — identical purge body
- [`src/lib/convex-http-door.ts:10-26`](../../src/lib/convex-http-door.ts#L10-L26) — body: unknown, so the request is never typed against the Convex schema

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/map-access-projection.ts:62-76`](../../src/composition/map-access-projection.ts#L62-L76) — ProjectionUnavailableError is a domain error thrown at 64, 222, 227, 240 and 245, and is also used by map-character-scoping.ts:120 and as a type in map-access-update.ts:35. Keep the class
- [`src/composition/map-purge.ts:19-24,63-84`](../../src/composition/map-purge.ts#L19-L24) — MapPurgeUnavailableError is also thrown directly three times. Keep the class
- [`src/composition/jump-resolver/convex-door.ts:110-130`](../../src/composition/jump-resolver/convex-door.ts#L110-L130) — Error class follows the repo convention, and the local postDoor already binds error and label
- [`src/composition/signature-elimination/convex-door.ts:37-52`](../../src/composition/signature-elimination/convex-door.ts#L37-L52) — Same: a conventional class plus an existing local postDoor binder
- [`src/data/location-tracking/merge.ts:6-11`](../../src/data/location-tracking/merge.ts#L6-L11) — LocationTrackingMergeError follows the convention. The four repeated `error, timeoutMs: 4000` lines are a local-const tidy, not a primitive
- [`src/data/convex/leave-door.ts:8-13`](../../src/data/convex/leave-door.ts#L8-L13) — LeaveSyncDoorError is checked with instanceof in route.ts:31. Keep it
- [`src/platform/esi/errors.ts:30-42`](../../src/platform/esi/errors.ts#L30-L42) — Evidence of the repo-wide `this.name = ...` convention the six classes follow

</details>

**Home.** `src/data/location-tracking/merge-contract.ts (new, pure zod) for the selection and receipt shapes; MERGE_TRACKING_LIMIT goes into src/data/location-tracking/constants.ts. src/data/convex/leave-contract.ts (new, pure zod) for the leave-sync fields. MAP_CLAIM_REVOKE_BATCH goes into src/data/maps/access-contract.ts. userPurgeBodySchema goes into convex/lib/httpAuth.ts, since both consumers are Convex`

**Boundary check.** src/data children are separate zones (autoDiscover). The rule 'data -> [data/eve-data, platform/esi, platform/owner-sync, platform/search, platform/purge, transport, db, lib, config]' does not let data/location-tracking import data/convex, so a single src/data/convex/doors.ts is illegal for merge.ts and online-status. Per-area homes: merge-contract.ts is imported by src/data/location-tracking/merge.ts (same zone) and convex/httpAccountMerge.ts plus convex/accountMerge.ts ('convex -> data'; precedent: httpAccountMerge.ts already imports @/data/location-tracking/constants). leave-contract.ts is imported by src/data/convex/api-contract.ts and leave-door.ts (same zone) and convex/httpLocation.ts ('convex -> data'). It must not import @/transport, because convex may not import the transport zone. MAP_CLAIM_REVOKE_BATCH in src/data/maps/access-contract.ts is imported by src/composition/map-access-projection.ts ('composition -> data') and convex/httpMapAccess.ts ('convex -> data'; the module already supplies MAP_ROLES). userPurgeBodySchema in convex/lib is imported only from inside the convex zone.

**API sketch.**

```ts
// src/data/location-tracking/constants.ts
export const MERGE_TRACKING_LIMIT = 1000;
// src/data/location-tracking/merge-contract.ts (zod only)
export const trackingSelectionFields = {
  mapId: z.string().min(1),
  characterId: z.number().int().positive(),
  lastProcessedTransitionAt: z.number().nonnegative().optional(),
};
export const trackingReceiptCandidateFields = { receiptId: z.string().min(1), operationId: z.string().min(1) };
export type TrackingSelection = z.infer<z.ZodObject<typeof trackingSelectionFields>>;
// src/data/convex/leave-contract.ts (zod only)
export const leaveSyncTabFields = { dataset: z.literal('characterLocation'), tabId: z.string().min(8).max(64) };
// src/data/maps/access-contract.ts
export const MAP_CLAIM_REVOKE_BATCH = 32;
// convex/lib/httpAuth.ts
export const userPurgeBodySchema = z.object({ userId: z.string(), characterId: z.number().nullable() });
// Next responses wrap with z.strictObject(fields); Convex requests wrap with z.object(fields); Next bodies use `satisfies`
```

**Migration steps.**

1. Location-tracking merge, first because it has the real drift: add MERGE_TRACKING_LIMIT to constants.ts and create merge-contract.ts. In merge.ts, build the snapshot response with z.array(z.strictObject(trackingSelectionFields)).max(MERGE_TRACKING_LIMIT) and receipts with z.strictObject(trackingReceiptCandidateFields). In convex/httpAccountMerge.ts, use z.object(trackingSelectionFields) and z.object(trackingReceiptCandidateFields). In convex/accountMerge.ts, import MERGE_TRACKING_LIMIT. Optionally replace the TrackingSelection and TrackingReceiptCandidate interfaces with the inferred types; schema.ts may import the type.
2. Leave sync: create src/data/convex/leave-contract.ts with leaveSyncTabFields. api-contract.ts: leaveSyncRequestSchema = z.strictObject(leaveSyncTabFields). convex/httpLocation.ts: z.object({ userId: z.string().min(1), ...leaveSyncTabFields }). leave-door.ts: type the input as `{ readonly userId: string } & z.infer<typeof leaveSyncRequestSchema>`.
3. Revoke batch: export MAP_CLAIM_REVOKE_BATCH from src/data/maps/access-contract.ts and use it at map-access-projection.ts:294 and :298 and in convex/httpMapAccess.ts:46.
4. Purge body: move the duplicated schema to convex/lib/httpAuth.ts as userPurgeBodySchema and use it in convex/httpLocation.ts and convex/httpEngine.ts.
5. Leave the error classes, postConvexHttpDoor's signature and the local postDoor binders unchanged. Where a Next body should be checked against the shared shape, use `body: {...} satisfies ...` at the call site instead of adding a request generic to postConvexHttpDoor.

**Tests.** Guarding tests: src/data/location-tracking/merge.test.ts, convex/httpAccountMerge.test.ts (116 snapshot selection round trip), src/data/convex/leave-door.test.ts, src/app/api/sync-leave/route.test.ts, convex/httpLocation.test.ts, convex/httpEngine.test.ts, src/composition/map-access-projection.test.ts (84-97 batches of 32), convex/httpMapAccess.test.ts. New tests: a merge.test.ts case where a snapshot with a negative lastProcessedTransitionAt is rejected as LocationTrackingMergeError (the agreed behavior); a contract test that one TrackingSelection fixture parses through both the Next snapshot schema and the Convex restore schema; a leave-contract test that the Convex body schema accepts every body the Next schema accepts plus userId.

**Notes.** Drift resolution: nonnegative on lastProcessedTransitionAt is correct, because a selection the restore door would reject must not be snapshotted and queued. With the shared fields, the snapshot then fails fast instead of the restore retrying forever. Keep the strictness split: Next validates Convex responses with strictObject (unknown keys rejected), while Convex request schemas use z.object (unknown keys stripped). Sharing a field shape, not a finished schema, preserves both. A pure zod module imported by Convex must stay free of Next, transport, drizzle and node imports, because Convex bundles it. That is why leave-contract.ts cannot be api-contract.ts, which imports @/transport/endpoint. Out of scope here: the remaining doors (jump, elimination, projection, map-tracking snapshot) also split their contracts but show no duplication or drift today; extend this pattern to them only when one is edited.

<sub>Reported by: area:composition, area:data-services, concern:request-pipeline.</sub>

← [Wave 13: Industry planner and wormhole-sites verticals](wave-13-industry-planner-and-wormhole-sites-verticals.md) · [Index](README.md#roadmap) · [Wave 15: Mapper client: canvas, tracking, scanner and authoring](wave-15-mapper-client-canvas-tracking-scanner-and.md) →
