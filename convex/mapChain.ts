// The production chain read path: the live subscriptions the map canvas watches.
//
// The two chain reads are DELIBERATELY two public queries rather than one aggregate read, and that
// split is the whole architectural point (contract HC-2). Convex reactivity is read-set–precise: a
// write re-runs a subscription only when it overlaps the exact index ranges THAT EXECUTION touched.
// Each query reads only its own table's `by_map` range, so a connection patch (mass/EOL bookkeeping)
// cannot overlap the systems read set and therefore cannot re-read the systems range — the invariant
// `docs/VERSION_4_0_PLAN.md` §4.0.2.3 states and the trackers' SA.5 lesson taught (`docs/CONVEX.md`).
//
// Both queries flow through one `readChainPage` helper, house-style (the fixture reader's
// `byMap(table)`, the purge contributors, the ESI gate): the table name is the caller's parameter,
// and read-set tracking is per-execution, so the two subscriptions stay disjoint at runtime. The
// contract is enforced, not hoped for: `mapChain.test.ts` pins each handler to its exact table
// literal and pins the helper to exactly one dynamic indexed read with no other database access —
// together the deterministic evidence AC-6 requires instead of an observation.
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
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server';
import { v } from 'convex/values';
import { rolesAllow } from '@/data/maps/access-contract';
import type { Doc } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
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

/** The tables a chain subscription may page. Widening this list is a contract decision, not a tweak. */
type ChainTable = 'mapSystems' | 'mapConnections';

/** A complete, empty page: what a chain read serves a caller holding no claim. */
function deniedPage<Table extends ChainTable>(): PaginationResult<Doc<Table>> {
  return { page: [], isDone: true, continueCursor: '' };
}

/**
 * Reads one gated page of one chain table for one map — the single shared body of every chain
 * subscription.
 *
 * The caller's table name is the ONLY thing that varies, and it decides the execution's whole read
 * set: one claim lookup plus one `by_map` index range on exactly that table. Nothing else in here may
 * touch the database — an added read would land in every chain subscription at once, and the
 * source-contract test pins this body to exactly one dynamic indexed read for that reason.
 *
 * Serves an empty, complete page to a caller holding no claim, having read no chain row.
 */
async function readChainPage<Table extends ChainTable>(
  ctx: QueryCtx,
  table: Table,
  mapId: string,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<Table>>> {
  const principal = await tryMapAccess(ctx, mapId, 'view');
  if (principal === null) return deniedPage<Table>();

  // Union-typed initializer, exactly like the fixture reader's `byMap(table)`: Convex's index
  // builder resolves field types over a union but not over an unreduced generic. The two-step cast
  // narrows the page back to the caller's exact table — provable by construction, since `chainTable`
  // IS the caller's parameter and the query read nothing else.
  const chainTable: ChainTable = table;
  const result = await ctx.db
    .query(chainTable)
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .paginate(clampPageSize(paginationOpts));
  return result as unknown as PaginationResult<Doc<Table>>;
}

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

/**
 * Subscribes to one page of a map's placed systems.
 *
 * Its read set is exactly the `mapSystems` `by_map` range for this map plus the caller's claim row:
 * the map ID is the leading equality constraint, so another map's rows cannot enter the range, and a
 * connection patch cannot overlap it. Returns Convex's real page and continuation state unwrapped, so
 * a map larger than one page is explicitly incomplete until this cursor reports `isDone` rather than
 * silently truncated.
 */
export const watchMapSystems = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) =>
    await readChainPage(ctx, 'mapSystems', mapId, paginationOpts),
});

/**
 * Subscribes to one page of a map's connections.
 *
 * Its read set is exactly the `mapConnections` `by_map` range for this map plus the caller's claim
 * row, disjoint from the systems range above. Endpoints are system IDs rather than document
 * references, so no `db.get` join is needed server-side; the client-side reconciler owns that join
 * and withholds an edge whose endpoint has not arrived yet.
 */
export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) =>
    await readChainPage(ctx, 'mapConnections', mapId, paginationOpts),
});
