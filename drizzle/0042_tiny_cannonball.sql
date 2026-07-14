ALTER TABLE "gsc_url_inspection" ADD COLUMN "inspection_date" date;--> statement-breakpoint
UPDATE "gsc_url_inspection"
SET "inspection_date" = ("synced_at" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TABLE "gsc_url_inspection" ALTER COLUMN "inspection_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_url_inspection" DROP CONSTRAINT "gsc_url_inspection_pkey";--> statement-breakpoint
ALTER TABLE "gsc_url_inspection" ADD CONSTRAINT "gsc_url_inspection_inspection_date_url_pk" PRIMARY KEY("inspection_date","url");--> statement-breakpoint
CREATE INDEX "gsc_url_inspection_url_date_idx" ON "gsc_url_inspection" USING btree ("url","inspection_date");
