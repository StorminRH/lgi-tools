CREATE TABLE "character_sheets" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL
);
