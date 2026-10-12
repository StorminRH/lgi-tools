-- The response store (0085) decides freshness from CCP's Expires. Before it,
-- each dataset kept its own stamp and a fixed window from the dataset
-- registry, with its ETags beside the stamp. This copies those into
-- esi_responses so the release makes no burst of ESI calls: every stored
-- answer keeps the expiry it would have had under the old window, and the
-- ETags still earn a 304. `checked_at` is the old stamp. A row the store has
-- already written wins (ON CONFLICT DO NOTHING), so running this twice
-- changes nothing.
--
-- The old windows, from the registry as it stood before the store: skills
-- 120 s; industry jobs 300 s; assets, blueprints, structures, corp context,
-- roles and affiliations 3600 s; sheet tiers 120 s, 3600 s and 86400 s.
-- Prices and history already carry CCP's expiry in stale_after.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT r.route, 'character'::"public"."esi_response_holder", s."character_id", '', '',
       s."last_refreshed_at" + interval '120 seconds',
       array_remove(ARRAY[r.etag], NULL),
       s."last_refreshed_at"
FROM "character_skill_syncs" s
CROSS JOIN LATERAL (VALUES
  ('/characters/{character_id}/skills/', s."skills_etag"),
  ('/characters/{character_id}/skillqueue/', s."queue_etag")
) AS r(route, etag)
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/characters/{character_id}/industry/jobs/', 'character'::"public"."esi_response_holder", s."character_id", '', '',
       s."last_refreshed_at" + interval '300 seconds',
       array_remove(ARRAY[s."jobs_etag"], NULL),
       s."last_refreshed_at"
FROM "character_industry_job_syncs" s
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- Corp industry jobs are stored per user and corporation, so the holder is
-- the corporation with user_id set.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/corporations/{corporation_id}/industry/jobs/', 'corporation'::"public"."esi_response_holder", s."corporation_id", s."user_id", '',
       s."last_refreshed_at" + interval '300 seconds',
       array_remove(ARRAY[s."jobs_etag"], NULL),
       s."last_refreshed_at"
FROM "corp_industry_job_syncs" s
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- The paged owner reads kept one ETag per page as a jsonb array.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT CASE s."owner_type"::text WHEN 'character' THEN '/characters/{character_id}/assets/' ELSE '/corporations/{corporation_id}/assets/' END,
       s."owner_type"::text::"public"."esi_response_holder", s."owner_id", '', '',
       s."last_refreshed_at" + interval '3600 seconds',
       array_remove(ARRAY(SELECT jsonb_array_elements_text(s."page_etags")), NULL),
       s."last_refreshed_at"
FROM "owned_asset_syncs" s
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT CASE s."owner_type"::text WHEN 'character' THEN '/characters/{character_id}/blueprints/' ELSE '/corporations/{corporation_id}/blueprints/' END,
       s."owner_type"::text::"public"."esi_response_holder", s."owner_id", '', '',
       s."last_refreshed_at" + interval '3600 seconds',
       array_remove(ARRAY(SELECT jsonb_array_elements_text(s."page_etags")), NULL),
       s."last_refreshed_at"
FROM "owned_blueprint_syncs" s
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/corporations/{corporation_id}/structures/', 'corporation'::"public"."esi_response_holder", s."corporation_id", '', '',
       s."last_refreshed_at" + interval '3600 seconds',
       array_remove(ARRAY(SELECT jsonb_array_elements_text(s."page_etags")), NULL),
       s."last_refreshed_at"
FROM "corp_structure_syncs" s
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- The corp context pass read three routes under one stamp and kept no ETags.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT r.route, 'corporation'::"public"."esi_response_holder", p."corporation_id", '', '',
       p."last_refreshed_at" + interval '3600 seconds',
       '{}'::text[],
       p."last_refreshed_at"
FROM "corp_profiles" p
CROSS JOIN (VALUES
  ('/corporations/{corporation_id}/'),
  ('/corporations/{corporation_id}/divisions/'),
  ('/corporations/{corporation_id}/membertracking/')
) AS r(route)
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/characters/{character_id}/roles/', 'character'::"public"."esi_response_holder", m."character_id", '', '',
       m."fetched_at" + interval '3600 seconds',
       '{}'::text[],
       m."fetched_at"
FROM "corp_member_roles" m
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- affiliation_refreshed_at has no time zone and was always written as UTC.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/characters/affiliation/', 'character'::"public"."esi_response_holder", c."character_id", '', '',
       (c."affiliation_refreshed_at" AT TIME ZONE 'UTC') + interval '3600 seconds',
       '{}'::text[],
       c."affiliation_refreshed_at" AT TIME ZONE 'UTC'
FROM "characters" c
WHERE c."affiliation_refreshed_at" IS NOT NULL
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- Each sheet section carries its own stamp and, when written before the
-- store, an ETag per part. A denied section made no read, so it has no
-- answer to carry. The journal is never read conditionally, so its ETag is
-- not carried.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT p.route, 'character'::"public"."esi_response_holder", s."character_id", '', '',
       (s."sections" -> p.section ->> 'refreshedAt')::timestamptz + make_interval(secs => p.ttl_seconds),
       array_remove(ARRAY[s."sections" -> p.section -> 'etags' ->> p.part], NULL),
       (s."sections" -> p.section ->> 'refreshedAt')::timestamptz
FROM "character_sheets" s
CROSS JOIN (VALUES
  ('profile', 'character', '/characters/{character_id}/', 86400),
  ('status', 'location', '/characters/{character_id}/location/', 120),
  ('status', 'ship', '/characters/{character_id}/ship/', 120),
  ('status', 'online', '/characters/{character_id}/online/', 120),
  ('attributes', 'attributes', '/characters/{character_id}/attributes/', 120),
  ('implants', 'implants', '/characters/{character_id}/implants/', 120),
  ('clones', 'clones', '/characters/{character_id}/clones/', 120),
  ('wallet', 'balance', '/characters/{character_id}/wallet/', 120),
  ('journal', NULL, '/characters/{character_id}/wallet/journal/', 3600),
  ('orders', 'orders', '/characters/{character_id}/orders/', 3600)
) AS p(section, part, route, ttl_seconds)
WHERE s."sections" -> p.section ->> 'refreshedAt' IS NOT NULL
  AND (s."sections" -> p.section ->> 'denied')::boolean IS DISTINCT FROM true
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
-- Prices and history are keyed per type under The Forge, with the query the
-- store canonicalises (sorted names). They kept no ETags, so an expired row
-- would tell the store nothing a missing row does not; only live expiries
-- are carried. Placeholder and Fuzzwork rows are due at once and stay out.
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/markets/{region_id}/orders/', 'global'::"public"."esi_response_holder", 0, '',
       'order_type=all&region_id=10000002&type_id=' || p."type_id",
       p."stale_after",
       '{}'::text[],
       p."updated_at"
FROM "market_prices" p
WHERE p."stale_after" > now()
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
--> statement-breakpoint
INSERT INTO "esi_responses" ("route", "holder_type", "holder_id", "user_id", "params", "expires_at", "etags", "checked_at")
SELECT '/markets/{region_id}/history/', 'global'::"public"."esi_response_holder", 0, '',
       'region_id=10000002&type_id=' || m."type_id",
       m."stale_after",
       '{}'::text[],
       m."updated_at"
FROM "market_history_meta" m
WHERE m."stale_after" > now()
ON CONFLICT ("route", "holder_type", "holder_id", "user_id", "params") DO NOTHING;
