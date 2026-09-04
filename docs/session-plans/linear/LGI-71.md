# Session LGI-71 Implementation Plan — Readers flip onto lifecycle_status

**Plan status:** Approved
**Approved:** 2026-09-04
**Contract:** `docs/session-contracts/linear/LGI-71.md`
**Contract digest:** `sha256:abf522162165a454a628b541b59bc92a4595a85d781731f9f14304c8e2862ad4`
**Planning standard:** `docs/workflows/schema/session-plan.md`
**Proof standard:** Atomic
**Execution status:** Pending
**Baseline effect:** Neutral

## Bottom line (READ FIRST)

- **GOAL:** Neon map hide, live list, trash list, active-admin, publish, and purge readers decide phase from `lifecycle_status`, while every writer still dual-writes the timestamp columns Origin #48 added the status next to.
- **DONE =** SC-1 through SC-7 below, plus this observable: a map whose `lifecycle_status` is `archived` is gone from the live catalogue and present in trash even if `archived_at` is null, and a map whose status is `active` stays on the live catalogue even if `archived_at` is set.
- **OUT OF SCOPE:**
  - LGI-73 exclusivity CHECK, stopping dual-write, and dropping timestamp columns (Contract OOS-1).
  - Origin #114 leftovers: archive/restore SQL fold, SignatureProvider hoist, `affectedMapIdsForCharacter` (Contract OOS-2).

<hard_constraints>

- **Contract HC-1:** Keep dual-write. Implementation consequence: archive, restore, purge-now, claim, tombstone, staged create, and publish SET/INSERT still write the timestamp columns they write on the rebased head. Verification: `SC-5.1` greps those SET/INSERT sites for both `lifecycle_status` and the timestamp columns they already write.
- **Contract HC-2:** Fallow zones stay deny-by-default. No new cross-layer exceptions. Reader predicates stay in `src/data/maps`. Projection stays in `src/composition`. `SC-7.3` runs Fallow.
- **Contract HC-3:** Rebase onto Origin #114 head `stormin/maps-leftover-batch-a61b` (or post-merge `development` if #114 has landed) before any reader-flip edit. Do not implement #114 leftovers. Ordered work step 1 is that rebase. Later steps edit only WHERE / reader predicates.
- **Contract HC-4:** Staged create remains `purge_queued` from birth. `projectStagedMapAccess` still projects that row. Live list still omits it. `SC-4.3` and `SC-1.2`.
- **Contract HC-5:** A tombstoned map with `archived_at` null stays omitted from the access subject and from live list. Status wins. `SC-4.2` and `SC-6.2`.
- **Plan:** Named reader predicates live in `src/data/maps/lifecycle-contract.ts` next to the writer bags. List callers and raw-SQL CTE callers share those exports. No new `lifecycle-predicates.ts`.
- **Plan:** Grace for restorable `archived` uses `lifecycle_entered_at`. Staged hold stays on `created_at`. Claim order uses `lifecycle_entered_at`. Trash DTO still selects `archivedAt` until LGI-73.
- **Plan:** `purgeEligibility` splits. Claim matches `archived` past grace or `purge_queued` past hold. Tombstone matches `purge_claimed` only. One shared helper that still matches after claim would re-select already-claimed rows once status is exclusive.
- **Plan:** Writer functions change WHERE only. SET/INSERT meaning stays the #114-rebased dual-write. Do not fold archive/restore raw SQL onto contract helpers.

</hard_constraints>

**Branch:** `development` · **ends in PR:** yes · **gate:** each Ordered work step lands an Origin draft against `development` after a green local test suite on the rebased #114 (or post-merge) head

**Contract UX gate:** `No` · **required pause:** None

## Read first

- `AGENTS.md`, `src/AGENTS.md`
- `docs/session-contracts/linear/LGI-71.md`
- `src/data/maps/queries.ts` (`listAuthorizedMapsForPrincipals`, `listDeletedRestorableMapsForPrincipals`, `getMapAccessSubject`, `activeMapsAdminSelection`, `publishCreatedMap`)
- `src/data/maps/lifecycle.ts` (`archiveAuthorizedMap`, `restoreAuthorizedMap`, `requestAuthorizedMapPurge`, `purgeEligibility`, `tombstonePurgedMap`)
- `src/data/maps/lifecycle-contract.ts` and `src/composition/map-access-projection.ts`

## Current state and prerequisites

| Contract input | Live verdict | Evidence | Execution consequence |
| --- | --- | --- | --- |
| `DEP-1` | `Verified` | Origin #48 merged 2026-08-30. `drizzle/0059_maps_lifecycle_status.sql` creates `map_lifecycle_status`, adds `lifecycle_status` / `lifecycle_entered_at`, backfills from timestamps. Live `development` `@ bfaed296`: `listAuthorizedMapsForPrincipals` still passes `and(isNull(maps.archivedAt), isNull(maps.tombstonedAt))` (`queries.ts:360`). `activeMapsAdminSelection` still uses `sql\`${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL\`` (`queries.ts:477`). `archiveAuthorizedMap` WHERE is the same pair (`lifecycle.ts:53`). Writers already SET `lifecycle_status`. | Step 1 rebases. Steps 3 to 5 replace those predicates with status equality. SET clauses stay. |
| `DEP-2` | `Verified` | Origin #114 draft, version 3, head `4c8ca3eb`, base `bfaed296`. Diff on the overlap files: `lifecycle-contract.ts` turns `purgeQueuedMapLifecycle` / `tombstonedMapLifecycle` into deltas (no invented `archivedAt`) and adds `purgeClaimedMapLifecycle`. `lifecycle.ts` spreads those bags on purge-now / claim / tombstone SET only. `queries.ts` adds `affectedMapIdsForCharacter`. `queries.db.test.ts` stacks `archivedMapLifecycle` then the delta bag. Readers are untouched. LGI-74 owns the leftovers. | Step 1 rebases onto that head or post-merge `development`. Do not re-implement those SET folds or the character helper. After rebase, predicate helpers land on the delta bag shapes. |
| `DEP-3` | `Verified` | LGI-73 Linear: exclusivity CHECK, stop dual-write, drop unread timestamp columns, fold leftover raw-SQL archive/restore. Sequenced after LGI-71. No CHECK in `schema.ts` or `0059`. | Do not add CHECK, drop, or SET-only writes. Handoff names LGI-73. |
| `DEP-4` | `Verified` | `createMapAtomic` INSERT writes `archived_at`, `purge_requested_at`, `lifecycle_status='purge_queued'` (`queries.ts:285-291`). `projectStagedMapAccess` calls `projectMapAccessState(..., true)` (`map-access-projection.ts:183`). `computeMapAccessClaimsForState` skips when `map.archivedAt !== null && !allowArchived` (`:70`). | Live list flips to `status = 'active'`, so staged rows stay omitted. Projection gate flips to `status !== 'active' && !allowArchived`. Keep the allow flag. Do not treat every non-active status as one blob. |
| `DEP-5` | `Verified` | `0059` CASE backfill. `schema.ts:61-66` column is `notNull().default('active')`. `schema.db.test.ts:201-215` inserts `lifecycleStatus: 'tombstoned'`, `archivedAt: null`, and expects `getMapAccessSubject` null. | Disagreement proofs are required. Default `'active'` means a missed semantic backfill would look live to a status reader. 0059 already ran. New tests seed the disagreeing pairs, they do not re-run 0059. |

## Why now

Origin #48 made phase a single enum and left readers on four nullable timestamps so an old binary could keep writing. That overlap is over. Hide still asks `archived_at IS NULL`. A tombstoned row with a null `archived_at` is the pair the expand already allowed. Until readers follow status, trash, live list, grant mutate, and Convex claims can disagree with the column writers already maintain. LGI-73 cannot install the CHECK or drop columns until these readers move.

## Scope (the destination)

When this session is complete, every hide/list/active/purge reader names a `lifecycle_status` value. Grace for a restorable archived map is `lifecycle_entered_at` inside 30 days. Staged create still starts `purge_queued` and still projects through `projectStagedMapAccess`. Claim no longer shares a helper with tombstone. Writers still dual-write. The trash DTO still carries `archivedAt`. Atlas chrome is unchanged.

### Scope coverage

| Contract boundary | Implementation mapping or protection |
| --- | --- |
| `IS-1` Named reader predicates | Step 2 adds them on `lifecycle-contract.ts`. Drizzle `eq` / `ne` / `and` / `gt` / `lte` for query builders. Matching `sql\`${maps.lifecycleStatus} = …\`` fragments for `authorizedAdminMapsSelection`. |
| `IS-2` `queries.ts` readers | Steps 3 and 4, same file in order: live/trash list, then subject + admin + publish WHERE. |
| `IS-3` `lifecycle.ts` writer WHERE | Step 5. SET clauses untouched except what #114 already changed. |
| `IS-4` Access subject + projection | Step 4 adds `lifecycleStatus` on `MapAccessSubject`. Step 6 flips `computeMapAccessClaimsForState`. |
| `IS-5` Tests including disagreement | Travels with the step that owns the reader. Step 6 adds the remaining disagreement seeds if steps 3 to 5 did not already cover them. |
| `OOS-1` LGI-73 CHECK / drop / stop dual-write | No new drizzle migration. `schema.ts` columns stay. `SC-5.2`. |
| `OOS-2` #114 leftovers | Step 1 rebase only. Reviewers reject archive/restore SQL rewrite, SignatureProvider edits, and a second `affectedMapIdsForCharacter`. |
| `OOS-3` Atlas UI / trash DTO drop | `DeletedRestorableMapRow.archivedAt` stays. No `TrashWindow` / `MapCatalogue` edits. |
| `OOS-4` access.ts, purge.ts, authorization-sql body, Convex schema | `authorizedAdminMapsSelection` stays parameterized. Account wipe stays unfiltered. |
| `OOS-5` `compensateFailedMapCreation` | Still reads `purge_claimed_at` for create-failure ownership. |

## Resolved implementation decisions

- **Contract PD-1 — where named reader predicates live: `src/data/maps/lifecycle-contract.ts`, one export per predicate, used by both Drizzle `where` and raw-SQL CTE callers.** The exclusive-status contract already owns the writer bags. Readers belong next to them so a later LGI-73 edit has one file. Export `activeLifecycleCondition`, `restorableArchivedLifecycleCondition(now)`, `notTombstonedLifecycleCondition`, `purgeQueuedLifecycleCondition`, `claimPurgeEligibility(now)`, and `tombstonePurgeEligibility`, plus `activeLifecycleSql` for `authorizedAdminMapsSelection` (`sql\`${maps.lifecycleStatus} = 'active'\`` interpolating the Drizzle column). **Rejected:** a new `lifecycle-predicates.ts`. One consumer family. Extract only for a real second consumer. **Rejected:** inline `eq` at each call site. That is the leftover.
- **Contract PD-2 — grace and hold after the flip: restorable grace uses `lifecycle_entered_at`; staged hold stays on `created_at`; claim order uses `lifecycle_entered_at`.** `lifecycle_entered_at` is when the row entered its current status. For `archived` that is the hide instant, which is what grace means. Staged hold is already a `created_at` window on a row born `purge_queued`. Trash rows still select `archivedAt` for `DeletedRestorableMapRow`. **Rejected:** keep grace on `archived_at`. That leaves a timestamp reader in the hide path. **Rejected:** drop `archivedAt` from the DTO. LGI-73.
- **Contract PD-3 — access subject and `allowArchived`: WHERE is `ne(lifecycleStatus, 'tombstoned')`; the DTO gains `lifecycleStatus` and keeps `archivedAt`; the JS gate becomes `lifecycleStatus !== 'active' && !allowArchived`.** `projectStagedMapAccess` keeps `allowArchived=true`. The flag name stays. It already means "allow a non-live subject so staged create can project." **Rejected:** drop `archivedAt` from `MapAccessSubject` this session. Extra DTO churn. **Rejected:** treat every non-active status as forbidden without the allow flag on staged create. That breaks `projectStagedMapAccess`. **Rejected:** `inArray` of four live statuses on the subject. `ne(..., 'tombstoned')` is the current "row exists for projection" meaning.
- **Contract PD-4 — writer functions change WHERE only.** Archive WHERE becomes `active`. Restore and purge-now WHERE become in-grace `archived` on `lifecycle_entered_at`. Publish WHERE becomes `purge_queued`. Claim and tombstone WHERE use the split helpers from PD-5. SET/INSERT stay the rebased dual-write. After #114, `purgeQueuedMapLifecycle(now)` is a delta (status, entered_at, purgeRequestedAt) and does not invent `archivedAt`. Do not revert that. **Rejected:** status-only SET. LGI-73. **Rejected:** rewrite archive/restore CTE SQL as Drizzle `.update` against the contract. #114 / LGI-74 judged the literals byte-identical and left them.
- **Contract PD-5 — claim and tombstone eligibility split.** Today `purgeEligibility` is timestamp-based and still matches after claim because `archived_at` and `purge_requested_at` stay set. `tombstonePurgedMap` ANDs `purgeClaimedAt IS NOT NULL` onto that helper. After the flip, claim must not see `purge_claimed`. Claim: `(status = 'archived' AND lifecycle_entered_at <= now - 30d) OR (status = 'purge_queued' AND created_at <= now - 30s)`. Tombstone: `status = 'purge_claimed'`. Claim candidate order: `asc(lifecycleEnteredAt), asc(id)`. **Rejected:** one helper that ORs `archived | purge_queued | purge_claimed`. Claim would re-select already-claimed rows. **Rejected:** keep tombstone on the old timestamp helper plus `purgeClaimedAt`. That is still a timestamp reader.

### Audit-remediation mapping

Not applicable — audit-remediation is retired.

## Design pressure and baseline effect

### Hotspot proximity

- **Touched measured surfaces:** Contract §11 names `queries.ts`, `lifecycle.ts`, `lifecycle-contract.ts`, and `map-access-projection.ts`. All four are touched. `authorization-sql.ts` is not (argument only).
- **Live proximity evidence:** `queries.ts` 653 lines, `lifecycle.ts` 219, `lifecycle-contract.ts` 50, `map-access-projection.ts` 208. #114 already edits the first three on an open draft. Verdict: inside those four files, adjacent to #114 writer SET folds (rebase, then touch WHERE only). No file crosses 1,000 lines. Do not grow `queries.ts` with a second helper file.

### Preparatory refactor

None. `readAuthorizedMapRows` already takes `lifecycleCondition`. `authorizedAdminMapsSelection` already takes `lifecycleCondition`. The seam is the argument, not a new abstraction.

### Baseline effect and update

- **Effect:** `Neutral` — predicates move from timestamp nullness to enum equality. No path deleted. Dual-write remains. Line count stays flat.
- **Required update:** `None` — code-health baseline tracking is retired.

## Implementation blueprint

### Owned surfaces

- `src/data/maps/lifecycle-contract.ts` — writer bags unchanged in meaning after rebase; new reader predicate exports.
- `src/data/maps/queries.ts` — live list, trash list, access subject, active-admin SQL, publish WHERE. `createMapAtomic` INSERT stays. `compensateFailedMapCreation` stays. `affectedMapIdsForCharacter` is #114's if present after rebase; do not add it here.
- `src/data/maps/lifecycle.ts` — archive / restore / purge-now / claim / tombstone WHERE. SET stays dual-write.
- `src/data/maps/authorization-sql.ts` — unchanged body. Callers pass the new SQL fragment.
- `src/composition/map-access-projection.ts` — JS status gate. `allowArchived` kept.
- Tests: `queries.db.test.ts`, `lifecycle.db.test.ts`, `schema.db.test.ts`, `map-access-projection.test.ts`, `map-access-projection.db.test.ts`. Optional small unit file next to the contract if the predicate exports need a non-db proof.

### Interfaces and contracts

- `activeLifecycleCondition`: `eq(maps.lifecycleStatus, 'active')`.
- `activeLifecycleSql`: `sql\`${maps.lifecycleStatus} = 'active'\``. Same meaning for `authorizedAdminMapsSelection`.
- `restorableArchivedLifecycleCondition(now: Date)`: `and(eq(maps.lifecycleStatus, 'archived'), gt(maps.lifecycleEnteredAt, new Date(now.getTime() - MAP_DELETE_GRACE_MS)))`.
- `notTombstonedLifecycleCondition`: `ne(maps.lifecycleStatus, 'tombstoned')`.
- `purgeQueuedLifecycleCondition`: `eq(maps.lifecycleStatus, 'purge_queued')`.
- `claimPurgeEligibility(now: Date)`: `or(and(eq(status, 'archived'), lte(enteredAt, now - MAP_DELETE_GRACE_MS)), and(eq(status, 'purge_queued'), lte(createdAt, now - MAP_STAGED_PURGE_HOLD_MS)))`.
- `tombstonePurgeEligibility`: `eq(maps.lifecycleStatus, 'purge_claimed')`.
- `MapAccessSubject`: `{ userId: string; archivedAt: Date | null; lifecycleStatus: (typeof MAP_LIFECYCLE_STATUSES)[number] }`.
- `getMapAccessSubject`: SELECT those three fields. WHERE `eq(id, mapId)` and `notTombstonedLifecycleCondition`.
- `computeMapAccessClaimsForState(mapId, allowArchived)`: after subject load, if `lifecycleStatus !== 'active' && !allowArchived` return `[]`.
- `publishCreatedMap` WHERE: `eq(id, mapId)` and `purgeQueuedLifecycleCondition`. Drop the timestamp nullness conjuncts.
- `DeletedRestorableMapRow.archivedAt` unchanged. `readAuthorizedMapRows` still selects `archivedAt` for materialization.
- This session adds predicate exports and `lifecycleStatus` on `MapAccessSubject`. It does not add a new HTTP route or Convex function.

### Control and data flow

1. Atlas catalogue calls `listAuthorizedMapsForPrincipals`. SQL is `lifecycle_status = 'active'`. Staged `purge_queued` and hidden `archived` rows stay out.
2. Trash calls `listDeletedRestorableMapsForPrincipals`. SQL is `lifecycle_status = 'archived'` and `lifecycle_entered_at > now - 30d`. Admin materialization still requires `archivedAt !== null` on the selected payload. Dual-write keeps that column set for a real hide. A disagreement seed with status `archived` and `archivedAt` null is omitted from the DTO by that payload check and is not a trash regression. Live list already omitted it in step 1.
3. Hide (`archiveAuthorizedMap`) authorizes through `activeLifecycleSql`, then SET archived timestamps plus `lifecycle_status = 'archived'` as today.
4. Restore authorizes through restorable-archived SQL on `lifecycle_entered_at`, then SET `activeMapLifecycle`.
5. Purge-now WHERE is creator + restorable archived. SET stays the rebased `purgeQueuedMapLifecycle` delta.
6. Cron claim selects `claimPurgeEligibility`, SET `purge_claimed`. Tombstone WHERE is `purge_claimed`, SET `tombstoned`.
7. Publish WHERE is `purge_queued`, SET `activeMapLifecycle`.
8. Grant mutate uses `activeLifecycleSql` in the admin CTE.
9. Projection loads a non-tombstoned subject. Empty claims when status is not `active` unless `allowArchived` (staged create).

### Edge and failure behavior

- Status `active`, `archived_at` set → live list includes it, trash omits it, grants mutate. Evidence: disagreement test in `queries.db.test.ts`.
- Status `tombstoned`, `archived_at` null → subject null, live list omits, projection `[]`. Evidence: existing `schema.db.test.ts` and `map-access-projection.db.test.ts` cases, retargeted to status WHERE.
- Status `archived`, `archived_at` null → live list omits. Trash DTO omits because `archivedAt` is null. Restore WHERE still matches on status + entered_at if an admin restore is attempted with a seeded entered_at inside grace.
- Staged `purge_queued` inside 30s → claim returns `[]`. After hold → claim returns the id. Publish fails after claim. Live list empty throughout. Projection with allow flag still works before claim.
- Restore at exact grace boundary → false, row stays `archived`. Same as today, time column is `lifecycle_entered_at`.
- Second tombstone on an already-tombstoned row → false, because status is no longer `purge_claimed`.
- Second claim on a `purge_claimed` row → not selected. Tightening vs today's timestamp helper. Required exclusive-status behavior.
- `#114` still open mid-step → stop and rebase again. Do not merge leftover SET folds by hand.

### Ordered work

1. **Rebase onto Origin #114.** Change the working branch so it sits on `stormin/maps-leftover-batch-a61b` (or post-merge `origin/development` if #114 is merged) with no leftover absorption. Prove with `git merge-base --is-ancestor 4c8ca3eb2e65285b1412e2cb5538bcd972c2d143 HEAD` (or the then-current #114 / development tip) exiting 0, `git diff --stat HEAD -- src/mapper/signatures src/data/maps/queries.ts` showing no SignatureProvider rewrite and no extra `affectedMapIdsForCharacter` from this session, and `pnpm vitest run src/data/maps/queries.db.test.ts src/data/maps/lifecycle.db.test.ts` green on the rebased head. Backend; no look.
2. **Named reader predicates exist.** Change `src/data/maps/lifecycle-contract.ts` so the PD-1 exports exist and type-check against `maps.lifecycleStatus`. Prove with `pnpm typecheck` and a focused test or source inspection that `activeLifecycleCondition` is `eq(maps.lifecycleStatus, 'active')` and `claimPurgeEligibility` / `tombstonePurgeEligibility` are distinct. Backend; no look.
3. **Live and trash list readers use status.** Change `listAuthorizedMapsForPrincipals` and `listDeletedRestorableMapsForPrincipals` in `src/data/maps/queries.ts` so they pass `activeLifecycleCondition` and `restorableArchivedLifecycleCondition(now)` into `readAuthorizedMapRows`. Keep selecting `archivedAt`. Prove with `pnpm vitest run src/data/maps/queries.db.test.ts -t "lists live authorized"` and `-t "lists only in-grace archived"`, plus a new disagreement case that an `active` row with `archivedAt` set is listed live and a `tombstoned` row with `archivedAt` null is not. Backend; no look.
4. **Access subject, active-admin, and publish WHERE use status.** Change `getMapAccessSubject`, `activeMapsAdminSelection`, and `publishCreatedMap` in `src/data/maps/queries.ts` so subject WHERE is `notTombstonedLifecycleCondition` and returns `lifecycleStatus`, admin SQL is `activeLifecycleSql`, and publish WHERE is `purgeQueuedLifecycleCondition`. Prove with `pnpm vitest run src/data/maps/schema.db.test.ts -t "omits a tombstoned map"` , `src/data/maps/queries.db.test.ts -t "upserts and revokes"` / `-t "reads management grants"`, and `src/data/maps/lifecycle.db.test.ts -t "gives an elapsed staged purge claim"`. Backend; no look.
5. **Writer WHERE clauses use status.** Change `archiveAuthorizedMap`, `restoreAuthorizedMap`, `requestAuthorizedMapPurge`, claim, and `tombstonePurgedMap` in `src/data/maps/lifecycle.ts` so each WHERE uses the PD-1 / PD-5 helpers. Leave every SET bag as the rebased dual-write. Prove with `pnpm vitest run src/data/maps/lifecycle.db.test.ts` (hide/restore, grace boundary, creator purge-now, staged hold, claim then tombstone). Backend; no look.
6. **Projection gate uses status.** Change `computeMapAccessClaimsForState` in `src/composition/map-access-projection.ts` so it empties on `lifecycleStatus !== 'active'` unless `allowArchived`. Update unit mocks to carry `lifecycleStatus`. Prove with `pnpm vitest run src/composition/map-access-projection.test.ts -t "missing or archived"` and `src/composition/map-access-projection.db.test.ts`, plus `SC-5` dual-write grep and `SC-6` remaining disagreement seeds. Backend; no look.

## Success criteria (agent-runnable — show the output)

- **SC-1 — Contract DC-1 / AC-1 / V-1.** Live list and active-admin grants follow `lifecycle_status = 'active'`.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-1.1` | `pnpm vitest run src/data/maps/queries.db.test.ts -t "lists live authorized"` | Test passes. Archived and tombstoned seeded rows are absent. Created / corporation / direct rows remain in that order. |
  | `SC-1.2` | `pnpm vitest run src/data/maps/queries.db.test.ts src/data/maps/lifecycle.db.test.ts -t "staged"` | Staged `purge_queued` create is absent from `listAuthorizedMapsForPrincipals`. |
  | `SC-1.3` | `pnpm vitest run src/data/maps/queries.db.test.ts -t "upserts and revokes"` | Grant upsert returns `false` after `archivedMapLifecycle` and after `tombstonedMapLifecycle`. |
  | `SC-1.4` | `rg -n -e 'isNull\\(maps\\.archivedAt\\)' -e 'archivedAt} IS NULL' src/data/maps/queries.ts` | No live-list or admin-gate match. Remaining `archivedAt` hits are SELECT / DTO only. |

- **SC-2 — Contract DC-2 / AC-2 / V-1.** Trash list is in-grace `archived` on `lifecycle_entered_at`.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-2.1` | `pnpm vitest run src/data/maps/queries.db.test.ts -t "lists only in-grace archived"` | Test passes. Expired, purge-queued, tombstoned, and viewer-only rows are absent. Created and delegated-admin rows remain. |
  | `SC-2.2` | `rg -n restorableArchivedLifecycleCondition -n lifecycleEnteredAt src/data/maps/queries.ts src/data/maps/lifecycle-contract.ts` | Trash list and restore/purge-now grace use `lifecycleEnteredAt`, not `gt(maps.archivedAt, ...)`. |

- **SC-3 — Contract DC-3 / AC-3 / V-1.** Writer WHERE clauses match status.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-3.1` | `pnpm vitest run src/data/maps/lifecycle.db.test.ts -t "admin delete hides"` | Hide empties live list, fills trash with `archivedAt: NOW`, restore returns `activeMapLifecycle`. |
  | `SC-3.2` | `pnpm vitest run src/data/maps/lifecycle.db.test.ts -t "grace boundary"` | Restore at `NOW + MAP_DELETE_GRACE_MS` is false. Stored row stays `lifecycleStatus: 'archived'`. |
  | `SC-3.3` | `pnpm vitest run src/data/maps/lifecycle.db.test.ts -t "fast-forward grace"` | Only creator purge-now queues. Claim then empties trash. Row remains. |
  | `SC-3.4` | `pnpm vitest run src/data/maps/lifecycle.db.test.ts -t "staged in-flight"` | Claim at `createdAt` is `[]`. Claim after hold returns the id. Tombstone before claim is false. |
  | `SC-3.5` | `pnpm vitest run src/data/maps/lifecycle.db.test.ts -t "selects elapsed grace"` | Claim after grace, tombstone true once, second tombstone false, status `tombstoned`. |
  | `SC-3.6` | `rg -n -e 'archivedAt} IS NULL' -e 'isNull\\(maps\\.tombstonedAt\\)' -e 'isNotNull\\(maps\\.archivedAt\\)' src/data/maps/lifecycle.ts` | No WHERE-gate match. SET lines may still name timestamp columns. |

- **SC-4 — Contract DC-4 / AC-4 / V-4 / HC-4 / HC-5.** Subject and projection follow status. Staged create still projects.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-4.1` | `pnpm vitest run src/data/maps/schema.db.test.ts -t "reads map identity"` | Subject is `{ userId, archivedAt: null, lifecycleStatus: 'active' }`. |
  | `SC-4.2` | `pnpm vitest run src/data/maps/schema.db.test.ts -t "omits a tombstoned map"` | Subject is `null` for `tombstoned` with `archivedAt: null`. |
  | `SC-4.3` | `pnpm vitest run src/composition/map-access-projection.test.ts -t "missing or archived"` | Null subject → `[]`. Subject `{ lifecycleStatus: 'archived', archivedAt: Date }` → `[]` and `getMapGrants` not called. |
  | `SC-4.4` | `pnpm vitest run src/composition/map-access-projection.db.test.ts` | Archived contract bag → `[]`. Tombstoned + null `archivedAt` → `[]`. |
  | `SC-4.5` | `rg -n allowArchived src/composition/map-access-projection.ts` | `projectStagedMapAccess` still passes `true`. Gate reads `lifecycleStatus`, not `archivedAt !== null`. |

- **SC-5 — Contract DC-5 / AC-5 / V-3 / HC-1 / OOS-1.** Dual-write remains. No CHECK. No column drop.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-5.1` | `rg -n -e lifecycle_status -e lifecycleStatus -e archived_at -e archivedAt -e tombstoned_at -e tombstonedAt src/data/maps/lifecycle.ts src/data/maps/queries.ts src/data/maps/lifecycle-contract.ts` | Archive/restore/create/publish/purge SET or bags still mention both status and the timestamp columns they wrote on the rebased head. |
  | `SC-5.2` | `rg -n -e 'CHECK' -e 'DROP COLUMN' drizzle/src/data/maps/schema.ts` | No new exclusivity CHECK and no drop of `archived_at` / `tombstoned_at`. `0059` stays the latest lifecycle migration. |
  | `SC-5.3` | `pnpm vitest run src/data/maps/queries.db.test.ts -t "creates a map and selected grants"` | Inserted staged row still has `archivedAt` Date, `purgeRequestedAt` Date, `lifecycleStatus: 'purge_queued'`. |

- **SC-6 — Contract DC-6 / AC-6 / V-2.** Status wins when timestamps disagree.

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-6.1` | `pnpm vitest run src/data/maps/queries.db.test.ts -t "status wins"` | `active` + `archivedAt` set is on the live list. `tombstoned` + `archivedAt` null is not. `archived` + `archivedAt` set + entered_at inside grace is on the trash list. |
  | `SC-6.2` | `pnpm vitest run src/data/maps/schema.db.test.ts -t "omits a tombstoned map" src/composition/map-access-projection.db.test.ts -t "archived_at is null"` | Subject and claims stay empty for tombstoned + null `archivedAt`. |

- **SC-7 — Repository gates and hard constraints.**

  | Proof | Evidence action | Required observable |
  | --- | --- | --- |
  | `SC-7.1` | `pnpm typecheck && pnpm lint` | Both exit 0. |
  | `SC-7.2` | `pnpm test` | Green. |
  | `SC-7.3` | `pnpm exec fallow dead-code && pnpm exec fallow dead-code --production && pnpm exec fallow dupes && pnpm exec fallow health --fail-on-issues` | Exit 0. |
  | `SC-7.4` | `rg -n -e SignatureProvider -e bindConnectionSetters -e affectedMapIdsForCharacter --glob '!*.md' $(git diff --name-only origin/development)` | Either no hits, or the only hits are files #114 already owned and this session did not add. |

## End of session

- Confirm every `DONE =` item is evidenced and every `hard_constraints` boundary held.
- **Delivery:** land each Ordered work step as an Origin draft against `development` from the rebased #114 (or post-merge) head. `ends in PR` is yes. Do not open a promote or release PR.
- **Lifecycle artifacts:** this plan's `Execution status` stays `Pending` until the last Ordered work step; set `Complete` in that land. No changelog and no `APP_VERSION` bump. As-built records the #114 rebase SHA and the claim/tombstone split.
- **Handoff:** rerun `python3 tools/cli.py lifecycle resolve --pretty` if the operator is on a version clock; otherwise comment LGI-71 Done and leave LGI-73 unstarted. The next maps-lifecycle session is LGI-73 and must not start until these readers are on status.
