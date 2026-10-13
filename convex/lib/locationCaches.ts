import type { MutationCtx } from '../_generated/server';
import { uniqueByUserCharacter, type UserCharacterTable } from './indexedQuery';

const CHARACTER_CACHE_TABLES = [
  'characterLocation',
  'characterLocationOnline',
  'characterLocationAccess',
] as const satisfies readonly UserCharacterTable[];

export async function deleteCharacterCache(
  ctx: MutationCtx,
  table: Exclude<UserCharacterTable, 'characterLocationCovered'>,
  userId: string,
  characterId: number,
): Promise<void> {
  const row = await uniqueByUserCharacter(ctx, table, userId, characterId);
  if (row !== null) await ctx.db.delete(table, row._id);
}

/**
 * A run only reads tracked characters, so a character that left the run's list
 * leaves its location, online, and access-token rows behind. Deletes them.
 * Normal runs compare two in-memory lists and read nothing.
 */
export async function dropUnsyncedCharacterCaches(
  ctx: MutationCtx,
  userId: string,
  previousCharacterIds: readonly number[],
  currentCharacterIds: readonly number[],
): Promise<void> {
  const current = new Set(currentCharacterIds);
  for (const characterId of previousCharacterIds) {
    if (current.has(characterId)) continue;
    for (const table of CHARACTER_CACHE_TABLES) {
      await deleteCharacterCache(ctx, table, userId, characterId);
    }
  }
}
