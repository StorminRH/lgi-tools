-- Unlinking a character used to leave the user's synthetic email naming it, and
-- Better Auth then linked a later sign-in as that character back onto the user
-- by email. Implicit linking is now off, unlinks repair the email and each EVE
-- sign-in repairs any user whose email still names that character; this repairs
-- the rows older code left behind in one pass. Users are never deleted here: a
-- user with no link left keeps its placeholder.
--
-- Phase 1 parks every user whose '<digits>@eve.invalid' email names a character
-- it no longer has on its own placeholder, which no sign-in can match. Parking
-- them all first frees every stale address, so phase 2 cannot trip the unique
-- email index on a chain or cycle of stale users.
UPDATE "user" u
SET "email" = 'unlinked-' || u."id" || '@eve.invalid', "updated_at" = now()
WHERE u."email" ~ '^[0-9]+@eve\.invalid$'
  AND NOT EXISTS (
    SELECT 1
    FROM "account" a
    WHERE a."user_id" = u."id"
      AND a."provider_id" = 'eve'
      AND a."account_id" = split_part(u."email", '@', 1)
  );
--> statement-breakpoint
-- Phase 2 gives each parked user with a parseable EVE link the synthetic email
-- of its oldest one, as the unlink repair does. Phase 1 has freed every such
-- address; the guard only keeps the placeholder, rather than failing the deploy,
-- if a sign-in on the live deployment took the address in between.
UPDATE "user" u
SET "email" = oldest."account_id" || '@eve.invalid', "updated_at" = now()
FROM (
  SELECT DISTINCT ON (a."user_id") a."user_id", a."account_id"
  FROM "account" a
  WHERE a."provider_id" = 'eve' AND a."account_id" ~ '^[0-9]+$'
  ORDER BY a."user_id", a."created_at" ASC, a."id" ASC
) oldest
WHERE u."id" = oldest."user_id"
  AND u."email" = 'unlinked-' || u."id" || '@eve.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM "user" t WHERE t."email" = oldest."account_id" || '@eve.invalid'
  );
