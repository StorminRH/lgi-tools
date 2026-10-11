-- P012: put the E2E Pilot's character into the state that reads "Verification delayed":
-- a refresh token (placeholder; it never decrypts, nothing can send it to EVE), every EVE_SCOPE
-- granted (so no "Missing scopes"), and an authorization failure that began more than 24 hours
-- ago (isAuthorizationDelayed). The next check is pushed out so no checker picks it up meanwhile.
-- Restore with: ./db.sh restore account id mocks/p012-account-before.csv
update public.account
   set refresh_token = 'review-kit-placeholder-not-a-token',
       scope = 'esi-search.search_structures.v1 publicData esi-skills.read_skills.v1 esi-skills.read_skillqueue.v1 esi-industry.read_character_jobs.v1 esi-characters.read_corporation_roles.v1 esi-industry.read_corporation_jobs.v1 esi-characters.read_blueprints.v1 esi-corporations.read_blueprints.v1 esi-assets.read_assets.v1 esi-assets.read_corporation_assets.v1 esi-location.read_online.v1 esi-location.read_location.v1 esi-location.read_ship_type.v1 esi-corporations.read_structures.v1 esi-wallet.read_character_wallet.v1 esi-clones.read_clones.v1 esi-clones.read_implants.v1 esi-universe.read_structures.v1 esi-markets.read_character_orders.v1 esi-corporations.read_divisions.v1 esi-corporations.track_members.v1',
       authorization_failure_first_at = (now() at time zone 'utc') - interval '2 days',
       authorization_failure_count = 6,
       authorization_next_check_at = (now() at time zone 'utc') + interval '7 days'
 where id = 'e2e-eve-9000001' and user_id = 'e2e-pilot';
