import { ConvexError } from 'convex/values';
import {
  rolesAllow,
  type MapCapability,
  type MapRole,
} from '@/data/maps/access-contract';
import type { QueryCtx } from '../_generated/server';

/** Authenticated caller identity and projected map roles returned by the gate. */
export interface MapAccessGrant {
  readonly userId: string;
  readonly roles: readonly MapRole[];
}

type AuthDbCtx = Pick<QueryCtx, 'auth' | 'db'>;

/**
 * Sole collaborative map gate. Authenticates first, then reads one `by_map_user`
 * claim and grants only when any projected role carries the required capability.
 * It never chooses a display role, resolves principals, or decides durable authority.
 */
export async function requireMapAccess(
  ctx: AuthDbCtx,
  mapId: string,
  requiredCapability: MapCapability,
): Promise<MapAccessGrant> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: 'UNAUTHENTICATED' });
  }

  const userId = identity.subject;
  const claim = await ctx.db
    .query('mapAccess')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .unique();

  if (claim === null || !rolesAllow(claim.roles, requiredCapability)) {
    throw new ConvexError({ code: 'FORBIDDEN' });
  }

  return { userId, roles: claim.roles };
}
