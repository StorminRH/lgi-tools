CREATE TABLE "map_block_accounts" (
	"block_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "map_block_accounts_block_id_user_id_pk" PRIMARY KEY("block_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "map_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"blocked_by_user_id" text,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_block_accounts" ADD CONSTRAINT "map_block_accounts_block_id_map_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."map_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_block_accounts" ADD CONSTRAINT "map_block_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_blocks" ADD CONSTRAINT "map_blocks_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_block_accounts_user_idx" ON "map_block_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_blocks_map_character_unique" ON "map_blocks" USING btree ("map_id","character_id");--> statement-breakpoint
CREATE INDEX "map_blocks_character_idx" ON "map_blocks" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "map_blocks_blocked_by_idx" ON "map_blocks" USING btree ("blocked_by_user_id");