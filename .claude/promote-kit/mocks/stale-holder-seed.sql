-- A seller who unlinked 9100003 on staging (kit-stale still holds 9100003@eve.invalid) and a
-- buyer (kit-buyer) who then added 9100003 under Settings. Run at the start of EACH side. Local DB only.
\ir kit-auth-cleanup.sql
begin;
insert into "user" (id, name, email, email_verified, image, role, active_character_id, created_at, updated_at) values
  ('kit-stale', 'Kit Stale Other', '9100003@eve.invalid', true,
   'https://images.evetech.net/characters/9100005/portrait?size=128', 'USER', 9100005,
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days'),
  ('kit-buyer', 'Kit Buyer Main', '9100004@eve.invalid', true,
   'https://images.evetech.net/characters/9100004/portrait?size=128', 'USER', 9100004,
   (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days');
insert into account (id, account_id, provider_id, user_id, owner_hash, scope, created_at, updated_at, authorization_next_check_at) values
  ('kit-stale-other', '9100005', 'eve', 'kit-stale', 'kit-stale-hash', 'publicData',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') + interval '7 days'),
  ('kit-buyer-main', '9100004', 'eve', 'kit-buyer', 'kit-buyer-hash', 'publicData',
   (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') + interval '7 days'),
  ('kit-buyer-bought', '9100003', 'eve', 'kit-buyer', 'kit-buyer-hash', 'publicData',
   (now() at time zone 'utc') - interval '2 days', (now() at time zone 'utc') - interval '2 days', (now() at time zone 'utc') + interval '7 days');
insert into characters (character_id, name, portrait_url, created_at, updated_at, last_login_at) values
  (9100003, 'Kit Bought Char', 'https://images.evetech.net/characters/9100003/portrait?size=128',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '2 days', (now() at time zone 'utc') - interval '2 days'),
  (9100004, 'Kit Buyer Main', 'https://images.evetech.net/characters/9100004/portrait?size=128',
   (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days'),
  (9100005, 'Kit Stale Other', 'https://images.evetech.net/characters/9100005/portrait?size=128',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days');
commit;
