CREATE TABLE "map_blocks" (
	"map_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"user_id" text,
	"blocked_by_user_id" text,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_blocks" ADD CONSTRAINT "map_blocks_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_blocks" ADD CONSTRAINT "map_blocks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_blocks_map_character_unique" ON "map_blocks" USING btree ("map_id","character_id");--> statement-breakpoint
CREATE INDEX "map_blocks_character_idx" ON "map_blocks" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "map_blocks_user_idx" ON "map_blocks" USING btree ("user_id");