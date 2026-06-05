CREATE TABLE "gsc_search_analytics" (
	"date" date NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position" double precision NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gsc_search_analytics_date_dimension_key_pk" PRIMARY KEY("date","dimension","key")
);
--> statement-breakpoint
CREATE TABLE "gsc_sitemaps" (
	"path" text PRIMARY KEY NOT NULL,
	"last_submitted" timestamp with time zone,
	"last_downloaded" timestamp with time zone,
	"is_pending" boolean DEFAULT false NOT NULL,
	"is_sitemaps_index" boolean DEFAULT false NOT NULL,
	"type" text,
	"warnings" bigint DEFAULT 0 NOT NULL,
	"errors" bigint DEFAULT 0 NOT NULL,
	"submitted" bigint DEFAULT 0 NOT NULL,
	"indexed" bigint DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_url_inspection" (
	"url" text PRIMARY KEY NOT NULL,
	"verdict" text,
	"coverage_state" text,
	"robots_txt_state" text,
	"indexing_state" text,
	"page_fetch_state" text,
	"last_crawl_time" timestamp with time zone,
	"google_canonical" text,
	"user_canonical" text,
	"crawled_as" text,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gsc_search_analytics_dimension_date_idx" ON "gsc_search_analytics" USING btree ("dimension","date");