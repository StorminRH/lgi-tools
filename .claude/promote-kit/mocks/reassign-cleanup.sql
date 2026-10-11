-- Removes everything reassign-seed.sql creates, wherever the moved account ended up. Local DB only.
begin;
drop trigger if exists kit_refuse_source_update on "user";
drop function if exists kit_refuse_source_update();
delete from account where provider_id = 'eve' and account_id in ('9100011', '9100012');
delete from "user" where id = 'kit-source';
delete from characters where character_id in (9100011, 9100012);
commit;
