import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Flip-only present+online rows. A document exists only while the owner's
 * last location run covered this character. No bookkeeping fields — insert
 * or delete when the boolean changes, never on a per-run stamp.
 */
export async function applyCoverageSet(
  ctx: MutationCtx,
  userId: string,
  enumeratedCharacterIds: readonly number[],
  coveredCharacterIds: readonly number[],
): Promise<void> {
  const enumerated = new Set(enumeratedCharacterIds);
  const covered = new Set(coveredCharacterIds);
  const existing = await ctx.db
    .query('characterLocationCovered')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  const held = new Set(existing.map((doc) => doc.characterId));

  for (const doc of existing) {
    const want = enumerated.has(doc.characterId) && covered.has(doc.characterId);
    if (!want) await ctx.db.delete(doc._id);
  }
  for (const characterId of covered) {
    if (!enumerated.has(characterId) || held.has(characterId)) continue;
    await ctx.db.insert('characterLocationCovered', { userId, characterId });
  }
}

/** Tab-close / engine-cold: drop every coverage row for this owner. */
export async function clearCoverageForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const existing = await ctx.db
    .query('characterLocationCovered')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const doc of existing) await ctx.db.delete(doc._id);
}

/** Unique coverage row for one owner-character, or null when uncovered. */
export async function findCoverage(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  characterId: number,
) {
  return ctx.db
    .query('characterLocationCovered')
    .withIndex('by_user_character', (q) =>
      q.eq('userId', userId).eq('characterId', characterId),
    )
    .unique();
}
