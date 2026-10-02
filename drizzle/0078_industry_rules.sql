CREATE TABLE "industry_assembly_lines" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"activity_id" integer NOT NULL,
	"category_ids" integer[] NOT NULL,
	"group_ids" integer[] NOT NULL,
	"type_list_ids" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_installation_types" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"assembly_line_ids" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_modifiers" (
	"source_type_id" integer NOT NULL,
	"activity" text NOT NULL,
	"kind" text NOT NULL,
	"attribute_id" integer NOT NULL,
	"filter_id" integer,
	"factor_high" double precision NOT NULL,
	"factor_low" double precision NOT NULL,
	"factor_null" double precision NOT NULL,
	CONSTRAINT "industry_modifiers_source_type_id_activity_kind_attribute_id_pk" PRIMARY KEY("source_type_id","activity","kind","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "industry_target_filters" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_ids" integer[] NOT NULL,
	"group_ids" integer[] NOT NULL
);
