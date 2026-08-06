// The production chain read path: the live subscriptions the map canvas watches.
//
// The two chain reads are DELIBERATELY two public queries rather than one aggregate read, and that
// split is the whole architectural point (contract HC-2). Convex reactivity is read-set–precise: a
// write re-runs a subscription only when it overlaps the exact index ranges THAT EXECUTION touched.
// Each query reads only its own table's `by_map` range, so a connection patch (mass/EOL bookkeeping)
// cannot overlap the systems read set and therefore cannot re-read the systems range — the invariant
// `docs/VERSION_4_0_PLAN.md` §4.0.2.3 states and the trackers' SA.5 lesson taught (`docs/CONVEX.md`).
//
// Systems and connections use separate page helpers because the merged connection model has two
// disjoint destination ranges: numeric rows are resolved canvas edges, while null rows are
// unresolved matching slots. Read-set tracking is per execution, so the subscriptions remain
// table/range precise. `mapChain.test.ts` pins each handler to its exact helper and each helper to
// its single owned table — deterministic evidence rather than an observation.
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
import { isTombstoned } from '@/data/maps/chain-contract';
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

/** Maximum retained ledger rows one live map subscription may read. */
export const MAP_EVENT_READ_LIMIT = 100;

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

type ResolvedMapConnection = Doc<'mapConnections'> & { readonly toSystemId: number };
type UnresolvedMapConnection = Doc<'mapConnections'> & { readonly toSystemId: null };
type ConnectionPageMode = 'resolved' | 'unresolved';

/** A complete, empty page: what a chain read serves a caller holding no claim. */
function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}

/** Reads one access-gated systems page through only that map's `by_map` range. */
async function readSystemPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<'mapSystems'>>> {
  const principal = await tryMapAccess(ctx, mapId, 'view');
  if (principal === null) return deniedPage<Doc<'mapSystems'>>();
  return await ctx.db
    .query('mapSystems')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .paginate(clampPageSize(paginationOpts));
}

/**
 * Reads one access-gated connection page through a destination-specific index
 * range. Numeric destinations and null destinations are disjoint ranges, so
 * unresolved rows can never enter the shipped canvas page.
 */
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: 'resolved',
): Promise<PaginationResult<ResolvedMapConnection>>;
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: 'unresolved',
): Promise<PaginationResult<UnresolvedMapConnection>>;
async function readConnectionPage(
  ctx: QueryCtx,
  mapId: string,
  paginationOpts: PaginationOptions,
  mode: ConnectionPageMode,
): Promise<PaginationResult<ResolvedMapConnection | UnresolvedMapConnection>> {
  const principal = await tryMapAccess(ctx, mapId, 'view');
  if (principal === null) {
    return deniedPage<ResolvedMapConnection | UnresolvedMapConnection>();
  }

  const bounded = clampPageSize(paginationOpts);
  if (mode === 'resolved') {
    const result = await ctx.db
      .query('mapConnections')
      .withIndex('by_map_to', (q) => q.eq('mapId', mapId).gt('toSystemId', null))
      .paginate(bounded);
    // The indexed range is the proof that every returned destination is numeric.
    return result as PaginationResult<ResolvedMapConnection>;
  }

  const result = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', null))
    .paginate(bounded);
  return {
    ...result,
    // Tombstoned stubs stay available to sever/restore internally but never
    // re-enter the live candidate feed merely because their anchor is placed again.
    page: result.page.filter((row) => !isTombstoned(row)) as UnresolvedMapConnection[],
  };
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
    await readSystemPage(ctx, mapId, paginationOpts),
});

/**
 * Subscribes to one page of a map's connections.
 *
 * Its read set is exactly the numeric-destination portion of this map's
 * `mapConnections.by_map_to` range plus the caller's claim row, disjoint from
 * both systems and null-destination slots. No `db.get` join is needed server-side.
 */
export const watchMapConnections = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<ResolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'resolved'),
});

/**
 * Subscribes to one page of active unresolved wormhole slots. This is a
 * separate feed for matching/prompt consumers; the canvas never subscribes to it.
 */
export const watchUnresolvedHoles = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }): Promise<
    PaginationResult<UnresolvedMapConnection>
  > =>
    await readConnectionPage(ctx, mapId, paginationOpts, 'unresolved'),
});

/**
 * Watches the retained basic ledger newest-first through one bounded map/time
 * index range. Access denial is the same calm empty value as the chain pages.
 */
export const watchMapEvents = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return [];
    return await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .order('desc')
      .take(MAP_EVENT_READ_LIMIT);
  },
});
