-- Version 2.7.1 — drop persisted combat stats. The numbers are now computed
-- live in src/data/npc-stats from raw EVE SDE attributes. Ordered carefully:
-- backfill `npcs.type_id` from `sleeper_archetypes` before dropping either
-- the columns or the archetype table they pull from.

-- 1. Add the new join key, nullable for the backfill window.
ALTER TABLE "npcs" ADD COLUMN "type_id" integer;
--> statement-breakpoint

-- 2. Backfill via the existing sleeper_name → type_id mapping captured in
-- sleeper_archetypes. The name match is the same one historical-seed used.
UPDATE "npcs"
SET "type_id" = sa."type_id"
FROM "sleeper_archetypes" sa
WHERE "npcs"."sleeper_name" = sa."name";
--> statement-breakpoint

-- 3. Fail loudly if any NPC didn't get a type_id — the table is meant to be
-- fully covered. Better to abort the migration than ship a half-backfilled
-- npcs table that fails silently when the live compute looks it up.
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count FROM "npcs" WHERE "type_id" IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'npcs.type_id backfill incomplete: % rows still NULL', missing_count;
  END IF;
END $$;
--> statement-breakpoint

-- 4. Now that the backfill is verified, lock type_id NOT NULL.
ALTER TABLE "npcs" ALTER COLUMN "type_id" SET NOT NULL;
--> statement-breakpoint

-- 5. Drop the per-NPC cached stat columns. Combat math reads from
-- dgm_type_attributes via npc-stats/queries.ts going forward.
ALTER TABLE "npcs"
  DROP COLUMN "dps",
  DROP COLUMN "alpha",
  DROP COLUMN "ehp",
  DROP COLUMN "scram",
  DROP COLUMN "web",
  DROP COLUMN "neut",
  DROP COLUMN "rrep",
  DROP COLUMN "sig",
  DROP COLUMN "speed",
  DROP COLUMN "distance",
  DROP COLUMN "velocity";
--> statement-breakpoint

-- 6. Drop the per-wave aggregate columns too — same reasoning, recomputed
-- via summariseWave() over the live per-NPC stats.
ALTER TABLE "waves"
  DROP COLUMN "dps_total",
  DROP COLUMN "alpha_total",
  DROP COLUMN "ehp_total",
  DROP COLUMN "ew_scram",
  DROP COLUMN "ew_web",
  DROP COLUMN "ew_neut",
  DROP COLUMN "ew_rrep";
--> statement-breakpoint

-- 7. Sleeper archetypes table goes too. The JSON snapshot in
-- src/data/npc-stats/__fixtures__/sleeper-archetypes.json stays as the
-- math test fixture and as the historical baseline.
DROP TABLE "sleeper_archetypes";
