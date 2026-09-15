CREATE TABLE "map_access_changes" (
	"map_id" uuid PRIMARY KEY NOT NULL,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_access_changes_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "maps" ("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "map_access_grantee_idx" ON "map_access" ("owner_type", "owner_id");
--> statement-breakpoint
-- Reconcile existing grants once, including departures learned before durable invalidation existed.
INSERT INTO "map_access_changes" ("map_id")
SELECT DISTINCT "map_id" FROM "map_access" WHERE "owner_type" = 'corporation';
