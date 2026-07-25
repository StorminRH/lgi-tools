-- 3.10.2.3 — owned_assets natural-key uniqueness.
--
-- The owned-assets refresh is a replace-all sequence (delete the owner's rows,
-- insert the fresh set, stamp the sync row) that runs on the transaction-free
-- neon-http driver. Two concurrent refreshes for one owner — an on-view refresh
-- racing the drain worker — can interleave their delete and insert and silently
-- double the ledger the industry planner sums. The ESI projection already
-- aggregates by (owner_type, owner_id, type_id, location_id, location_flag,
-- location_type) before every write (src/features/owned-assets/esi-projection.ts),
-- so a duplicate on that key is by-construction invalid data: this index can only
-- reject a write that was already wrong. Its loser is caught as a unique
-- violation and reported as 'superseded' rather than retried.
--
-- The dedup DELETE below is a defensive no-op. The duplicate-group query
-- returned zero rows in local development AND on the operator-run read-only
-- production check before this migration shipped; it exists only to absorb a
-- duplicate created by a race between that check and this deploy. It keeps the
-- highest id per natural key, which is the most recently inserted row.
--
-- `owned_assets_owner_idx` is dropped rather than kept: it indexed
-- (owner_type, owner_id, type_id), which is a leading-column prefix of the new
-- unique index, so both the per-owner read and the planner's bounded per-type
-- lookup are still served. Keeping it would duplicate the index this migration
-- ships.
--
-- CREATE UNIQUE INDEX runs non-CONCURRENTLY because the migrator wraps each
-- migration in a transaction. It briefly write-locks owned_assets; the table
-- holds per-owner aggregated holdings (thousands of rows at current scale), so
-- the lock window is sub-second on the deploy path.
DELETE FROM "owned_assets" a
USING "owned_assets" b
WHERE a."owner_type" = b."owner_type"
  AND a."owner_id" = b."owner_id"
  AND a."type_id" = b."type_id"
  AND a."location_id" = b."location_id"
  AND a."location_flag" = b."location_flag"
  AND a."location_type" = b."location_type"
  AND a."id" < b."id";--> statement-breakpoint
DROP INDEX "owned_assets_owner_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "owned_assets_natural_key_unique" ON "owned_assets" USING btree ("owner_type","owner_id","type_id","location_id","location_flag","location_type");
