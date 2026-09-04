## Session LGI-71 — Neon maps hide reads lifecycle_status

**Sub-version:** leftover
**Master plan:** Linear LGI-53 Store cutovers / Thursday — LGI-71
**UX gate:** No
**Execution profile:** Frontier autonomous coding agent
**Delivery unit:** One agent session, land each Ordered work step on development
**Roadmap coverage:** LGI-53 Thursday leftover. Flip Neon map hide/list/active/purge readers onto `lifecycle_status` after Origin #48 expand. Keep timestamp dual-write. LGI-73 exclusivity CHECK and column drop wait.
**Internal phases:** 1. Rebase onto Origin #114 and name reader predicates; 2. Flip `queries.ts` list, subject, admin, and publish readers; 3. Flip `lifecycle.ts` writer WHERE clauses and the Convex projection status gate
**Split triggers:** Origin #114 already flipped these readers; landing readers requires the exclusivity CHECK; a live row exists whose `lifecycle_status` disagrees with timestamps in a way 0059 did not backfill

## 1. Objective

Hide, live list, trash list, active-admin, publish, and purge readers decide map phase from `lifecycle_status`. Writers keep dual-writing the timestamp columns. This is the migrate step of the Neon maps expand-migrate-contract. LGI-73 is the contract step.

## 2. Current context and dependencies

- **DEP-1:** Origin #48 expand landed. `drizzle/0059_maps_lifecycle_status.sql` added `map_lifecycle_status` and `lifecycle_entered_at`, backfilled status from the four timestamps, and writers dual-write. List, hide, restore, purge-now, claim, tombstone, publish, and access-subject readers still reconstruct phase from `archived_at` / `tombstoned_at` / `purge_*`.
- **DEP-2:** Origin draft #114 (`stormin/maps-leftover-batch-a61b`) is open on `src/data/maps/queries.ts`, `lifecycle.ts`, `lifecycle-contract.ts`, and `queries.db.test.ts`. It folds some writer SET bags onto contract deltas and adds `affectedMapIdsForCharacter`. It does not flip readers. LGI-74 owns those leftovers.
- **DEP-3:** LGI-73 owns the exclusivity CHECK, stopping timestamp dual-write, and dropping unread timestamp columns. It starts after this session's readers are on status.
- **DEP-4:** Staged create inserts `lifecycle_status = 'purge_queued'` with `archived_at` and `purge_requested_at` set. `projectStagedMapAccess` passes `allowArchived=true` so that row can still project. Live list must stay empty for that row.
- **DEP-5:** Migration 0059 filled `lifecycle_status` from timestamps. The column is `NOT NULL DEFAULT 'active'`. A tombstoned row may have `archived_at` null. `schema.db.test.ts` already encodes that pair.

## 3. Done conditions

- **DC-1:** Live catalogue and active-admin grant gates include a map only when `lifecycle_status` is `active`.
- **DC-2:** Trash / restorable hide list includes a map only when `lifecycle_status` is `archived` and `lifecycle_entered_at` is inside the 30-day grace window.
- **DC-3:** Archive, restore, purge-now, publish, claim, and tombstone WHERE clauses match on `lifecycle_status` (and status-owned time), not on `archived_at` / `tombstoned_at` nullness.
- **DC-4:** `getMapAccessSubject` omits tombstoned maps by status. Convex claim projection empties on a non-active map unless the staged-create allow flag is on. Staged `purge_queued` create still projects.
- **DC-5:** Every writer SET and INSERT that already dual-writes timestamps and status still does so. No exclusivity CHECK. No column drop.
- **DC-6:** When status and timestamps disagree, readers follow status.

## 4. In scope

- **IS-1:** Named reader predicates on the exclusive-status contract.
- **IS-2:** Live list, trash list, access-subject, active-admin, and publish WHERE readers in `src/data/maps/queries.ts`.
- **IS-3:** Archive, restore, purge-now, claim, and tombstone WHERE readers in `src/data/maps/lifecycle.ts`. Writer SET clauses stay dual-write.
- **IS-4:** `MapAccessSubject` plus `computeMapAccessClaimsForState` status gate in `src/composition/map-access-projection.ts`.
- **IS-5:** Retargeted db and unit tests, including status-vs-timestamp disagreement.

## 5. Out of scope

- **OOS-1:** LGI-73 exclusivity CHECK, stopping dual-write, and dropping `archived_at` / `tombstoned_at` / unread `purge_*` columns.
- **OOS-2:** Origin #114 leftovers. Do not fold archive/restore raw SQL onto contract helpers. Do not hoist `SignatureProvider` setters. Do not add or reshape `affectedMapIdsForCharacter`.
- **OOS-3:** Atlas UI, `DeletedRestorableMapRow.archivedAt` DTO removal, and trash-window copy.
- **OOS-4:** `src/data/maps/access.ts` role math, `src/data/maps/purge.ts` account wipe, `authorization-sql.ts` body (callers only), Convex schema and HTTP doors.
- **OOS-5:** `compensateFailedMapCreation` ownership read on `purge_claimed_at`. That is not a hide/list/active reader.

## 6. Hard constraints

- **HC-1:** Keep dual-write. Archive, restore, purge-now, claim, tombstone, staged create, and publish SET/INSERT still write the timestamp columns they write today (or after the #114 rebase, the timestamp columns those SET bags still include).
- **HC-2:** Fallow zones stay deny-by-default. No new cross-layer exceptions.
- **HC-3:** Rebase onto Origin #114 head `stormin/maps-leftover-batch-a61b` (or post-merge `development` if #114 has landed) before any reader-flip edit. Do not implement #114 leftovers.
- **HC-4:** Staged create remains `purge_queued` from birth. `projectStagedMapAccess` must still be able to project that row. Live list must still omit it.
- **HC-5:** A tombstoned map with `archived_at` null stays omitted from the access subject and from live list. Status wins.

## 7. Decisions the session plan must resolve

- **PD-1:** Where named reader predicates live, and whether list and raw-SQL CTE callers share one export.
- **PD-2:** Which timestamp remaining readers may use for grace and staged-hold windows after the status flip.
- **PD-3:** How `getMapAccessSubject` and `allowArchived` become a status gate without breaking staged create.
- **PD-4:** What changes on writer functions (WHERE only vs SET).
- **PD-5:** How claim eligibility and tombstone eligibility split once status is exclusive, given today's shared `purgeEligibility` still matches after claim because timestamps are left set.

## 8. Acceptance criteria

- **AC-1:** `listAuthorizedMapsForPrincipals` and `activeMapsAdminSelection` return only `lifecycle_status = 'active'` rows, including a row whose timestamps still look archived or tombstoned — proving DC-1 and DC-6.
- **AC-2:** `listDeletedRestorableMapsForPrincipals` returns only in-grace `archived` rows keyed on `lifecycle_entered_at`, and omits `purge_queued`, `purge_claimed`, and `tombstoned` — proving DC-2.
- **AC-3:** Archive matches `active`, restore and purge-now match in-grace `archived`, publish matches `purge_queued`, claim matches `archived` past grace or `purge_queued` past hold, tombstone matches `purge_claimed` — proving DC-3.
- **AC-4:** `getMapAccessSubject` returns null for `tombstoned`. Projection emits no claims for non-active maps when the allow flag is off, and still projects a staged `purge_queued` row when the flag is on — proving DC-4.
- **AC-5:** Writer SET/INSERT still write timestamps next to status. Schema still has the timestamp columns. No new CHECK. No new drop migration — proving DC-5.
- **AC-6:** Focused disagreement seeds (active + archived_at set, tombstoned + archived_at null, archived + archived_at null) follow status — proving DC-6.

## 9. Verification

- **V-1:** Existing maps query and lifecycle db tests, retargeted so list/hide/restore/purge/publish assert status predicates.
- **V-2:** New disagreement cases in those db suites.
- **V-3:** Inspection that writer SET/INSERT still dual-write and that reader WHERE clauses no longer gate on `archived_at IS NULL` / `tombstoned_at IS NULL`.
- **V-4:** `map-access-projection` unit and db tests for the status gate and staged-create allow path.

## 10. UX/operator gates

UX gate is No. This is a Neon reader flip. Catalogue and trash membership change only when status and timestamps already disagree. No Atlas chrome or copy change. No visual look. No dedicated `ux-check` step.

## 11. Baseline/hotspot boundary

Pressure concentrates on `src/data/maps/queries.ts`, `src/data/maps/lifecycle.ts`, `src/data/maps/lifecycle-contract.ts`, and `src/composition/map-access-projection.ts`. Do not grow Atlas UI or Convex schema in this session.

## 12. Close-out behavior

Each Ordered work step lands on `development`. The session plan may become `Complete` after the last Ordered work step of this contract. Promote starts at 80 app-facing files versus `staging` (shown as n/100). Close-out does not re-run a visual pause. LGI-73 stays unstarted until these readers are on status.
