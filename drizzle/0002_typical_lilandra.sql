CREATE TABLE "eve_categories" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon_id" integer,
	"published" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_groups" (
	"id" integer PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"icon_id" integer,
	"use_base_price" boolean NOT NULL,
	"anchored" boolean NOT NULL,
	"anchorable" boolean NOT NULL,
	"fittable_non_singleton" boolean NOT NULL,
	"published" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"mass" double precision,
	"volume" double precision,
	"capacity" double precision,
	"portion_size" integer,
	"race_id" integer,
	"base_price" bigint,
	"published" boolean NOT NULL,
	"market_group_id" integer,
	"icon_id" integer,
	"sound_id" integer,
	"graphic_id" integer
);
--> statement-breakpoint
ALTER TABLE "eve_groups" ADD CONSTRAINT "eve_groups_category_id_eve_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."eve_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eve_types" ADD CONSTRAINT "eve_types_group_id_eve_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."eve_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eve_types_name_lower_idx" ON "eve_types" USING btree (lower("name"));