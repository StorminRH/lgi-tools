// Prompt per-character projection teardown (3.7.1.3). When the EVE owner-hash
// check on the Neon side detects a transferred character, the prior owner's live
// projections must be torn down IMMEDIATELY — not left for the next lazy orphan
// sweep (applySyncResults' enumerated-set cleanup). This is that prompt path: the
// Neon reconcile POSTs to the bearer-gated /purge-character HTTP action (http.ts),
// which runs this mutation. The lazy cleanup remains the safety net if the prompt
// call never lands (Convex down, etc.).
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

// Delete every per-character projection doc for one (user, character) pair across
// both trackers. `.collect()` (not `.first()`) so a purge is thorough even if a
// duplicate doc ever slipped past the apply path's keying. Returns per-table
// delete counts for the caller's observability.
export const purgeCharacter = internalMutation({
  args: { userId: v.string(), characterId: v.number() },
  handler: async (ctx, { userId, characterId }) => {
    const skillDocs = await ctx.db
      .query('characterSync')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', userId).eq('characterId', characterId),
      )
      .collect();
    for (const doc of skillDocs) await ctx.db.delete(doc._id);

    const jobDocs = await ctx.db
      .query('industryJobsSync')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', userId).eq('characterId', characterId),
      )
      .collect();
    for (const doc of jobDocs) await ctx.db.delete(doc._id);

    return { skills: skillDocs.length, jobs: jobDocs.length };
  },
});
