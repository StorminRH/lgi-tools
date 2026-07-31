import { ConvexError } from 'convex/values';
import {
  rolesAllow,
  type MapCapability,
  type MapRole,
} from '../../src/data/maps/access-contract';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type MapAccessCtx = Pick<QueryCtx | MutationCtx, 'auth' | 'db'>;

/** Verified collaborative identity and effective roles returned by the map gate. */
interface RequiredMapAccess {
  userId: string;
  roles: readonly MapRole[];
}

/**
 * Authenticates one Better Auth user and checks the exact projected map claim.
 * Public map functions call this before touching any chain payload table.
 */
export async function requireMapAccess(
  ctx: MapAccessCtx,
  mapId: string,
  requiredCapability: MapCapability,
): Promise<RequiredMapAccess> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: 'UNAUTHENTICATED' });
  }

  const claim = await ctx.db
    .query('mapAccess')
    .withIndex('by_map_user', (q) =>
      q.eq('mapId', mapId).eq('userId', identity.subject),
    )
    .unique();
  if (
    claim === null ||
    claim.roles.length === 0 ||
    !rolesAllow(claim.roles, requiredCapability)
  ) {
    throw new ConvexError({ code: 'FORBIDDEN' });
  }
  return { userId: identity.subject, roles: claim.roles };
}
