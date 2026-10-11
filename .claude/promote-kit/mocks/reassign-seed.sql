-- kit-source holds two characters; the admin reassigns 'Kit Source Moved' (9100012) to themselves.
-- The source's email names 9100012, so the tidy-up must rewrite the source user row, and the
-- trigger below refuses any UPDATE of kit-source (a stand-in for a database error there).
-- Run at the start of EACH side. Local DB only.
begin;
delete from account where provider_id = 'eve' and account_id in ('9100011', '9100012');
delete from "user" where id = 'kit-source';
delete from characters where character_id in (9100011, 9100012);
insert into "user" (id, name, email, email_verified, image, role, active_character_id, created_at, updated_at)
values ('kit-source', 'Kit Source Main', '9100012@eve.invalid', true,
        'https://images.evetech.net/characters/9100011/portrait?size=128', 'USER', 9100011,
        (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days');
insert into account (id, account_id, provider_id, user_id, owner_hash, scope, created_at, updated_at, authorization_next_check_at) values
  ('kit-source-main', '9100011', 'eve', 'kit-source', 'kit-source-hash', 'publicData',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') + interval '7 days'),
  ('kit-source-moved', '9100012', 'eve', 'kit-source', 'kit-source-hash', 'publicData',
   (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') + interval '7 days');
insert into characters (character_id, name, portrait_url, created_at, updated_at, last_login_at) values
  (9100011, 'Kit Source Main', 'https://images.evetech.net/characters/9100011/portrait?size=128',
   (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days', (now() at time zone 'utc') - interval '30 days'),
  (9100012, 'Kit Source Moved', 'https://images.evetech.net/characters/9100012/portrait?size=128',
   (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days', (now() at time zone 'utc') - interval '20 days');
create or replace function kit_refuse_source_update() returns trigger language plpgsql as $$
begin
  raise exception 'review kit: refusing UPDATE of user kit-source (simulated tidy-up failure)';
end $$;
drop trigger if exists kit_refuse_source_update on "user";
create trigger kit_refuse_source_update before update on "user"
  for each row when (old.id = 'kit-source') execute function kit_refuse_source_update();
commit;
