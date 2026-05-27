CREATE TABLE "dgm_attribute_types" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_id" integer,
	"default_value" double precision,
	"published" boolean NOT NULL,
	"display_name" text,
	"unit_id" integer,
	"stackable" boolean NOT NULL,
	"high_is_good" boolean NOT NULL,
	"category_id" integer
);
--> statement-breakpoint
CREATE TABLE "dgm_type_attributes" (
	"type_id" integer NOT NULL,
	"attribute_id" integer NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "dgm_type_attributes_type_id_attribute_id_pk" PRIMARY KEY("type_id","attribute_id")
);
--> statement-breakpoint
CREATE INDEX "dgm_type_attributes_type_id_idx" ON "dgm_type_attributes" USING btree ("type_id");