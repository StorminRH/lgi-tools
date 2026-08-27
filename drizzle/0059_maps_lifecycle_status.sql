CREATE TYPE "public"."map_lifecycle_status" AS ENUM('active', 'archived', 'purge_queued', 'purge_claimed', 'tombstoned');--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "lifecycle_status" "map_lifecycle_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "lifecycle_entered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "maps" SET
  "lifecycle_status" = CASE
    WHEN "tombstoned_at" IS NOT NULL THEN 'tombstoned'::"public"."map_lifecycle_status"
    WHEN "purge_claimed_at" IS NOT NULL THEN 'purge_claimed'::"public"."map_lifecycle_status"
    WHEN "purge_requested_at" IS NOT NULL THEN 'purge_queued'::"public"."map_lifecycle_status"
    WHEN "archived_at" IS NOT NULL THEN 'archived'::"public"."map_lifecycle_status"
    ELSE 'active'::"public"."map_lifecycle_status"
  END,
  "lifecycle_entered_at" = CASE
    WHEN "tombstoned_at" IS NOT NULL THEN "tombstoned_at"
    WHEN "purge_claimed_at" IS NOT NULL THEN "purge_claimed_at"
    WHEN "purge_requested_at" IS NOT NULL THEN "purge_requested_at"
    WHEN "archived_at" IS NOT NULL THEN "archived_at"
    ELSE "created_at"
  END,
  "archived_at" = CASE
    WHEN "tombstoned_at" IS NOT NULL THEN "archived_at"
    WHEN "purge_claimed_at" IS NOT NULL THEN COALESCE("archived_at", "purge_claimed_at")
    WHEN "purge_requested_at" IS NOT NULL THEN COALESCE("archived_at", "purge_requested_at")
    WHEN "archived_at" IS NOT NULL THEN "archived_at"
    ELSE NULL
  END,
  "purge_requested_at" = CASE
    WHEN "tombstoned_at" IS NOT NULL OR "purge_claimed_at" IS NOT NULL OR "purge_requested_at" IS NOT NULL
      THEN "purge_requested_at"
    ELSE NULL
  END,
  "purge_claimed_at" = CASE
    WHEN "tombstoned_at" IS NOT NULL OR "purge_claimed_at" IS NOT NULL THEN "purge_claimed_at"
    ELSE NULL
  END;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_lifecycle_status" CHECK (
        (
          "maps"."lifecycle_status" = 'active'
          AND "maps"."archived_at" IS NULL
          AND "maps"."purge_requested_at" IS NULL
          AND "maps"."purge_claimed_at" IS NULL
          AND "maps"."tombstoned_at" IS NULL
        ) OR (
          "maps"."lifecycle_status" = 'archived'
          AND "maps"."archived_at" IS NOT NULL
          AND "maps"."archived_at" = "maps"."lifecycle_entered_at"
          AND "maps"."purge_requested_at" IS NULL
          AND "maps"."purge_claimed_at" IS NULL
          AND "maps"."tombstoned_at" IS NULL
        ) OR (
          "maps"."lifecycle_status" = 'purge_queued'
          AND "maps"."archived_at" IS NOT NULL
          AND "maps"."purge_requested_at" IS NOT NULL
          AND "maps"."purge_requested_at" = "maps"."lifecycle_entered_at"
          AND "maps"."purge_claimed_at" IS NULL
          AND "maps"."tombstoned_at" IS NULL
        ) OR (
          "maps"."lifecycle_status" = 'purge_claimed'
          AND "maps"."archived_at" IS NOT NULL
          AND "maps"."purge_claimed_at" IS NOT NULL
          AND "maps"."purge_claimed_at" = "maps"."lifecycle_entered_at"
          AND "maps"."tombstoned_at" IS NULL
        ) OR (
          "maps"."lifecycle_status" = 'tombstoned'
          AND "maps"."tombstoned_at" IS NOT NULL
          AND "maps"."tombstoned_at" = "maps"."lifecycle_entered_at"
        )
      );
