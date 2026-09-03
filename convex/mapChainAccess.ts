import { v } from 'convex/values';
import { rolesAllow } from '@/data/maps/access-contract';
import { query } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';

export const watchMapAccess = query({
  args: { mapId: v.string() },
  handler: async (
    ctx,
    { mapId },
  ): Promise<{ granted: boolean; canEdit: boolean }> => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return { granted: false, canEdit: false };
    return {
      granted: true,
      canEdit: rolesAllow(principal.roles, 'edit'),
    };
  },
});
