'use client';

// Optimistic local-store patches for every public mapAuthoring mutation.
//
// Each hook wraps `useMutation(...).withOptimisticUpdate(...)` against the
// exact chain subscriptions (`watchMapSystems` / `watchMapConnections`). A
// rejection rolls the optimistic layer back automatically; confirmed inserts
// reconcile through the same-merge endpoint-matched id-swap in the reconciler.
// Pure patch helpers are exported so the optimistic shapes are unit-tested
// without a live Convex client.
import { api } from '@/data/convex/api';
import {
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
  type OptimisticLocalStore,
} from '@/data/convex/use-mutation';
import {
  chainTombstoneStamps,
  MAP_CHAIN_UNDO_WINDOW_MS,
} from '@/data/maps/chain-contract';
import type {
  ConnectionMassState,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';

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
  readonly toSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly massState: ConnectionMassState | null;
  readonly shipSize: WormholeSizeClass | null;
  readonly eolAt: number | null;
  readonly lifeStage?: WormholeLifeStage | null;
  readonly lifeStageObservedAt?: number | null;
  readonly deletedAt: number | null;
  readonly purgeAfter: number | null;
}

/** Builds a client-only temp document id for an optimistic insert. */
export function optimisticTempId(table: 'mapSystems' | 'mapConnections'): string {
  return `optimistic:${table}:${crypto.randomUUID()}`;
}

/** Whether any loaded systems page already carries a live row for `systemId`. */
export function liveSystemPresent(
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

  if (!liveSystemPresent(localStore, args.mapId, args.toSystemId)) {
    insertAtTop({
      paginatedQuery: api.mapChain.watchMapSystems,
      argsToMatch: { mapId: args.mapId },
      localQueryStore: localStore,
      item: {
        _id: optimisticTempId('mapSystems'),
        _creationTime: now,
        mapId: args.mapId,
        systemId: args.toSystemId,
        deletedAt: null,
        purgeAfter: null,
      } as never,
    });
  }

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
      deletedAt: null,
      purgeAfter: null,
    } satisfies OptimisticConnectionRow as never,
  });
}

/** Patches one connection field across every loaded connections page. */
export function optimisticPatchConnection(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    patch: Partial<
      Pick<
        OptimisticConnectionRow,
        | 'wormholeTypeCode'
        | 'shipSize'
        | 'massState'
        | 'lifeStage'
        | 'lifeStageObservedAt'
        | 'deletedAt'
        | 'purgeAfter'
      >
    >;
  },
): void {
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapConnections,
    { mapId: args.mapId },
    (row) =>
      row._id === args.connectionId ? { ...row, ...args.patch } : row,
  );
}

/** Optimistically stamps a system tombstone so the live-row filter drops it. */
export function optimisticTombstoneSystem(
  localStore: OptimisticLocalStore,
  args: { mapId: string; systemId: number },
  now = Date.now(),
): void {
  const stamps = chainTombstoneStamps(now);
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapSystems,
    { mapId: args.mapId },
    (row) =>
      row.systemId === args.systemId && row.deletedAt == null
        ? { ...row, ...stamps }
        : row,
  );
}

/** Optimistically clears a system tombstone. */
export function optimisticRestoreSystem(
  localStore: OptimisticLocalStore,
  args: { mapId: string; systemId: number },
): void {
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChain.watchMapSystems,
    { mapId: args.mapId },
    (row) =>
      row.systemId === args.systemId && typeof row.deletedAt === 'number'
        ? { ...row, deletedAt: null, purgeAfter: null }
        : row,
  );
}

/** Optimistically stamps a connection tombstone. */
export function optimisticTombstoneConnection(
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

/** Optimistically clears a connection tombstone. */
export function optimisticRestoreConnection(
  localStore: OptimisticLocalStore,
  args: { mapId: string; connectionId: string },
): void {
  optimisticPatchConnection(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    patch: { deletedAt: null, purgeAfter: null },
  });
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
 * chain subscriptions. Call from authoring surfaces (OW4); tombstone/restore
 * ship for the later collapse pathway with no UI caller this session.
 */
export function useChainAuthoringMutations() {
  return {
    setHomeSystem: useMutation(api.mapAuthoring.setHomeSystem).withOptimisticUpdate(
      optimisticSetHomeSystem,
    ),
    addSystemFromNode: useMutation(
      api.mapAuthoring.addSystemFromNode,
    ).withOptimisticUpdate(optimisticAddSystemFromNode),
    setConnectionWormholeType: useMutation(
      api.mapAuthoring.setConnectionWormholeType,
    ).withOptimisticUpdate(optimisticConnectionField('wormholeTypeCode')),
    setConnectionShipSize: useMutation(
      api.mapAuthoring.setConnectionShipSize,
    ).withOptimisticUpdate(optimisticConnectionField('shipSize')),
    setConnectionMassState: useMutation(
      api.mapAuthoring.setConnectionMassState,
    ).withOptimisticUpdate(optimisticConnectionField('massState')),
    setConnectionLifeStage: useMutation(
      api.mapAuthoring.setConnectionLifeStage,
    ).withOptimisticUpdate((localStore, args) => {
      optimisticPatchConnection(localStore, {
        mapId: args.mapId,
        connectionId: args.connectionId,
        patch: {
          lifeStage: args.value,
          lifeStageObservedAt: args.value === null ? null : Date.now(),
        },
      });
    }),
    tombstoneSystem: useMutation(
      api.mapAuthoring.tombstoneSystem,
    ).withOptimisticUpdate(optimisticTombstoneSystem),
    tombstoneConnection: useMutation(
      api.mapAuthoring.tombstoneConnection,
    ).withOptimisticUpdate(optimisticTombstoneConnection),
    restoreSystem: useMutation(
      api.mapAuthoring.restoreSystem,
    ).withOptimisticUpdate(optimisticRestoreSystem),
    restoreConnection: useMutation(
      api.mapAuthoring.restoreConnection,
    ).withOptimisticUpdate(optimisticRestoreConnection),
    /** Exposed so tests can assert the undo window the optimistic stamps use. */
    undoWindowMs: MAP_CHAIN_UNDO_WINDOW_MS,
  };
}
