-- Seller who unlinked their main on staging: the user's synthetic email still names 9100001,
-- but its only EVE link is 9100002. Run at the start of EACH side. Local DB only.
\ir kit-auth-cleanup.sql
begin;
insert into "user" (id, name, email, email_verified, image, role, active_character_id, created_at, updated_at)
values ('kit-seller', 'Kit Seller Alt', '9100001@eve.invalid', true,
        'https://images.evetech.net/characters/9100002/portrait?size=128', 'USER', 9100002,
        (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days');
insert into account (id, account_id, provider_id, user_id, owner_hash, scope, created_at, updated_at, authorization_next_check_at)
values ('kit-seller-alt', '9100002', 'eve', 'kit-seller', 'kit-seller-hash', 'publicData',
        (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days',
        (now() at time zone 'utc') + interval '7 days');
insert into characters (character_id, name, portrait_url, created_at, updated_at, last_login_at) values
  (9100001, 'Kit Seller Main', 'https://images.evetech.net/characters/9100001/portrait?size=128',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days'),
  (9100002, 'Kit Seller Alt', 'https://images.evetech.net/characters/9100002/portrait?size=128',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days');
commit;
