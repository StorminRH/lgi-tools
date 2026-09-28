CREATE TABLE "map_access_changes" (
	"map_id" uuid PRIMARY KEY NOT NULL,
	"version" uuid DEFAULT gen_random_uuid() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_access_changes" ADD CONSTRAINT "map_access_changes_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_access_changes_queued_idx" ON "map_access_changes" USING btree ("queued_at","map_id");--> statement-breakpoint
CREATE INDEX "characters_corporation_id_idx" ON "characters" USING btree ("corporation_id");--> statement-breakpoint
CREATE INDEX "map_access_grantee_idx" ON "map_access" USING btree ("owner_type","owner_id");--> statement-breakpoint
INSERT INTO "map_access_changes" ("map_id")
SELECT DISTINCT "map_id" FROM "map_access" WHERE "owner_type" = 'corporation';