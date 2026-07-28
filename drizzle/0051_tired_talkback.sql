CREATE TYPE "public"."map_access_owner_type" AS ENUM('character', 'corporation');--> statement-breakpoint
CREATE TYPE "public"."map_role" AS ENUM('viewer', 'editor', 'owner');--> statement-breakpoint
CREATE TABLE "map_access" (
	"map_id" uuid NOT NULL,
	"owner_type" "map_access_owner_type" NOT NULL,
	"owner_id" bigint NOT NULL,
	"role" "map_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "map_access" ADD CONSTRAINT "map_access_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_access_map_grantee_unique" ON "map_access" USING btree ("map_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "maps_user_id_idx" ON "maps" USING btree ("user_id");