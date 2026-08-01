// The production chain read path: the two live subscriptions the map canvas watches.
//
// These are DELIBERATELY two functions over two tables rather than one aggregate read, and that
// split is the whole architectural point (contract HC-2). Convex reactivity is read-set–precise:
// a write re-runs a subscription only when it overlaps the exact index ranges that subscription
// touched. `watchMapSystems` scans only the `mapSystems` `by_map` range and `watchMapConnections`
// only the `mapConnections` `by_map` range, so a connection write — the frequent one, as pilots
// roll and update holes — cannot overlap the systems read set and therefore cannot re-read the
// rarely-changing systems range. Merging them into one query would reintroduce exactly the
// re-read storm the trackers' SA.5 split fixed (`docs/CONVEX.md`).
//
// That property is structural, not a comment: `mapChain.test.ts` pins each handler's source to its
// own single table, which is the deterministic evidence AC-6 requires instead of an observation.
//
// Two rules hold in both handlers:
//   1. requireMapAccess is the FIRST call; there is no second access path into a chain table.
//   2. Exactly one indexed `.paginate()` per execution — Convex permits only one, so each
//      collection is paged by its own call and the client drains each cursor independently.
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';

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

/**
 * Subscribes to one page of a map's placed systems — the rarely-changing half of the chain.
 *
 * Its read set is exactly the `mapSystems` `by_map` range for this map: the map ID is the leading
 * equality constraint, so another map's rows cannot enter the range, and no connection write can
 * overlap it. Returns Convex's real page and continuation state unwrapped, so a map larger than one
 * page is explicitly incomplete until this cursor reports `isDone` rather than silently truncated.
 *
 * Throws `UNAUTHENTICATED` or `FORBIDDEN` from the gate before any chain table is touched — which is
 * what lets a live claim revocation resolve a watching client to the calm no-access state.
 */
export const watchMapSystems = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    await requireMapAccess(ctx, mapId, 'view');

    return await ctx.db
      .query('mapSystems')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(clampPageSize(paginationOpts));
  },
});

/**
 * Subscribes to one page of a map's connections — the frequently-changing half of the chain.
 *
 * Its read set is exactly the `mapConnections` `by_map` range for this map, disjoint from the
 * systems range above. Endpoints are system IDs rather than document references, so this handler
 * never needs a `db.get` to join them; the client-side reconciler owns that join and withholds an
 * edge whose endpoint has not arrived yet.
 *
 * Throws `UNAUTHENTICATED` or `FORBIDDEN` from the gate before any chain table is touched.
 */
export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    await requireMapAccess(ctx, mapId, 'view');

    return await ctx.db
      .query('mapConnections')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(clampPageSize(paginationOpts));
  },
});
