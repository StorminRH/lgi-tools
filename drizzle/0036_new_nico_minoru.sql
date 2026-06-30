CREATE TABLE "corp_structure_rigs" (
	"corporation_id" bigint NOT NULL,
	"structure_id" bigint NOT NULL,
	"rig_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corp_structure_rigs_corporation_id_structure_id_pk" PRIMARY KEY("corporation_id","structure_id")
);
--> statement-breakpoint
CREATE TABLE "corp_structure_sharing" (
	"corporation_id" bigint PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"set_by" bigint,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
