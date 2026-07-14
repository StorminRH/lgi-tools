ALTER TABLE "gsc_url_inspection" ADD COLUMN "sitemap_url_count" integer;

WITH "daily_counts" AS (
	SELECT "inspection_date", count(*)::integer AS "expected"
	FROM "gsc_url_inspection"
	GROUP BY "inspection_date"
)
UPDATE "gsc_url_inspection" AS "inspection"
SET "sitemap_url_count" = "daily_counts"."expected"
FROM "daily_counts"
WHERE "inspection"."inspection_date" = "daily_counts"."inspection_date";

ALTER TABLE "gsc_url_inspection" ALTER COLUMN "sitemap_url_count" SET NOT NULL;
