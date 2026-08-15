'use client';

// Optimistic local-store patches for the client-facing mapAuthoring mutations.
//
// Each hook wraps `useMutation(...).withOptimisticUpdate(...)` against the
// exact chain subscriptions (`watchMapSystems` / `watchMapConnections`). A
// rejection rolls the optimistic layer back automatically; confirmed inserts
// reconcile through the same-merge endpoint-matched id-swap in the reconciler.
// Pure patch helpers are exported so the optimistic shapes are unit-tested
// without a live Convex client.
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import {
  insertAtBottomIfLoaded,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
  type OptimisticLocalStore,
} from '@/data/convex/use-mutation';
import {
  chainTombstoneStamps,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  deathWindowForReport,
  deathWindowFrom,
  intersectOrReset,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import type {
  ConnectionMassState,
  WormholeDestinationHint,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { loadWormholeCodex } from '@/data/eve-data/universe-assets-client';
import { eliminateSignaturesAndAnnounce } from '../signatures/signature-elimination-client';
import type { ConnectionEditorDetail } from './use-map-chain';

/** One optimistic system page row — structural match for `watchMapSystems`. */
export interface OptimisticSystemRow {
  readonly _id: string;
  readonly _creationTime: number;
  readonly mapId: string;
  readonly systemId: number;
  readonly deletedAt: number | null;
  readonly purgeAfter: number | null;
}

/** One optimistic connection page row — structural match for `watchMapConnections`. */
export interface OptimisticConnectionRow {
  readonly _id: string;
  readonly _creationTime: number;
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide?: 'from' | 'to';
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly eolAt: number | null;
  readonly lifeStage?: WormholeLifeStage | null;
  readonly lifeStageObservedAt?: number | null;
  readonly fromDestinationHint?: WormholeDestinationHint;
  readonly toDestinationHint?: WormholeDestinationHint;
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
  readonly deletedAt: number | null;
  readonly purgeAfter: number | null;
}

/**
 * Prefix marking a client-only optimistic temp id. The reconciler's swap
 * suppression keys on this exact prefix — change both together.
 */
export const OPTIMISTIC_ID_PREFIX = 'optimistic:';

/** Builds a client-only temp document id for an optimistic insert. */
export function optimisticTempId(table: 'mapSystems' | 'mapConnections'): string {
  return `${OPTIMISTIC_ID_PREFIX}${table}:${crypto.randomUUID()}`;
}

/** Whether any loaded systems page already carries a live row for `systemId`. */
function insertOptimisticSystemIfAbsent(
  localStore: OptimisticLocalStore,
  mapId: string,
  systemId: number,
  now: number,
): void {
  if (liveSystemPresent(localStore, mapId, systemId)) return;
  insertAtBottomIfLoaded({
    paginatedQuery: api.mapChain.watchMapSystems,
    argsToMatch: { mapId },
    localQueryStore: localStore,
    item: {
      _id: optimisticTempId('mapSystems'),
      _creationTime: now,
      mapId,
      systemId,
      deletedAt: null,
      purgeAfter: null,
    } as never,
  });
}

function liveSystemPresent(
  localStore: OptimisticLocalStore,
  mapId: string,
  systemId: number,
): boolean {
  for (const { args, value } of localStore.getAllQueries(api.mapChain.watchMapSystems)) {
    if (value === undefined) continue;
    if (args.mapId !== mapId) continue;
    if (value.page.some((row) => row.systemId === systemId && row.deletedAt == null)) {
      return true;
    }
  }
  return false;
}

/** Optimistically inserts the first home system at the top of the systems pages. */
export function optimisticSetHomeSystem(
  localStore: OptimisticLocalStore,
  args: { mapId: string; systemId: number },
  now = Date.now(),
): void {
  if (liveSystemPresent(localStore, args.mapId, args.systemId)) return;
  // Skip when any live system already exists — server will refuse MAP_NOT_EMPTY.
  for (const { args: pageArgs, value } of localStore.getAllQueries(
    api.mapChain.watchMapSystems,
  )) {
    if (value === undefined || pageArgs.mapId !== args.mapId) continue;
    if (value.page.some((row) => row.deletedAt == null)) return;
  }

  const item = {
    _id: optimisticTempId('mapSystems'),
    _creationTime: now,
    mapId: args.mapId,
    systemId: args.systemId,
    deletedAt: null,
    purgeAfter: null,
  } satisfies OptimisticSystemRow;

  insertAtTop({
    paginatedQuery: api.mapChain.watchMapSystems,
    argsToMatch: { mapId: args.mapId },
    localQueryStore: localStore,
    item: item as never,
  });
}

/**
 * Optimistically inserts the destination system (when absent) and the
 * connection in one local update so the reveal is whole.
 */
export function optimisticAddSystemFromNode(
  localStore: OptimisticLocalStore,
  args: { mapId: string; fromSystemId: number; toSystemId: number },
  now = Date.now(),
): void {
  if (args.fromSystemId === args.toSystemId) return;
  if (!liveSystemPresent(localStore, args.mapId, args.fromSystemId)) return;

  // Append — systems pages are ascending creation order and resolveRoot
  // takes facts.systems[0]. Prepending would make the destination the
  // transient root for the mutation round trip.
  insertOptimisticSystemIfAbsent(
    localStore,
    args.mapId,
    args.toSystemId,
    now,
  );

  insertAtTop({
    paginatedQuery: api.mapChain.watchMapConnections,
    argsToMatch: { mapId: args.mapId },
    localQueryStore: localStore,
    item: {
      _id: optimisticTempId('mapConnections'),
      _creationTime: now,
      mapId: args.mapId,
      fromSystemId: args.fromSystemId,
      toSystemId: args.toSystemId,
      wormholeTypeCode: null,
      massState: null,
      shipSize: null,
      eolAt: null,
      lifeStage: null,
      lifeStageObservedAt: null,
      deathEarliestAt: null,
      deathLatestAt: null,
      deletedAt: null,
      purgeAfter: null,
    } satisfies OptimisticConnectionRow as never,
  });
}

type ConnectionFieldPatch = Partial<
  Pick<
    OptimisticConnectionRow,
    | 'wormholeTypeCode'
    | 'typedSide'
    | 'shipSize'
    | 'massState'
    | 'lifeStage'
    | 'lifeStageObservedAt'
    | 'fromDestinationHint'
    | 'toDestinationHint'
    | 'deathEarliestAt'
    | 'deathLatestAt'
    | 'deletedAt'
    | 'purgeAfter'
  >
>;

/** Drops one connection from every loaded page of one feed and returns it. */
function takeConnectionFromPages<
  Query extends
    | typeof api.mapChain.watchMapConnections
    | typeof api.mapChain.watchUnresolvedHoles,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  mapId: string,
  connectionId: string,
): OptimisticConnectionRow | null {
  let taken: OptimisticConnectionRow | null = null;
  for (const { args, value } of localStore.getAllQueries(query)) {
    if (value === undefined || args.mapId !== mapId) continue;
    const match = value.page.find((row) => row._id === connectionId);
    if (match === undefined) continue;
    taken = match as OptimisticConnectionRow;
    localStore.setQuery(query, args, {
      ...value,
      page: value.page.filter((row) => row._id !== connectionId),
    } as never);
  }
  return taken;
}

/** Same-list field edits. Destination resolve/unresolve is a feed move. */
export function optimisticPatchConnection(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    patch: ConnectionFieldPatch;
  },
): void {
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapConnections,
    { mapId: args.mapId },
    (row) =>
      row._id === args.connectionId ? { ...row, ...args.patch } : row,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchUnresolvedHoles,
    { mapId: args.mapId },
    (row) =>
      row._id === args.connectionId ? { ...row, ...args.patch } : row,
  );
}

/** Optimistically stamps only the cut edge; the server owns any branch set. */
export function optimisticSeverConnection(
  localStore: OptimisticLocalStore,
  args: { mapId: string; connectionId: string },
  now = Date.now(),
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch: chainTombstoneStamps(now),
  });
}

/** Finds one loaded connection's shared sever stamp. */
function severStamp(
  localStore: OptimisticLocalStore,
  mapId: string,
  connectionId: string,
): number | null {
  for (const { args, value } of localStore.getAllQueries(
    api.mapChain.watchMapConnections,
  )) {
    if (value === undefined || args.mapId !== mapId) continue;
    const connection = value.page.find((row) => row._id === connectionId);
    if (
      connection !== undefined &&
      isTombstoned(connection) &&
      typeof connection.deletedAt === 'number'
    ) {
      return connection.deletedAt;
    }
  }
  return null;
}

/** Optimistically restores every loaded row carrying the cut's shared stamp. */
export function optimisticRestoreSeveredBranch(
  localStore: OptimisticLocalStore,
  args: { mapId: string; connectionId: string },
): void {
  const deletedAt = severStamp(localStore, args.mapId, args.connectionId);
  if (deletedAt === null) return;
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapSystems,
    { mapId: args.mapId },
    (row) =>
      row.deletedAt === deletedAt
        ? { ...row, deletedAt: null, purgeAfter: null }
        : row,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapConnections,
    { mapId: args.mapId },
    (row) =>
      row.deletedAt === deletedAt
        ? { ...row, deletedAt: null, purgeAfter: null }
        : row,
  );
}

/** Optimistically clears a connection tombstone. */
function optimisticRestoreConnection(
  localStore: OptimisticLocalStore,
  args: { mapId: string; connectionId: string },
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch: { deletedAt: null, purgeAfter: null },
  });
}

/** Optimistically patches life stage and stamps observation time on change. */
export function optimisticSetConnectionLifeStage(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    value: WormholeLifeStage | null;
    deathEarliestAt?: number | null;
    deathLatestAt?: number | null;
  },
  now = Date.now(),
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch: {
      lifeStage: args.value,
      lifeStageObservedAt: now,
      deathEarliestAt: args.deathEarliestAt ?? null,
      deathLatestAt: args.deathLatestAt ?? null,
    },
  });
}

/** Optimistically patches a type pick and its explicit lifetime proposal. */
export function optimisticSetConnectionWormholeType(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    value: string | null;
    deathEarliestAt?: number | null;
    deathLatestAt?: number | null;
  },
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch: {
      wormholeTypeCode: args.value,
      deathEarliestAt: args.deathEarliestAt ?? null,
      deathLatestAt: args.deathLatestAt ?? null,
    },
  });
}

/** Connection facts needed to form a stale-safe explicit window proposal. */
export interface ConnectionWindowSource {
  readonly connectionId: Id<'mapConnections'>;
  readonly _creationTime: number;
  readonly firstSeenAt: number | null;
  readonly wormholeTypeCode: string | null;
  readonly deathEarliestAt: number | null;
  readonly deathLatestAt: number | null;
}

function storedWindow(
  connection: ConnectionWindowSource,
): ConnectionDeathWindow | null {
  return deathWindowFrom(connection.deathEarliestAt, connection.deathLatestAt);
}

/** Explicit type-pick proposal: typed ceilings narrow; K162/unset preserve. */
export function wormholeTypeWindowProposal(
  connection: ConnectionWindowSource,
  lifetimeMinutes: number | null,
): ConnectionDeathWindow | null {
  if (
    lifetimeMinutes === null ||
    !Number.isFinite(lifetimeMinutes) ||
    lifetimeMinutes < 0
  ) {
    return storedWindow(connection);
  }
  // Mirror the server's resolution: a typed span narrows a stored window and
  // never widens it optimistically; an empty intersection resets to the span.
  const firstSeenAt = connection.firstSeenAt ?? connection._creationTime;
  return intersectOrReset(storedWindow(connection), {
    earliestAt: firstSeenAt,
    latestAt: firstSeenAt + lifetimeMinutes * 60_000,
  });
}

/** Explicit life-stage proposal from the shared pure lifetime algebra. */
export function lifeStageWindowProposal(
  value: WormholeLifeStage | null,
  observedAt: number,
  lifetimeMinutes: number | null,
): ConnectionDeathWindow | null {
  return value === null
    ? null
    : deathWindowForReport(value, observedAt, lifetimeMinutes);
}

function windowArgs(window: ConnectionDeathWindow | null): {
  readonly deathEarliestAt: number | null;
  readonly deathLatestAt: number | null;
} {
  if (window === null) {
    return { deathEarliestAt: null, deathLatestAt: null };
  }
  return {
    deathEarliestAt: window.earliestAt,
    deathLatestAt: window.latestAt,
  };
}

async function nullOnRejection<Value>(
  promise: Promise<Value>,
): Promise<Value | null> {
  return await promise.catch(() => null);
}

/** Reads lifetime only from a typed codex entry; K162 carries no ceiling. */
export function lifetimeMinutesFromEntry(
  entry: WormholeCodexEntry | null,
): number | null {
  if (entry === null) return null;
  if (entry.farSide) return null;
  return entry.lifetimeMinutes;
}

/** Resolves typed lifetime without turning a codex outage into a rejection. */
async function lifetimeMinutesFor(code: string | null): Promise<number | null> {
  if (code === null) return null;
  const codex = await nullOnRejection(loadWormholeCodex());
  if (codex === null) return null;
  return lifetimeMinutesFromEntry(codex.byCode(code));
}

/** Converts a mutation refusal into a calm optimistic rollback result. */
export function swallowMutationRejection<Args, Result>(
  mutation: (args: Args) => Promise<Result>,
): (args: Args) => Promise<Result | undefined> {
  return async (args) => {
    try {
      return await mutation(args);
    } catch {
      return undefined;
    }
  };
}

type ConnectionFieldArgs = {
  mapId: string;
  connectionId: string;
  value: OptimisticConnectionRow[
    | 'wormholeTypeCode'
    | 'shipSize'
    | 'massState'
    | 'lifeStage'];
};

/** Optimistic retarget or clear of a connection's resolved destination. */
export function optimisticSetConnectionDestination(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    toSystemId: number | null;
  },
  now = Date.now(),
): void {
  if (args.toSystemId !== null) {
    insertOptimisticSystemIfAbsent(
      localStore,
      args.mapId,
      args.toSystemId,
      now,
    );
  }
  const resolved = takeConnectionFromPages(
    localStore,
    api.mapChain.watchMapConnections,
    args.mapId,
    args.connectionId,
  );
  const unresolved = takeConnectionFromPages(
    localStore,
    api.mapChain.watchUnresolvedHoles,
    args.mapId,
    args.connectionId,
  );
  const existing = resolved ?? unresolved;
  if (existing === null) return;

  if (args.toSystemId === null) {
    insertAtTop({
      paginatedQuery: api.mapChain.watchUnresolvedHoles,
      argsToMatch: { mapId: args.mapId },
      localQueryStore: localStore,
      item: {
        ...existing,
        toSystemId: null,
        fromDestinationHint: undefined,
        toDestinationHint: undefined,
      } as never,
    });
    return;
  }

  insertAtTop({
    paginatedQuery: api.mapChain.watchMapConnections,
    argsToMatch: { mapId: args.mapId },
    localQueryStore: localStore,
    item: {
      ...existing,
      toSystemId: args.toSystemId,
      fromDestinationHint: undefined,
      toDestinationHint: undefined,
    } as never,
  });
}

/** Optimistic patch for one side's destination hint (null clears the field). */
function optimisticSetConnectionDestinationHint(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    side: 'from' | 'to';
    value: WormholeDestinationHint | null;
  },
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch:
      args.side === 'from'
        ? { fromDestinationHint: args.value ?? undefined }
        : { toDestinationHint: args.value ?? undefined },
  });
}

/** Wires one field-scoped connection setter to a single-key optimistic patch. */
function optimisticConnectionField(
  field: 'wormholeTypeCode' | 'shipSize' | 'massState',
): (localStore: OptimisticLocalStore, args: ConnectionFieldArgs) => void {
  return (localStore, args) => {
    optimisticPatchConnection(localStore, {
      mapId: args.mapId,
      connectionId: args.connectionId,
      patch: { [field]: args.value },
    });
  };
}

/**
 * Authoring mutations with optimistic local-store patches wired against the
 * chain subscriptions, including the collapse sever/undo/restore surface. The
 * internalized .1 single-row tombstone helpers are deliberately absent here.
 * Every mutation is wrapped in {@link swallowMutationRejection}: a server
 * refusal resolves to null and the optimistic patch rolls back reactively.
 */
export function useChainAuthoringMutations() {
  const setHomeSystem = swallowMutationRejection(
    useMutation(api.mapAuthoring.setHomeSystem).withOptimisticUpdate(
      optimisticSetHomeSystem,
    ),
  );
  const addSystemFromNode = swallowMutationRejection(
    useMutation(api.mapAuthoring.addSystemFromNode).withOptimisticUpdate(
      optimisticAddSystemFromNode,
    ),
  );
  const setConnectionWormholeType = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionWormholeType).withOptimisticUpdate(
      optimisticSetConnectionWormholeType,
    ),
  );
  const setConnectionShipSize = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionShipSize).withOptimisticUpdate(
      optimisticConnectionField('shipSize'),
    ),
  );
  const setConnectionMassState = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionMassState).withOptimisticUpdate(
      optimisticConnectionField('massState'),
    ),
  );
  const setConnectionLifeStage = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionLifeStage).withOptimisticUpdate(
      optimisticSetConnectionLifeStage,
    ),
  );
  const setConnectionDestinationHint = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionDestinationHint).withOptimisticUpdate(
      optimisticSetConnectionDestinationHint,
    ),
  );
  const setConnectionDestination = swallowMutationRejection(
    useMutation(api.mapAuthoring.setConnectionDestination).withOptimisticUpdate(
      optimisticSetConnectionDestination,
    ),
  );
  const severConnection = swallowMutationRejection(
    useMutation(api.mapAuthoring.severConnection).withOptimisticUpdate(
      optimisticSeverConnection,
    ),
  );
  const restoreSeveredBranch = swallowMutationRejection(
    useMutation(api.mapAuthoring.restoreSeveredBranch).withOptimisticUpdate(
      optimisticRestoreSeveredBranch,
    ),
  );
  const restoreConnection = swallowMutationRejection(
    useMutation(api.mapAuthoring.restoreConnection).withOptimisticUpdate(
      optimisticRestoreConnection,
    ),
  );
  // Ledger undo for list/stub signature removals. No optimistic patch: the
  // signature page is its own subscription outside the chain local store.
  const removeSignatures = swallowMutationRejection(
    useMutation(api.mapScan.removeSignatures),
  );
  const restoreSignatures = swallowMutationRejection(
    useMutation(api.mapScan.restoreSignatures),
  );
  const linkStubToResolvedConnection = swallowMutationRejection(
    useMutation(api.mapScan.linkStubToResolvedConnection),
  );

  return {
    setHomeSystem,
    addSystemFromNode,
    setConnectionWormholeType: async (args: {
      mapId: string;
      connection: ConnectionEditorDetail;
      value: string | null;
    }) => {
      const proposal = wormholeTypeWindowProposal(
        args.connection,
        await lifetimeMinutesFor(args.value),
      );
      const result = await setConnectionWormholeType({
        mapId: args.mapId,
        connectionId: args.connection.connectionId,
        value: args.value,
        ...windowArgs(proposal),
      });
      if (result === undefined) return undefined;
      const typedSystemId = args.connection.typedSide === 'to'
        && args.connection.toSystemId !== null
        ? args.connection.toSystemId
        : args.connection.fromSystemId;
      await eliminateSignaturesAndAnnounce({
        mapId: args.mapId,
        systemId: typedSystemId,
      });
      return result;
    },
    setConnectionShipSize,
    setConnectionMassState,
    setConnectionDestinationHint,
    setConnectionDestination,
    setConnectionLifeStage: async (args: {
      mapId: string;
      connection: ConnectionWindowSource;
      value: WormholeLifeStage | null;
    }) => {
      const proposal = lifeStageWindowProposal(
        args.value,
        Date.now(),
        await lifetimeMinutesFor(args.connection.wormholeTypeCode),
      );
      return await setConnectionLifeStage({
        mapId: args.mapId,
        connectionId: args.connection.connectionId,
        value: args.value,
        ...windowArgs(proposal),
      });
    },
    severConnection,
    restoreSeveredBranch,
    restoreConnection,
    removeSignatures,
    restoreSignatures,
    linkStubToResolvedConnection,
  };
}
