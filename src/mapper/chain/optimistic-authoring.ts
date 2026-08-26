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
  connectionRemovedTombstone,
  isTombstoned,
  tombstoneDeletedAt,
} from '@/data/maps/chain-contract';
import {
  deathWindowForReport,
  intersectOrReset,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import type {
  WormholeDestinationHint,
  WormholeLifeStage,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { loadWormholeCodex } from '@/data/eve-data/universe-assets-client';
import { eliminateSignaturesAndAnnounce } from '../signatures/signature-elimination-client';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import {
  blankHallway,
  connectionLifetimeFrom,
  hallwayDoor,
  leadsToFromHint,
  leadsToFromSystem,
  lifetimeDeathWindow,
  lifetimeObservedAt,
  lifetimeStage,
  liveTombstone,
  replaceDoor,
} from '@/data/maps/connection-hallway';
import type {
  ConnectionDoorValue,
  ConnectionHallway,
  ConnectionLifetime,
  DoorLeadsTo,
} from '@/data/maps/connection-hallway';
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
export type OptimisticConnectionRow = ConnectionHallway & {
  readonly _id: string;
  readonly _creationTime: number;
};

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
    paginatedQuery: api.mapChainSystems.watchMapSystems,
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
  for (const { args, value } of localStore.getAllQueries(api.mapChainSystems.watchMapSystems)) {
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
    api.mapChainSystems.watchMapSystems,
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
    paginatedQuery: api.mapChainSystems.watchMapSystems,
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
    paginatedQuery: api.mapChainConnections.watchMapConnections,
    argsToMatch: { mapId: args.mapId },
    localQueryStore: localStore,
    item: {
      _id: optimisticTempId('mapConnections'),
      _creationTime: now,
      ...blankHallway({
        mapId: args.mapId,
        fromSystemId: args.fromSystemId,
        toSystemId: args.toSystemId,
      }),
    } satisfies OptimisticConnectionRow as never,
  });
}

export type ConnectionFieldPatch = Partial<
  Pick<
    OptimisticConnectionRow,
    | 'from'
    | 'to'
    | 'identity'
    | 'lifetime'
    | 'resolution'
    | 'tombstone'
    | 'shipSize'
    | 'massState'
  >
>;

/** Same-list field edits. Leads-to notes stay on the existing row. */
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
    api.mapChainConnections.watchMapConnections,
    { mapId: args.mapId },
    (row) =>
      row._id === args.connectionId ? { ...row, ...args.patch } : row,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchUnresolvedHoles,
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
    patch: connectionRemovedTombstone(now),
  });
}

/** Finds one loaded connection's shared sever stamp. */
function severStamp(
  localStore: OptimisticLocalStore,
  mapId: string,
  connectionId: string,
): number | null {
  for (const { args, value } of localStore.getAllQueries(
    api.mapChainConnections.watchMapConnections,
  )) {
    if (value === undefined || args.mapId !== mapId) continue;
    const connection = value.page.find((row) => row._id === connectionId);
    if (connection !== undefined && isTombstoned(connection)) {
      return tombstoneDeletedAt(connection);
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
    api.mapChainSystems.watchMapSystems,
    { mapId: args.mapId },
    (row) =>
      row.deletedAt === deletedAt
        ? { ...row, deletedAt: null, purgeAfter: null }
        : row,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchMapConnections,
    { mapId: args.mapId },
    (row) =>
      tombstoneDeletedAt(row) === deletedAt
        ? { ...row, tombstone: liveTombstone() }
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
    patch: { tombstone: liveTombstone() },
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
      lifetime: connectionLifetimeFrom({
        lifeStage: args.value,
        observedAt: now,
        death: deathWindowFromArgs(args),
      }),
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
    side?: 'from' | 'to';
    deathEarliestAt?: number | null;
    deathLatestAt?: number | null;
  },
): void {
  const apply = <Row extends OptimisticConnectionRow>(row: Row): Row => {
    if (row._id !== args.connectionId) return row;
    const typePatch = connectionTypePatch(
      row,
      args.side ?? 'from',
      args.value,
      args.value === null ? null : 'human',
    );
    return {
      ...row,
      ...typePatch,
      lifetime: connectionLifetimeFrom({
        lifeStage: lifetimeStage(row.lifetime),
        observedAt: lifetimeObservedAt(row.lifetime),
        death: deathWindowFromArgs(args),
      }),
    };
  };
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchMapConnections,
    { mapId: args.mapId },
    apply,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchUnresolvedHoles,
    { mapId: args.mapId },
    apply,
  );
}

/** Connection facts needed to form a stale-safe explicit window proposal. */
export interface ConnectionWindowSource {
  readonly connectionId: Id<'mapConnections'>;
  readonly _creationTime: number;
  readonly firstSeenAt: number | null;
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
  readonly lifetime: ConnectionLifetime;
}

function storedWindow(
  connection: ConnectionWindowSource,
): ConnectionDeathWindow | null {
  return lifetimeDeathWindow(connection.lifetime);
}

function deathWindowFromArgs(args: {
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}): ConnectionDeathWindow | null {
  const earliestAt = args.deathEarliestAt ?? null;
  const latestAt = args.deathLatestAt ?? null;
  if (earliestAt === null || latestAt === null) return null;
  return { earliestAt, latestAt };
}

function namedTypeCode(connection: {
  readonly from: ConnectionDoorValue;
  readonly to: ConnectionDoorValue;
}): string | null {
  return connection.from.typeCode ?? connection.to.typeCode;
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
  value: OptimisticConnectionRow['shipSize'] | OptimisticConnectionRow['massState'];
};

function optimisticPatchDoorLeadsTo(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    side: 'from' | 'to';
    leadsTo: DoorLeadsTo;
  },
): void {
  const apply = <Row extends OptimisticConnectionRow>(row: Row): Row => {
    if (row._id !== args.connectionId) return row;
    return {
      ...row,
      ...replaceDoor(row, args.side, {
        ...hallwayDoor(row, args.side),
        leadsTo: args.leadsTo,
      }),
    };
  };
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchMapConnections,
    { mapId: args.mapId },
    apply,
  );
  optimisticallyUpdateValueInPaginatedQuery(
    localStore,
    api.mapChainConnections.watchUnresolvedHoles,
    { mapId: args.mapId },
    apply,
  );
}

/** Optimistic Leads-to note on one door. Does not spawn a system or move the line. */
export function optimisticSetConnectionDestination(
  localStore: OptimisticLocalStore,
  args: {
    mapId: string;
    connectionId: string;
    side: 'from' | 'to';
    value: number | null;
  },
): void {
  optimisticPatchDoorLeadsTo(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    side: args.side,
    leadsTo: leadsToFromSystem(args.value),
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
  optimisticPatchDoorLeadsTo(localStore, {
    mapId: args.mapId,
    connectionId: args.connectionId,
    side: args.side,
    leadsTo: leadsToFromHint(args.value),
  });
}

/** Wires one field-scoped connection setter to a single-key optimistic patch. */
function optimisticConnectionField(
  field: 'shipSize' | 'massState',
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
    useMutation(api.mapAuthoringHome.setHomeSystem).withOptimisticUpdate(
      optimisticSetHomeSystem,
    ),
  );
  const addSystemFromNode = swallowMutationRejection(
    useMutation(api.mapAuthoringHome.addSystemFromNode).withOptimisticUpdate(
      optimisticAddSystemFromNode,
    ),
  );
  const setConnectionWormholeType = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionWormholeType).withOptimisticUpdate(
      optimisticSetConnectionWormholeType,
    ),
  );
  const setConnectionShipSize = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionShipSize).withOptimisticUpdate(
      optimisticConnectionField('shipSize'),
    ),
  );
  const setConnectionMassState = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionMassState).withOptimisticUpdate(
      optimisticConnectionField('massState'),
    ),
  );
  const setConnectionLifeStage = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionLifeStage).withOptimisticUpdate(
      optimisticSetConnectionLifeStage,
    ),
  );
  const setConnectionDestinationHint = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionDestinationHint).withOptimisticUpdate(
      optimisticSetConnectionDestinationHint,
    ),
  );
  const setConnectionDestination = swallowMutationRejection(
    useMutation(api.mapAuthoringFields.setConnectionDestination).withOptimisticUpdate(
      optimisticSetConnectionDestination,
    ),
  );
  const severConnection = swallowMutationRejection(
    useMutation(api.mapAuthoringCollapse.severConnection).withOptimisticUpdate(
      optimisticSeverConnection,
    ),
  );
  const restoreSeveredBranch = swallowMutationRejection(
    useMutation(api.mapAuthoringCollapse.restoreSeveredBranch).withOptimisticUpdate(
      optimisticRestoreSeveredBranch,
    ),
  );
  const restoreConnection = swallowMutationRejection(
    useMutation(api.mapAuthoringTombstone.restoreConnection).withOptimisticUpdate(
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
      side?: 'from' | 'to';
    }) => {
      const proposal = wormholeTypeWindowProposal(
        args.connection,
        await lifetimeMinutesFor(args.value),
      );
      const result = await setConnectionWormholeType({
        mapId: args.mapId,
        connectionId: args.connection.connectionId,
        value: args.value,
        side: args.side,
        ...windowArgs(proposal),
      });
      if (result === undefined) return undefined;
      const typedSystemId = args.side === 'to'
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
        await lifetimeMinutesFor(namedTypeCode(args.connection)),
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
