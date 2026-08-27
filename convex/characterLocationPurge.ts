import { internalMutation } from './_generated/server';
import { purgeScopeArgs } from './lib/syncFields';

/**
 * Explicit teardown for a Neon-side account/character purge. characterId null
 * tears down the whole user (account-nuke): every characterLocation doc,
 * held online-probe row, access lease, and mapTracking row for that user. A number tears
 * down one character. Idempotent: deleting absent rows is a no-op.
 */
export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: async (ctx, { userId, characterId }) => {
    // One indexed, user-bounded read per table (by_user_character prefix on
    // userId — a purge is rare and a user's rows are few), then the scope
    // narrows in JS: a single-character purge keeps only that character.
    const scoped = <D extends { characterId: number }>(docs: D[]) =>
      characterId === null ? docs : docs.filter((doc) => doc.characterId === characterId);

    const locations = scoped(
      await ctx.db.query('characterLocation').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const heldOnline = scoped(
      await ctx.db.query('characterLocationOnline').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const tracking = scoped(
      await ctx.db.query('mapTracking').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const accessLeases = scoped(
      await ctx.db.query('characterLocationAccess').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const covered = scoped(
      await ctx.db.query('characterLocationCovered').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );

    for (const doc of locations) await ctx.db.delete(doc._id);
    for (const doc of heldOnline) await ctx.db.delete(doc._id);
    for (const doc of tracking) await ctx.db.delete(doc._id);
    for (const doc of accessLeases) await ctx.db.delete(doc._id);
    for (const doc of covered) await ctx.db.delete(doc._id);

    // Jump-bookkeeping stamps are character-keyed and deliberately survive
    // untrack/retrack, but an account/character purge removes the character
    // from the platform — the stamps' double-count protection no longer
    // applies, so they purge here. Account-nuke (characterId null) drains the
    // characters this purge could still enumerate from its own rows.
    const stampCharacterIds =
      characterId !== null
        ? [characterId]
        : [
            ...new Set(
              [...locations, ...tracking].map((doc) => doc.characterId),
            ),
          ];
    let deletedBookkeeping = 0;
    for (const stampCharacterId of stampCharacterIds) {
      const stamps = await ctx.db
        .query('mapJumpBookkeeping')
        .withIndex('by_character', (q) =>
          q.eq('characterId', stampCharacterId),
        )
        .collect();
      for (const doc of stamps) {
        await ctx.db.delete(doc._id);
        deletedBookkeeping += 1;
      }
    }
    return {
      deletedLocations: locations.length,
      deletedTracking: tracking.length,
      deletedBookkeeping,
    };
  },
});
