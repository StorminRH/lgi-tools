-- Removes every row the takeover / stale-holder shots create. Local DB only.
-- Deleting a user cascades to its sessions and accounts.
begin;
delete from "user" where id in (
  select user_id from account where provider_id = 'eve'
    and account_id in ('9100001','9100002','9100003','9100004','9100005'));
delete from "user" where id like 'kit-%' or email like '91000%@eve.invalid';
delete from characters where character_id between 9100001 and 9100005;
commit;
