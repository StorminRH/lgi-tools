CREATE TABLE "eve_entity_names" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text,
	"category" text,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
