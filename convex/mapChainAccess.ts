// `watchMapAccess` is the authority on whether access is held, and it answers with a VALUE.
//
// A paginated Convex query must return a page, so it cannot report a refusal as a value and would
// have to throw. Throwing inside a LIVE subscription is not a clean state change: a routine
// revocation becomes an uncaught error rather than a transition the UI simply renders. Splitting
// the question — "do I hold access?" as its own value-returning subscription, "which rows?" as
// pages — keeps revoked distinguishable from authorized-but-empty (contract DC-4) with no error
// path at all, and lets a re-granted claim recover the map live instead of requiring a reload.
import { v } from 'convex/values';
import { rolesAllow } from '@/data/maps/access-contract';
import { query } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';

/**
 * Subscribes to whether the caller currently holds view access to one map, and
 * whether that claim also carries edit.
 *
 * The authority on revoked-versus-empty, and the reason no chain read has to throw. Its read set is
 * exactly the caller's own `by_map_user` claim row, so deleting that claim re-runs this subscription
 * and flips both flags live — and re-granting it recovers the map without a reload. `canEdit` is
 * computed from the same claim row (`rolesAllow(..., 'edit')`), so a rights change unmounts
 * authoring affordances without a second subscription.
 *
 * Answers both flags `false` rather than throwing for a signed-out caller too, so the window between
 * socket connect and JWT mint is an ordinary refusal instead of an error.
 */
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
