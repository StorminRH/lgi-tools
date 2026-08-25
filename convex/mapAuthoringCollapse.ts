import { ConvexError, v } from 'convex/values';
import {
  chainTombstoneStamps,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  decideCollapse,
  type CollapseDecision,
  type PilotsPresent,
} from '@/data/maps/chain-collapse';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';
import { deleteSignatureActivity } from './lib/mapSignatures';
import { eventActor, writeMapEvent } from './mapAuthoringEvents';

export const COLLAPSE_MAP_SCAN_CAP = 128;

interface BoundedMapTopology {
  readonly systems: readonly Doc<'mapSystems'>[];
  readonly connections: readonly Doc<'mapConnections'>[];
}

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

export type CollapsePilotsPresent =
  | PilotsPresent
  | { readonly trackedInSystemIds: ReadonlySet<number> };

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

export async function deleteConnectionActivity(
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

interface RunCollapseInput {
  readonly mapId: string;
  readonly connectionId: Id<'mapConnections'>;
  readonly actor: string;
  readonly pilotsPresent: CollapsePilotsPresent;
}

type RunCollapseResult =
  | { readonly outcome: 'retained' }
  | { readonly outcome: 'already_applied' }
  | { readonly outcome: 'removed'; readonly systemIds: number[] };

export async function runCollapse(
  ctx: MutationCtx,
  input: RunCollapseInput,
): Promise<RunCollapseResult> {
  const topology = await readBoundedMapTopology(ctx, input.mapId);
  const cut = requireTopologyConnection(topology, input.mapId, input.connectionId);
  if (isTombstoned(cut)) {
    return { outcome: 'already_applied' };
  }
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

export async function runBranchRestore(
  ctx: MutationCtx,
  input: {
    readonly mapId: string;
    readonly connectionId: Id<'mapConnections'>;
    readonly actor: string;
  },
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

async function gatedAuthoringEdit<T>(
  ctx: MutationCtx,
  mapId: string,
  run: (actor: string) => Promise<T>,
): Promise<T> {
  await requireMapAccess(ctx, mapId, 'edit');
  return run(await eventActor(ctx));
}

export const severConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    gatedAuthoringEdit(ctx, mapId, (actor) =>
      runCollapse(ctx, {
        mapId,
        connectionId,
        actor,
        pilotsPresent: 'unknown',
      }),
    ),
});

export const restoreSeveredBranch = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    gatedAuthoringEdit(ctx, mapId, (actor) =>
      runBranchRestore(ctx, { mapId, connectionId, actor }),
    ),
});

