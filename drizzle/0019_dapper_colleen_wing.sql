ALTER TABLE "user" ADD COLUMN "active_character_id" bigint;
--> statement-breakpoint
-- Backfill (3.4.2): point each existing user at their oldest linked EVE
-- character, so the active-character resolver has a concrete value before anyone
-- switches. DISTINCT ON picks the earliest-linked account per user; the IS NULL
-- guard makes a re-run a no-op. account_id is TEXT, cast to bigint to match the
-- new column. Today every user has exactly one linked character, so this just
-- seeds that one.
UPDATE "user" u
SET "active_character_id" = sub."account_id"::bigint
FROM (
  SELECT DISTINCT ON (a."user_id") a."user_id", a."account_id"
  FROM "account" a
  WHERE a."provider_id" = 'eve'
  ORDER BY a."user_id", a."created_at" ASC
) sub
WHERE u."id" = sub."user_id" AND u."active_character_id" IS NULL;
