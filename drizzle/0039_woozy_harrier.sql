ALTER TABLE "character_skills" ADD COLUMN "skill_levels" jsonb;--> statement-breakpoint
-- Clear the held skills etags so every character's next on-view refresh re-fetches
-- the /skills body instead of 304-replaying it; without this an unchanged character
-- would never populate the new skill_levels column. queue_etag is untouched.
UPDATE "character_skill_syncs" SET "skills_etag" = NULL;
