CREATE TABLE "blueprint_flat_materials" (
	"blueprint_type_id" integer NOT NULL,
	"raw_material_type_id" integer NOT NULL,
	"total_quantity" bigint NOT NULL,
	CONSTRAINT "blueprint_flat_materials_blueprint_type_id_raw_material_type_id_pk" PRIMARY KEY("blueprint_type_id","raw_material_type_id")
);
--> statement-breakpoint
CREATE TABLE "blueprint_trees" (
	"blueprint_type_id" integer PRIMARY KEY NOT NULL,
	"tree_json" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eve_data_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_activities" (
	"blueprint_type_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"time_seconds" integer NOT NULL,
	CONSTRAINT "industry_activities_blueprint_type_id_activity_id_pk" PRIMARY KEY("blueprint_type_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "industry_activity_materials" (
	"blueprint_type_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"material_type_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "industry_activity_materials_blueprint_type_id_activity_id_material_type_id_pk" PRIMARY KEY("blueprint_type_id","activity_id","material_type_id")
);
--> statement-breakpoint
CREATE TABLE "industry_activity_products" (
	"blueprint_type_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"product_type_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"probability" double precision,
	CONSTRAINT "industry_activity_products_blueprint_type_id_activity_id_product_type_id_pk" PRIMARY KEY("blueprint_type_id","activity_id","product_type_id")
);
--> statement-breakpoint
CREATE TABLE "industry_blueprints" (
	"blueprint_type_id" integer PRIMARY KEY NOT NULL,
	"max_production_limit" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blueprint_flat_materials" ADD CONSTRAINT "blueprint_flat_materials_blueprint_type_id_industry_blueprints_blueprint_type_id_fk" FOREIGN KEY ("blueprint_type_id") REFERENCES "public"."industry_blueprints"("blueprint_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_trees" ADD CONSTRAINT "blueprint_trees_blueprint_type_id_industry_blueprints_blueprint_type_id_fk" FOREIGN KEY ("blueprint_type_id") REFERENCES "public"."industry_blueprints"("blueprint_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_activities" ADD CONSTRAINT "industry_activities_blueprint_type_id_industry_blueprints_blueprint_type_id_fk" FOREIGN KEY ("blueprint_type_id") REFERENCES "public"."industry_blueprints"("blueprint_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_activity_materials" ADD CONSTRAINT "industry_activity_materials_blueprint_type_id_activity_id_industry_activities_blueprint_type_id_activity_id_fk" FOREIGN KEY ("blueprint_type_id","activity_id") REFERENCES "public"."industry_activities"("blueprint_type_id","activity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_activity_products" ADD CONSTRAINT "industry_activity_products_blueprint_type_id_activity_id_industry_activities_blueprint_type_id_activity_id_fk" FOREIGN KEY ("blueprint_type_id","activity_id") REFERENCES "public"."industry_activities"("blueprint_type_id","activity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blueprint_flat_materials_blueprint_idx" ON "blueprint_flat_materials" USING btree ("blueprint_type_id");--> statement-breakpoint
CREATE INDEX "industry_activity_materials_material_idx" ON "industry_activity_materials" USING btree ("material_type_id");--> statement-breakpoint
CREATE INDEX "industry_activity_products_product_idx" ON "industry_activity_products" USING btree ("product_type_id");