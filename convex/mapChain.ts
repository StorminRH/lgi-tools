// The production chain read path: the live subscriptions the map canvas watches.
//
// The two chain reads are DELIBERATELY two functions over two tables rather than one aggregate read,
// and that split is the whole architectural point (contract HC-2). Convex reactivity is
// read-set–precise: a write re-runs a subscription only when it overlaps the exact index ranges that
// subscription touched. `watchMapSystems` scans only the `mapSystems` `by_map` range and
// `watchMapConnections` only the `mapConnections` `by_map` range, so a connection write — the frequent
// one, as pilots roll and update holes — cannot overlap the systems read set and therefore cannot
// re-read the rarely-changing systems range. Merging them into one query would reintroduce exactly the
// re-read storm the trackers' SA.5 split fixed (`docs/CONVEX.md`).
//
// That property is structural, not a comment: `mapChain.test.ts` pins each handler's source to its
// own single chain table, which is the deterministic evidence AC-6 requires instead of an observation.
//
// AUTHORIZATION SHAPE — why nothing here throws:
//
// `watchMapAccess` is the authority on whether access is held, and it answers with a VALUE. The two
// chain reads resolve the same claim through the same indexed lookup and return an EMPTY PAGE when it
// is absent. They are still gate-first — no chain row is ever read without a claim — they simply do
// not use an exception to say so.
//
// A paginated Convex query must return a page (`PaginatedQueryReference` fixes its return type), so
// it cannot report a refusal as a value and would have to throw. Throwing inside a LIVE subscription
// is not a clean state change: the client raises it inside its own socket callback, so a routine
// revocation becomes an uncaught error rather than a transition the UI simply renders. Splitting the
// question — "do I hold access?" as its own value-returning subscription, "which rows?" as pages —
// keeps revoked distinguishable from authorized-but-empty (contract DC-4) with no error path at all,
// and lets a re-granted claim recover the map live instead of requiring a reload.
import { paginationOptsValidator, type PaginationResult } from 'convex/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { tryMapAccess } from './lib/mapAccess';

/**
 * The largest page either chain subscription will serve, whatever a caller asks for.
 *
 * A page is a transaction-bounded unit of read I/O, and DB I/O is the binding capacity constraint
 * (`docs/CONVEX.md`), so a bigger map costs more calls rather than one bigger, riskier transaction.
 */
export const MAP_CHAIN_MAX_PAGE_SIZE = 100;

/**
 * Clamps a client's requested page size into `[1, MAP_CHAIN_MAX_PAGE_SIZE]`.
 *
 * The bound is enforced here in the handler body rather than in the validator on purpose: the
 * client pagination hook injects its own bookkeeping fields into `paginationOpts`, so the argument
 * must be validated by Convex's own `paginationOptsValidator` and narrowed afterwards.
 */
function clampPageSize<T extends { numItems: number }>(paginationOpts: T): T {
  return {
    ...paginationOpts,
    numItems: Math.max(1, Math.min(paginationOpts.numItems, MAP_CHAIN_MAX_PAGE_SIZE)),
  };
}

/** A complete, empty page: what a chain read serves a caller holding no claim. */
function deniedPage<Row extends Doc<'mapSystems'> | Doc<'mapConnections'>>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}

/**
 * Subscribes to whether the caller currently holds view access to one map.
 *
 * The authority on revoked-versus-empty, and the reason no chain read has to throw. Its read set is
 * exactly the caller's own `by_map_user` claim row, so deleting that claim re-runs this subscription
 * and flips it to `false` live — and re-granting it flips back to `true`, recovering the map without
 * a reload.
 *
 * Answers `false` rather than throwing for a signed-out caller too, so the window between socket
 * connect and JWT mint is an ordinary `false` instead of an error.
 */
export const watchMapAccess = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }): Promise<{ granted: boolean }> => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    return { granted: principal !== null };
  },
});

/**
 * Subscribes to one page of a map's placed systems — the rarely-changing half of the chain.
 *
 * Its read set is exactly the `mapSystems` `by_map` range for this map plus the caller's claim row:
 * the map ID is the leading equality constraint, so another map's rows cannot enter the range, and no
 * connection write can overlap it. Returns Convex's real page and continuation state unwrapped, so a
 * map larger than one page is explicitly incomplete until this cursor reports `isDone` rather than
 * silently truncated.
 *
 * Serves an empty, complete page to a caller holding no claim, having read no chain row.
 */
export const watchMapSystems = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return deniedPage<Doc<'mapSystems'>>();

    return await ctx.db
      .query('mapSystems')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(clampPageSize(paginationOpts));
  },
});

/**
 * Subscribes to one page of a map's connections — the frequently-changing half of the chain.
 *
 * Its read set is exactly the `mapConnections` `by_map` range for this map plus the caller's claim
 * row, disjoint from the systems range above. Endpoints are system IDs rather than document
 * references, so this handler never needs a `db.get` to join them; the client-side reconciler owns
 * that join and withholds an edge whose endpoint has not arrived yet.
 *
 * Serves an empty, complete page to a caller holding no claim, having read no chain row.
 */
export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return deniedPage<Doc<'mapConnections'>>();

    return await ctx.db
      .query('mapConnections')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(clampPageSize(paginationOpts));
  },
});
