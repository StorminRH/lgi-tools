import { v } from 'convex/values';
import { rolesAllow } from '@/data/maps/access-contract';
import { query } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';

/** `trackableCharacterIds` is null on a legacy map, where every linked character may be tracked. */
export const watchMapAccess = query({
  args: { mapId: v.string() },
  handler: async (
    ctx,
    { mapId },
  ): Promise<{ granted: boolean; canEdit: boolean; trackableCharacterIds: number[] | null }> => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return { granted: false, canEdit: false, trackableCharacterIds: null };
    return {
      granted: true,
      canEdit: rolesAllow(principal.roles, 'edit'),
      trackableCharacterIds: principal.characters?.map((character) => character.characterId) ?? null,
    };
  },
});
