// Production gated authoring mutations for the collaborative chain.
//
// Every public handler's FIRST act is requireMapAccess(..., 'edit'). Field
// setters equality-skip before patching so an unchanged pick writes nothing
// and fans out to nobody. Sever/restore are the sole public tombstone pathway;
// the earlier single-row helpers are internal-only compatibility proof seams.
import { ConvexError, v } from 'convex/values';
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireMapAccess } from './lib/mapAccess';
import {
  requireConnectionOnMap,
  requireLiveConnectionOnMap,
} from './lib/mapConnectionLookup';
import {
  destinationHintValidator,
  lifeStageValidator,
  massStateValidator,
  optionalTimestampValidator,
  shipSizeValidator,
  typedSideValidator,
  validateDeathWindowInput,
  wormholeTypeCodeValidator,
  type WormholeLifeStage,
} from './lib/mapEntityContracts';
import {
  CHAIN_PURGE_BATCH,
  purgeExpiredChainTombstones as purgeExpiredChainTombstonesCore,
} from './lib/mapChainCleanup';
import { deleteSignatureActivity } from './lib/mapSignatures';
import { stampObservationKey } from './lib/observationKey';
import {
  beginSystemEdit,
  findSystem,
  requireSystemId,
} from './lib/mapSystemLookup';
import { readTrackedPilotSystemIds } from './mapTracking';
import {
  chainTombstoneStamps,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  decideCollapse,
  type CollapseDecision,
  type PilotsPresent,
} from '@/data/maps/chain-collapse';
import {
  MAP_EVENT_RETENTION_MS,
  type MapEventKind,
  type MapEventPayloadByKind,
} from '@/data/maps/chain-events';
import {
  deathWindowFrom,
  intersectOrReset,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import {
  isWormholeTypeCode,
  type ConnectionMassState,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';

/** Fail-closed cap for the per-system live-connection liveness proof. */
const LIVE_CONNECTION_SCAN_CAP = 32;

/**
 * Fail-closed bound for the empty-map proof in {@link setHomeSystem}. A map
 * with more systems than this (almost all tombstoned) refuses rather than
 * risking a false empty verdict from a truncated scan.
 */
const HOME_SYSTEM_SCAN_CAP = 128;

/** Fail-closed per-table bound for one collapse or shared-stamp restore. */
export const COLLAPSE_MAP_SCAN_CAP = 128;

interface BoundedMapTopology {
  readonly systems: readonly Doc<'mapSystems'>[];
  readonly connections: readonly Doc<'mapConnections'>[];
}

/** Loads both map-owned topology tables within one explicit transaction cap. */
async function readBoundedMapTopology(
  ctx: MutationCtx,
  mapId: string,
): Promise<BoundedMapTopology> {
  const systems = await ctx.db
    .query('mapSystems')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(COLLAPSE_MAP_SCAN_CAP + 1);
  const connections = await ctx.db
    .query('mapConnections')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(COLLAPSE_MAP_SCAN_CAP + 1);
  if (
    systems.length > COLLAPSE_MAP_SCAN_CAP ||
    connections.length > COLLAPSE_MAP_SCAN_CAP
  ) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${COLLAPSE_MAP_SCAN_CAP}-row collapse bound.`,
    });
  }
  return { systems, connections };
}

/** Resolves one connection inside an already-loaded bounded topology. */
function requireTopologyConnection(
  topology: BoundedMapTopology,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Doc<'mapConnections'> {
  const connection = topology.connections.find((row) => row._id === connectionId);
  if (connection === undefined) {
    throw new ConvexError({
      code: 'UNKNOWN_CONNECTION',
      detail: `No connection ${connectionId} on map ${mapId}.`,
    });
  }
  return connection;
}

/** Resolves the display actor from the already-authorized Convex identity. */
export async function eventActor(ctx: MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return typeof identity?.name === 'string' ? identity.name : 'unknown';
}

/** Inserts one typed ledger row in the caller's mutation transaction. */
export async function writeMapEvent<Kind extends MapEventKind>(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly at: number;
    readonly kind: Kind;
    readonly actor: string;
    readonly payload: MapEventPayloadByKind[Kind];
  },
): Promise<void> {
  // Re-materialize the payload's arrays: callers hand in readonly shapes while
  // the stored document type is mutable.
  const payload = 'signatureIds' in input.payload
    ? {
        systemId: input.payload.systemId,
        signatureIds: [...input.payload.signatureIds],
      }
    : 'systemIds' in input.payload
      ? {
          connectionId: input.payload.connectionId,
          systemIds: [...input.payload.systemIds],
        }
      : { connectionId: input.payload.connectionId };
  await ctx.db.insert('mapEvents', {
    mapId: input.mapId,
    at: input.at,
    kind: input.kind,
    actor: input.actor,
    payload,
    purgeAfter: input.at + MAP_EVENT_RETENTION_MS,
  });
}

/** Gate + load a connection for field/tombstone writers. */
async function gatedConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  return requireConnectionOnMap(ctx, mapId, connectionId);
}

/** Gate + load a live (non-tombstoned) connection for field setters. */
async function requireLiveConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  return await requireLiveConnectionOnMap(ctx, mapId, connectionId);
}

/** Gate + load a named system document, or throw UNKNOWN_SYSTEM. */
async function gatedSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapSystems'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(systemId);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null) {
    throw new ConvexError({
      code: 'UNKNOWN_SYSTEM',
      detail: `System ${systemId} is not on map ${mapId}.`,
    });
  }
  return system;
}

/**
 * Whether any LIVE connection still references one system, proven by two
 * exact indexed lookups with a small fail-closed cap each.
 */
async function readIncidentConnections(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapConnections'>[]> {
  const fromRows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_from', (q) => q.eq('mapId', mapId).eq('fromSystemId', systemId))
    .take(LIVE_CONNECTION_SCAN_CAP + 1);
  if (fromRows.length > LIVE_CONNECTION_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.`,
    });
  }
  const toRows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', systemId))
    .take(LIVE_CONNECTION_SCAN_CAP + 1);
  if (toRows.length > LIVE_CONNECTION_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.`,
    });
  }
  return [...new Map([...fromRows, ...toRows].map((row) => [row._id, row])).values()];
}

async function assertMapEmptyOfLiveSystems(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const existing = await ctx.db
    .query('mapSystems')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(HOME_SYSTEM_SCAN_CAP + 1);
  if (existing.length > HOME_SYSTEM_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${HOME_SYSTEM_SCAN_CAP}-system empty-map proof bound.`,
    });
  }
  if (existing.some((row) => !isTombstoned(row))) {
    throw new ConvexError({
      code: 'MAP_NOT_EMPTY',
      detail: `Map ${mapId} already has a live system.`,
    });
  }
}

/** Inserts the first live system once the empty-map proof passes. */
async function insertHomeSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  await beginSystemEdit(ctx, mapId, systemId);
  await assertMapEmptyOfLiveSystems(ctx, mapId);

  const prior = await findSystem(ctx, mapId, systemId);
  if (prior !== null) {
    // A previously tombstoned home of the same id must be restored, not
    // re-inserted — identity-preserving restore is the sanctioned path.
    if (isTombstoned(prior)) {
      throw new ConvexError({
        code: 'DESTINATION_TOMBSTONED',
        detail: `System ${systemId} is tombstoned on map ${mapId}; restore it instead.`,
      });
    }
    return prior._id;
  }

  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

/**
 * Sets the map's first (home) system. Refuses when any live system already
 * exists so one root holds by construction.
 */
export const setHomeSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) => insertHomeSystem(ctx, mapId, systemId),
});

async function requireLiveOrigin(
  ctx: MutationCtx,
  mapId: string,
  fromSystemId: number,
): Promise<void> {
  const origin = await findSystem(ctx, mapId, fromSystemId);
  if (origin === null || isTombstoned(origin)) {
    throw new ConvexError({
      code: 'UNKNOWN_ORIGIN',
      detail: `Origin system ${fromSystemId} is not a live system on map ${mapId}.`,
    });
  }
}

/** Upserts one live destination while preserving the human restore boundary. */
export async function upsertLiveDestination(
  ctx: MutationCtx,
  mapId: string,
  toSystemId: number,
): Promise<Id<'mapSystems'>> {
  const destination = await findSystem(ctx, mapId, toSystemId);
  if (destination !== null && isTombstoned(destination)) {
    throw new ConvexError({
      code: 'DESTINATION_TOMBSTONED',
      detail: `Destination system ${toSystemId} is tombstoned on map ${mapId}; restore it instead.`,
    });
  }
  if (destination !== null) return destination._id;
  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId: toSystemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

/** One-transaction add: live origin + destination upsert + connection insert. */
async function addFromNode(
  ctx: MutationCtx,
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
): Promise<{ systemId: Id<'mapSystems'>; connectionId: Id<'mapConnections'> }> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(fromSystemId);
  requireSystemId(toSystemId);
  if (fromSystemId === toSystemId) {
    throw new ConvexError({
      code: 'SELF_LOOP',
      detail: 'A connection must join two distinct systems.',
    });
  }
  await requireLiveOrigin(ctx, mapId, fromSystemId);
  const systemId = await upsertLiveDestination(ctx, mapId, toSystemId);
  const connectionId = await ctx.db.insert('mapConnections', {
    mapId,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    eolAt: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deletedAt: null,
    purgeAfter: null,
  });
  return { systemId, connectionId };
}

/**
 * Adds a destination from an existing live origin and inserts the connection
 * in one transaction so the reveal is whole on every subscriber.
 */
export const addSystemFromNode = mutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
  },
  handler: (ctx, { mapId, fromSystemId, toSystemId }) =>
    addFromNode(ctx, mapId, fromSystemId, toSystemId),
});

/** Equality-skipping patch helper for one connection field. */
async function patchConnectionField<K extends keyof Doc<'mapConnections'>>(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  field: K,
  value: Doc<'mapConnections'>[K],
  extra?: Partial<Doc<'mapConnections'>>,
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(ctx, mapId, connectionId);
  if (connection[field] === value) return { changed: false };
  await ctx.db.patch(connectionId, { [field]: value, ...extra });
  return { changed: true };
}

interface DeathWindowArgs {
  readonly deathEarliestAt?: number | null;
  readonly deathLatestAt?: number | null;
}

function storedDeathWindow(
  connection: Doc<'mapConnections'>,
): ConnectionDeathWindow | null {
  return deathWindowFrom(
    connection.deathEarliestAt ?? null,
    connection.deathLatestAt ?? null,
  );
}

/**
 * Intersects a client proposal with the stored window, resetting on a
 * contradiction. Omitted pairs preserve the current OW-3 client contract;
 * OW-4 supplies explicit proposals from the pure lifetime owner.
 */
function resolveDeathWindow(
  connection: Doc<'mapConnections'>,
  proposal: DeathWindowArgs,
): ConnectionDeathWindow | null {
  const hasEarliest = proposal.deathEarliestAt !== undefined;
  const hasLatest = proposal.deathLatestAt !== undefined;
  if (!hasEarliest && !hasLatest) return storedDeathWindow(connection);
  if (hasEarliest !== hasLatest) {
    validateDeathWindowInput({
      deathEarliestAt: proposal.deathEarliestAt,
      deathLatestAt: proposal.deathLatestAt,
    });
    throw new ConvexError({
      code: 'INVALID_DEATH_WINDOW',
      detail: 'Death-window timestamps must both be supplied.',
    });
  }

  validateDeathWindowInput(proposal);
  const earliestAt = proposal.deathEarliestAt;
  const latestAt = proposal.deathLatestAt;
  if (earliestAt === null || latestAt === null) {
    return null;
  }
  if (earliestAt === undefined || latestAt === undefined) {
    throw new ConvexError({
      code: 'INVALID_DEATH_WINDOW',
      detail: 'Death-window timestamps must both be supplied.',
    });
  }
  return intersectOrReset(storedDeathWindow(connection), {
    earliestAt,
    latestAt,
  });
}

function deathWindowPatch(window: ConnectionDeathWindow | null): {
  readonly deathEarliestAt: number | null;
  readonly deathLatestAt: number | null;
} {
  return {
    deathEarliestAt: window?.earliestAt ?? null,
    deathLatestAt: window?.latestAt ?? null,
  };
}

function sameDeathWindow(
  connection: Doc<'mapConnections'>,
  window: ConnectionDeathWindow | null,
): boolean {
  const current = deathWindowPatch(storedDeathWindow(connection));
  const next = deathWindowPatch(window);
  return current.deathEarliestAt === next.deathEarliestAt
    && current.deathLatestAt === next.deathLatestAt;
}

/** Field-scoped setter: wormhole type code (null = unidentified). */
export const setConnectionWormholeType = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: wormholeTypeCodeValidator,
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
  },
  handler: async (
    ctx,
    { mapId, connectionId, value, deathEarliestAt, deathLatestAt },
  ) => {
    // Gate before semantic validation so unauthorized callers never learn
    // whether a code is well-formed (HC-2 / gate-first).
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    if (value !== null && !isWormholeTypeCode(value)) {
      throw new ConvexError({
        code: 'INVALID_WORMHOLE_CODE',
        detail: `Unknown wormhole code "${value}".`,
      });
    }
    const window = resolveDeathWindow(connection, {
      deathEarliestAt,
      deathLatestAt,
    });
    const identityPatch = value === null
      ? {
          typedSide: undefined,
          typeProvenance: undefined,
          pendingCandidates: undefined,
          pendingResolutionCharacterId: undefined,
        }
      : {
          typedSide: connection.typedSide ?? ('from' as const),
          typeProvenance: 'human' as const,
          pendingCandidates: undefined,
          pendingResolutionCharacterId: undefined,
        };
    if (
      connection.wormholeTypeCode === value
      && connection.typedSide === identityPatch.typedSide
      && connection.typeProvenance === identityPatch.typeProvenance
      && connection.pendingCandidates === undefined
      && connection.pendingResolutionCharacterId === undefined
      && sameDeathWindow(connection, window)
    ) {
      return { changed: false };
    }
    await ctx.db.patch(connectionId, {
      wormholeTypeCode: value,
      ...identityPatch,
      // Typing a hole makes it observation-eligible, so a row that was never
      // jump-authored takes its dedupe key from the shared stamping rule.
      ...(value === null
        ? {}
        : stampObservationKey(connection.observationKey).patch),
      ...deathWindowPatch(window),
    });
    return { changed: true };
  },
});

/** Field-scoped setter: the side whose manually typed code is attributable. */
export const setConnectionTypedSide = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: typedSideValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    if (connection.wormholeTypeCode === null) {
      throw new ConvexError({
        code: 'UNTYPED_CONNECTION',
        detail: 'An unidentified connection has no attributable typed side.',
      });
    }
    if (
      connection.typedSide === value
      && connection.typeProvenance === 'human'
      && connection.pendingCandidates === undefined
      && connection.pendingResolutionCharacterId === undefined
    ) {
      return { changed: false };
    }
    await ctx.db.patch(connectionId, {
      typedSide: value,
      typeProvenance: 'human',
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
    return { changed: true };
  },
});

/** Field-scoped setter: one side's closed-vocabulary destination hint. */
export const setConnectionDestinationHint = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    side: typedSideValidator,
    value: v.union(destinationHintValidator, v.null()),
  },
  handler: async (ctx, { mapId, connectionId, side, value }) => {
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    const field = side === 'from' ? 'fromDestinationHint' : 'toDestinationHint';
    const normalized = value ?? undefined;
    if (
      connection[field] === normalized
      && connection.pendingCandidates === undefined
      && connection.pendingResolutionCharacterId === undefined
    ) {
      return { changed: false };
    }
    await ctx.db.patch(connectionId, {
      [field]: normalized,
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
    return { changed: true };
  },
});

/** Field-scoped setter: ship size class (null = unknown). */
export const setConnectionShipSize = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: shipSizeValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) =>
    await patchConnectionField(
      ctx,
      mapId,
      connectionId,
      'shipSize',
      value satisfies WormholeSizeClass | null,
    ),
});

/** Field-scoped setter: observed mass state (null = unobserved). */
export const setConnectionMassState = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: massStateValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    const observedMassAtStateKg = connection.observedMassKg ?? 0;
    if (
      connection.massState === value
      && connection.observedMassAtStateKg === observedMassAtStateKg
    ) {
      return { changed: false };
    }
    await ctx.db.patch(connectionId, {
      massState: value satisfies ConnectionMassState | null,
      observedMassAtStateKg,
    });
    return { changed: true };
  },
});

/**
 * Field-scoped setter: Reliable Lifetime bucket. Stamps
 * `lifeStageObservedAt` from server time on every accepted report — a stage
 * change, or a same-stage report whose window narrows — and skips only the
 * true no-op where neither the stage nor the stored window changes.
 */
export const setConnectionLifeStage = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: lifeStageValidator,
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
  },
  handler: async (
    ctx,
    { mapId, connectionId, value, deathEarliestAt, deathLatestAt },
  ) => {
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    const current = connection.lifeStage ?? null;
    const window = resolveDeathWindow(connection, {
      deathEarliestAt,
      deathLatestAt,
    });
    if (current === value && sameDeathWindow(connection, window)) {
      return { changed: false as const };
    }
    await ctx.db.patch(connectionId, {
      lifeStage: value satisfies WormholeLifeStage | null,
      lifeStageObservedAt: Date.now(),
      ...deathWindowPatch(window),
    });
    return { changed: true as const };
  },
});

async function stampSystemTombstone(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<{ tombstoned: true }> {
  const system = await gatedSystem(ctx, mapId, systemId);
  if (isTombstoned(system)) return { tombstoned: true };
  const incidentConnections = await readIncidentConnections(ctx, mapId, systemId);
  if (incidentConnections.some((connection) => !isTombstoned(connection))) {
    throw new ConvexError({
      code: 'SYSTEM_IN_USE',
      detail: `System ${systemId} still has a live connection on map ${mapId}.`,
    });
  }
  const stamps = chainTombstoneStamps(Date.now());
  await ctx.db.patch(system._id, stamps);
  for (const connection of incidentConnections) {
    if (connection.purgeAfter !== stamps.purgeAfter) {
      await ctx.db.patch(connection._id, { purgeAfter: stamps.purgeAfter });
    }
  }
  return { tombstoned: true };
}

async function stampConnectionTombstone(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<{ tombstoned: true }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (isTombstoned(connection)) return { tombstoned: true };
  await ctx.db.patch(connectionId, chainTombstoneStamps(Date.now()));
  return { tombstoned: true };
}

async function clearSystemTombstone(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<{ restored: true }> {
  const system = await gatedSystem(ctx, mapId, systemId);
  if (!isTombstoned(system)) return { restored: true };
  await ctx.db.patch(system._id, { deletedAt: null, purgeAfter: null });
  return { restored: true };
}

async function requireLiveEndpoint(
  ctx: MutationCtx,
  mapId: string,
  endpointId: number,
): Promise<void> {
  const endpoint = await findSystem(ctx, mapId, endpointId);
  if (endpoint === null || isTombstoned(endpoint)) {
    throw new ConvexError({
      code: 'ENDPOINT_TOMBSTONED',
      detail: `Endpoint system ${endpointId} is missing or tombstoned on map ${mapId}.`,
    });
  }
}

async function clearConnectionTombstone(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<{ restored: true; changed: boolean }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (!isTombstoned(connection)) return { restored: true, changed: false };
  await requireLiveEndpoint(ctx, mapId, connection.fromSystemId);
  if (connection.toSystemId !== null) {
    await requireLiveEndpoint(ctx, mapId, connection.toSystemId);
  }
  await ctx.db.patch(connectionId, { deletedAt: null, purgeAfter: null });
  return { restored: true, changed: true };
}

/**
 * Internalized .1 proof seam: tombstones one system after the liveness check.
 * Production destruction flows only through {@link severConnection}.
 */
export const tombstoneSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    stampSystemTombstone(ctx, mapId, systemId),
});

/** Internalized .1 proof seam for the collapse pathway's row stamp helper. */
export const tombstoneConnection = internalMutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    stampConnectionTombstone(ctx, mapId, connectionId),
});

/**
 * Internalized .1 proof seam for identity-preserving system restoration.
 * Branch restoration is the only production caller that clears system stamps.
 */
export const restoreSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    clearSystemTombstone(ctx, mapId, systemId),
});

/** Returns a collision-free shared tombstone stamp within the bounded map. */
function uniqueTombstoneStamp(
  topology: BoundedMapTopology,
  proposedAt: number,
): number {
  const used = new Set<number>();
  for (const row of [...topology.systems, ...topology.connections]) {
    if (typeof row.deletedAt === 'number' && Number.isFinite(row.deletedAt)) {
      used.add(row.deletedAt);
    }
  }
  let deletedAt = proposedAt;
  while (used.has(deletedAt)) deletedAt += 1;
  return deletedAt;
}

/** Computes the live collapse outcome and fails closed on malformed topology. */
function collapseDecision(
  topology: BoundedMapTopology,
  cut: Doc<'mapConnections'>,
  pilotsPresent: PilotsPresent,
): CollapseDecision {
  if (isTombstoned(cut)) {
    throw new ConvexError({
      code: 'CONNECTION_TOMBSTONED',
      detail: `Connection ${cut._id} is already tombstoned.`,
    });
  }
  if (cut.toSystemId === null) {
    throw new ConvexError({
      code: 'UNRESOLVED_CONNECTION',
      detail: `Connection ${cut._id} has no resolved destination to sever.`,
    });
  }

  const systems = topology.systems.filter((row) => !isTombstoned(row));
  const systemIds = new Set(systems.map((row) => row.systemId));
  // Keep stubs in the bounded topology for the write/restore set, but only
  // resolved live rows form graph edges for the collapse decision.
  const connections = topology.connections.filter(
    (row): row is Doc<'mapConnections'> & { toSystemId: number } =>
      !isTombstoned(row) && row.toSystemId !== null,
  );
  for (const connection of connections) {
    if (
      !systemIds.has(connection.fromSystemId) ||
      !systemIds.has(connection.toSystemId)
    ) {
      throw new ConvexError({
        code: 'INVALID_MAP_TOPOLOGY',
        detail: `Live connection ${connection._id} has a missing or tombstoned endpoint.`,
      });
    }
  }

  const rootSystemId = systems[0]?.systemId;
  return decideCollapse({
    cutConnectionId: String(cut._id),
    systems: systems.map((row) => ({
      id: row.systemId,
      isRoot: row.systemId === rootSystemId,
    })),
    connections: connections.map((row) => ({
      id: String(row._id),
      fromSystemId: row.fromSystemId,
      toSystemId: row.toSystemId,
    })),
    pilotsPresent,
  });
}

/**
 * Pilot knowledge a collapse trigger supplies: a literal verdict, or the
 * tracked pilots' current systems for the core to grade against the orphan set.
 */
export type CollapsePilotsPresent =
  | PilotsPresent
  | { readonly trackedInSystemIds: ReadonlySet<number> };

/**
 * Resolves the collapse decision for one cut under the trigger's pilot
 * knowledge. Tracked presence is graded against the would-be-orphaned set: a
 * tracked pilot inside it upgrades the verdict to 'present', which retains
 * every component and removes the dead connection alone.
 */
function collapseOutcome(
  topology: BoundedMapTopology,
  cut: Doc<'mapConnections'>,
  pilotsPresent: CollapsePilotsPresent,
): CollapseDecision {
  if (typeof pilotsPresent === 'string') {
    return collapseDecision(topology, cut, pilotsPresent);
  }
  const preview = collapseDecision(topology, cut, 'absent');
  if (preview.kind === 'retain') return preview;
  const pilotInOrphanedBranch = preview.systemIds.some((systemId) =>
    pilotsPresent.trackedInSystemIds.has(systemId),
  );
  return pilotInOrphanedBranch
    ? collapseDecision(topology, cut, 'present')
    : preview;
}

type RemoveCollapseDecision = Extract<CollapseDecision, { kind: 'remove' }>;

interface SeverWriteContext {
  readonly ctx: MutationCtx;
  readonly mapId: string;
  readonly topology: BoundedMapTopology;
  readonly cut: Doc<'mapConnections'>;
  readonly actor: string;
  readonly deletedAt: number;
  readonly stamps: ReturnType<typeof chainTombstoneStamps>;
}

function shouldRearmSkeleton(
  row: Doc<'mapConnections'>,
  removedConnectionIds: ReadonlySet<string>,
  removedSystemIds: ReadonlySet<number>,
): boolean {
  const touchesRemovedSystem =
    removedSystemIds.has(row.fromSystemId)
    || (row.toSystemId !== null && removedSystemIds.has(row.toSystemId));
  return isTombstoned(row)
    && !removedConnectionIds.has(String(row._id))
    && touchesRemovedSystem;
}

/** Removes the last-seen companion of one tombstoned scanner-born connection. */
async function deleteConnectionActivity(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'>,
): Promise<void> {
  if (connection.fromSignatureId === undefined) return;
  await deleteSignatureActivity(ctx, {
    mapId: connection.mapId,
    systemId: connection.fromSystemId,
    signatureId: connection.fromSignatureId,
  });
}

/** Commits the retained-edge stamp and its matching event. */
async function writeRetainedSever(
  input: SeverWriteContext,
): Promise<{ outcome: 'retained' }> {
  await input.ctx.db.patch(input.cut._id, input.stamps);
  await deleteConnectionActivity(input.ctx, input.cut);
  await writeMapEvent(input.ctx, {
    mapId: input.mapId,
    at: input.deletedAt,
    kind: 'connection_severed_retained',
    actor: input.actor,
    payload: { connectionId: String(input.cut._id) },
  });
  return { outcome: 'retained' };
}

/** Applies the pure remove set without re-deriving any topology decision. */
async function stampRemovedRows(
  input: SeverWriteContext,
  decision: RemoveCollapseDecision,
): Promise<void> {
  const removedSystemIds = new Set(decision.systemIds);
  const removedConnectionIds = new Set(decision.connectionIds);
  const systems = input.topology.systems.filter((row) =>
    removedSystemIds.has(row.systemId),
  );
  const connections = input.topology.connections.filter((row) =>
    removedConnectionIds.has(String(row._id)),
  );
  const incidentStubs = input.topology.connections.filter(
    (row) =>
      row.toSystemId === null
      && !isTombstoned(row)
      && removedSystemIds.has(row.fromSystemId),
  );
  const skeletonsToRearm = input.topology.connections.filter(
    (row) => shouldRearmSkeleton(row, removedConnectionIds, removedSystemIds),
  );
  for (const system of systems) {
    await input.ctx.db.patch(system._id, input.stamps);
  }
  for (const connection of connections) {
    await input.ctx.db.patch(connection._id, input.stamps);
    await deleteConnectionActivity(input.ctx, connection);
  }
  for (const stub of incidentStubs) {
    await input.ctx.db.patch(stub._id, input.stamps);
    await deleteConnectionActivity(input.ctx, stub);
  }
  for (const connection of skeletonsToRearm) {
    await input.ctx.db.patch(connection._id, {
      purgeAfter: input.stamps.purgeAfter,
    });
  }
}

/** Commits a whole dead-branch removal and its matching event. */
async function writeRemovedSever(
  input: SeverWriteContext,
  decision: RemoveCollapseDecision,
): Promise<{ outcome: 'removed'; systemIds: number[] }> {
  await stampRemovedRows(input, decision);
  const systemIds = [...decision.systemIds];
  await writeMapEvent(input.ctx, {
    mapId: input.mapId,
    at: input.deletedAt,
    kind: 'branch_removed',
    actor: input.actor,
    payload: { connectionId: String(input.cut._id), systemIds },
  });
  return { outcome: 'removed', systemIds };
}

/** One collapse request an already-authorized trigger hands the shared core. */
export interface RunCollapseInput {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly actor: string;
  readonly pilotsPresent: CollapsePilotsPresent;
}

/** The committed outcome of one collapse transaction. */
export type RunCollapseResult =
  | { readonly outcome: 'retained' }
  | { readonly outcome: 'removed'; readonly systemIds: number[] };

/**
 * The one identity-parameterized collapse core. Every destructive trigger —
 * manual sever, confirmed re-paste removal, confident removal, and the ceiling
 * sweep — resolves the same decision and commits the same shared-stamp writes
 * and ledger event in the caller's transaction. Callers authorize first.
 */
export async function runCollapse(
  ctx: MutationCtx,
  input: RunCollapseInput,
): Promise<RunCollapseResult> {
  const topology = await readBoundedMapTopology(ctx, input.mapId);
  const cut = requireTopologyConnection(topology, input.mapId, input.connectionId);
  const decision = collapseOutcome(topology, cut, input.pilotsPresent);
  const deletedAt = uniqueTombstoneStamp(topology, Date.now());
  const stamps = chainTombstoneStamps(deletedAt);
  const writeContext = {
    ctx,
    mapId: input.mapId,
    topology,
    cut,
    actor: input.actor,
    deletedAt,
    stamps,
  } satisfies SeverWriteContext;
  if (decision.kind === 'retain') {
    return await writeRetainedSever(writeContext);
  }
  return await writeRemovedSever(writeContext, decision);
}

async function gatedConnectionEdit<T>(
  ctx: MutationCtx,
  mapId: string,
  run: () => Promise<T>,
): Promise<T> {
  await requireMapAccess(ctx, mapId, 'edit');
  return await run();
}

/**
 * Severs one live connection through the single server-computed collapse core.
 * All row stamps and the matching ledger event commit in this transaction.
 */
export const severConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) =>
    await gatedConnectionEdit(ctx, mapId, async () =>
      runCollapse(ctx, {
        mapId,
        connectionId,
        actor: await eventActor(ctx),
        pilotsPresent: 'unknown',
      }),
    ),
});

async function requireRestorableEndpoints(
  ctx: MutationCtx,
  mapId: string,
  topology: BoundedMapTopology,
  connections: readonly Doc<'mapConnections'>[],
  restoredSystemIds: ReadonlySet<number>,
): Promise<void> {
  for (const row of connections) {
    const endpointIds = row.toSystemId === null
      ? [row.fromSystemId]
      : [row.fromSystemId, row.toSystemId];
    for (const endpointId of endpointIds) {
      if (restoredSystemIds.has(endpointId)) continue;
      const endpoint = topology.systems.find(
        (system) => system.systemId === endpointId,
      );
      if (endpoint === undefined || isTombstoned(endpoint)) {
        throw new ConvexError({
          code: 'ENDPOINT_TOMBSTONED',
          detail: `Endpoint system ${endpointId} is missing or tombstoned on map ${mapId}.`,
        });
      }
    }
  }
}

/**
 * Restores every surviving row carrying one sever transaction's shared stamp —
 * the undo half of {@link runCollapse}, shared by the branch-restore mutation
 * and the signature flow's resolved-wormhole undo. Callers authorize first.
 * A repeated call is an identity-preserving no-op and writes no duplicate event.
 */
export async function runBranchRestore(
  ctx: MutationCtx,
  input: { readonly mapId: string; readonly connectionId: Id<'mapConnections'>; readonly actor: string },
): Promise<{ restored: true }> {
  const { mapId, connectionId } = input;
  const topology = await readBoundedMapTopology(ctx, mapId);
  const connection = requireTopologyConnection(topology, mapId, connectionId);
  if (!isTombstoned(connection)) return { restored: true as const };

  const deletedAt = connection.deletedAt;
  const systems = topology.systems.filter(
    (row) => row.deletedAt === deletedAt,
  );
  const connections = topology.connections.filter(
    (row) => row.deletedAt === deletedAt,
  );
  // Every restored connection needs two live endpoints. An endpoint outside
  // this sever's shared-stamp set may have been tombstoned by a LATER sever;
  // restoring around it would create a live connection with a dead endpoint,
  // which the collapse core rejects as INVALID_MAP_TOPOLOGY forever after.
  const restoredSystemIds = new Set(systems.map((row) => row.systemId));
  await requireRestorableEndpoints(
    ctx,
    mapId,
    topology,
    connections,
    restoredSystemIds,
  );
  for (const system of systems) {
    await ctx.db.patch(system._id, { deletedAt: null, purgeAfter: null });
  }
  for (const row of connections) {
    await ctx.db.patch(row._id, { deletedAt: null, purgeAfter: null });
  }
  const at = Date.now();
  await writeMapEvent(ctx, {
    mapId,
    at,
    kind: 'branch_restored',
    actor: input.actor,
    payload: {
      connectionId: String(connectionId),
      systemIds: systems.map((row) => row.systemId).sort((a, b) => a - b),
    },
  });
  return { restored: true as const };
}

/**
 * Restores every surviving row carrying one sever transaction's shared stamp.
 * A repeated call is an identity-preserving no-op and writes no duplicate event.
 */
export const restoreSeveredBranch = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) =>
    await gatedConnectionEdit(ctx, mapId, async () =>
      runBranchRestore(ctx, {
        mapId,
        connectionId,
        actor: await eventActor(ctx),
      }),
    ),
});

/**
 * Restores one tombstoned connection. Refuses when either endpoint system is
 * still tombstoned and records the identity-preserving restore atomically.
 */
export const restoreConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    const result = await clearConnectionTombstone(ctx, mapId, connectionId);
    if (result.changed) {
      const at = Date.now();
      await writeMapEvent(ctx, {
        mapId,
        at,
        kind: 'connection_restored',
        actor: await eventActor(ctx),
        payload: { connectionId: String(connectionId) },
      });
    }
    return { restored: true as const };
  },
});

/**
 * Grace past a stored `deathLatestAt` ceiling before the sweep may collapse.
 * The ceiling itself already overestimates remaining life (first-seen is a
 * lower bound on age), so ceiling + grace can never precede a hole's true
 * death — the HC-2 guarantee that expiry never removes a live connection.
 */
export const CEILING_COLLAPSE_GRACE_MS = 4 * 60 * 60 * 1000;

/**
 * Rows one ceiling sweep call processes. Each resolved collapse reads a
 * bounded topology plus the map's tracked-pilot join, so the batch stays small
 * and the 15-minute cadence plus `hasMore` drain any backlog.
 */
export const CEILING_SWEEP_BATCH = 8;

/**
 * Candidate rows one sweep call may read past failures. A row whose collapse
 * fails (for example an over-bound map) stays live at the head of the due
 * range, so the sweep reads a wider window and skips failing maps within it
 * rather than letting a poisoned head starve every other map's expiry.
 */
export const CEILING_SWEEP_SCAN = 64;

/** Ledger actor for scheduler-driven ceiling collapses (no caller identity). */
export const CEILING_SWEEP_ACTOR = 'lifetime expiry';

/**
 * Reads the due live-ceiling candidates. Live rows only, by construction: the
 * index leads with `deletedAt`, so a collapsed row (finite stamp) leaves the
 * candidate range the moment it is written and the bounded batch never
 * re-reads its own prior work. Two equality scans cover both live
 * representations — field absent and explicit null — because a Convex index
 * equality matches exactly one of them. The `> null` lower bound stays
 * load-bearing: undefined/null order below every number, so a bare
 * `<= cutoff` would match every windowless live row.
 */
async function readDueCeilings(
  ctx: MutationCtx,
  cutoff: number,
): Promise<{ due: Doc<'mapConnections'>[]; overflow: boolean }> {
  const range = (deletedAt: null | undefined) =>
    ctx.db
      .query('mapConnections')
      .withIndex('by_deleted_death_latest', (q) =>
        q
          .eq('deletedAt', deletedAt)
          .gt('deathLatestAt', null)
          .lte('deathLatestAt', cutoff),
      )
      .take(CEILING_SWEEP_SCAN + 1);
  const [unset, nulled] = await Promise.all([range(undefined), range(null)]);
  return {
    due: [...unset, ...nulled].sort(
      (left, right) => (left.deathLatestAt ?? 0) - (right.deathLatestAt ?? 0),
    ),
    overflow: unset.length > CEILING_SWEEP_SCAN || nulled.length > CEILING_SWEEP_SCAN,
  };
}

/**
 * Collapses one due resolved row, reporting failure instead of throwing.
 * Safe to continue past a failure: the presence read and runCollapse throw
 * only before this row's first write (the bounded reads and pure collapse
 * decision all precede the stamp writes), so a caught failure has committed
 * nothing for this row and it stays live for a later sweep.
 */
async function collapseDueRow(
  ctx: MutationCtx,
  row: Doc<'mapConnections'>,
  trackedByMap: Map<string, ReadonlySet<number>>,
): Promise<boolean> {
  try {
    let tracked = trackedByMap.get(row.mapId);
    if (tracked === undefined) {
      tracked = await readTrackedPilotSystemIds(ctx, row.mapId);
      trackedByMap.set(row.mapId, tracked);
    }
    await runCollapse(ctx, {
      mapId: row.mapId,
      connectionId: row._id,
      actor: CEILING_SWEEP_ACTOR,
      pilotsPresent: { trackedInSystemIds: tracked },
    });
    return true;
  } catch {
    return false;
  }
}

type RemovedStubEvents = Map<
  string,
  { mapId: string; systemId: number; signatureIds: string[] }
>;

/** Accumulates one swept stub into its per-(map, system) removal event. */
function recordRemovedStub(events: RemovedStubEvents, stub: Doc<'mapConnections'>): void {
  if (stub.fromSignatureId === undefined) return;
  const key = `${stub.mapId}:${stub.fromSystemId}`;
  const entry = events.get(key) ?? {
    mapId: stub.mapId,
    systemId: stub.fromSystemId,
    signatureIds: [],
  };
  entry.signatureIds.push(stub.fromSignatureId);
  events.set(key, entry);
}

/**
 * Collapses connections whose death ceiling passed more than the grace ago —
 * the one sanctioned scheduler trigger. Resolved cuts route through
 * {@link runCollapse} with pilot presence from tracking; expired unresolved
 * stubs tombstone directly (no branch decision exists for a stub).
 */
export async function sweepExpiredCeilings(
  ctx: MutationCtx,
  now: number,
): Promise<{
  collapsed: number;
  removedStubs: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
}> {
  const { due, overflow } = await readDueCeilings(ctx, now - CEILING_COLLAPSE_GRACE_MS);
  const trackedByMap = new Map<string, ReadonlySet<number>>();
  const failedMapIds = new Set<string>();
  const stubEvents: RemovedStubEvents = new Map();
  let collapsed = 0;
  let removedStubs = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;
  for (; index < due.length && collapsed + removedStubs < CEILING_SWEEP_BATCH; index += 1) {
    // `due` is proven non-sparse by the loop bound; index access is total.
    const row = due[index]!;
    if (failedMapIds.has(row.mapId)) {
      failed += 1;
      continue;
    }
    // Re-read: an earlier collapse in this batch may have tombstoned this row
    // as branch collateral. Tombstoned or purged rows are skipped, so a sweep
    // meeting an already-severed row stays idempotent.
    const fresh = await ctx.db.get(row._id);
    if (fresh === null || isTombstoned(fresh)) {
      skipped += 1;
      continue;
    }
    if (fresh.toSystemId === null) {
      await ctx.db.patch(fresh._id, chainTombstoneStamps(now));
      await deleteConnectionActivity(ctx, fresh);
      recordRemovedStub(stubEvents, fresh);
      removedStubs += 1;
    } else if (await collapseDueRow(ctx, fresh, trackedByMap)) {
      collapsed += 1;
    } else {
      // Memoized as failing so the map's sibling rows do not burn the batch.
      failedMapIds.add(fresh.mapId);
      failed += 1;
    }
  }
  for (const entry of stubEvents.values()) {
    // Silently swept stubs leave a restorable paper trail.
    await writeMapEvent(ctx, {
      mapId: entry.mapId,
      at: now,
      kind: 'signatures_removed',
      actor: CEILING_SWEEP_ACTOR,
      payload: { systemId: entry.systemId, signatureIds: entry.signatureIds },
    });
  }
  return { collapsed, removedStubs, skipped, failed, hasMore: index < due.length || overflow };
}

/**
 * Cron entry for the grace-buffered ceiling sweep — the recorded narrow
 * exception to "no scheduler flips a state" (death already certain).
 */
export const collapseExpiredConnections = internalMutation({
  args: {},
  handler: async (ctx) => await sweepExpiredCeilings(ctx, Date.now()),
});

/**
 * Drains expired chain tombstones and map events in one bounded batch.
 * Internal only — the sole hard-delete owner for these collaborative rows.
 */
export const purgeExpiredChainTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredChainTombstonesCore(ctx, Date.now()),
});

/** Re-exported so the proof suite pins the same cap the cleanup owner enforces. */
export { CHAIN_PURGE_BATCH };
