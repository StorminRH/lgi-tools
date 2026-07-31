// The single collaborative authorization gate (decision D5). Every public map function's FIRST call
// is requireMapAccess; there is deliberately no second access path into a chain table.
//
// It is not a second authority. Neon's resolveMatchedMapRoles remains the rule; this gate only reads
// the projected claim that rule produced and applies the SAME shared capability record, so the two
// runtimes cannot drift on what a role may do. Session 4.0.2.2.2 owns the projection writer, so
// until it lands a production map has no claim row and every call here fails closed.
import { ConvexError } from 'convex/values';
import {
  rolesAllow,
  type MapCapability,
  type MapRole,
} from '@/data/maps/access-contract';
import type { QueryCtx } from '../_generated/server';

/** The authorized caller a gated handler may act for. */
export interface MapPrincipal {
  readonly userId: string;
  readonly roles: readonly MapRole[];
}

/**
 * Authenticates the caller, then authorizes them for one map and one required capability.
 *
 * Identity comes from the verified Better Auth JWT, never from an argument, so no caller can name
 * another user. The claim lookup is one `by_map_user` indexed read — narrow enough to be a precise
 * read set, which is what lets a later revocation invalidate live subscriptions.
 *
 * Throws before any chain table is touched: `UNAUTHENTICATED` with no JWT identity, `FORBIDDEN` with
 * a missing or insufficient claim. It returns the caller's projected roles; it never chooses a
 * display role, resolves principals, or decides durable authority.
 */
export async function requireMapAccess(
  ctx: QueryCtx,
  mapId: string,
  requiredCapability: MapCapability,
): Promise<MapPrincipal> {
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
