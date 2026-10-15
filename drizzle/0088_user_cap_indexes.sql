CREATE INDEX "custom_structures_user_idx" ON "custom_structures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "industry_profiles_user_live_idx" ON "industry_profiles" USING btree ("user_id") WHERE "industry_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "saved_plans_user_idx" ON "saved_plans" USING btree ("user_id");