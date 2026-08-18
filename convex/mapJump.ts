// Transactional Convex owner for automatic wormhole-jump authoring.
//
// The public Next.js route is the cross-store composition owner. It obtains one
// evidence snapshot through jumpEvidence, classifies and matches outside
// Convex, then calls exactly one mutation here. That mutation treats the prior
// evidence as advisory and revalidates access, tracking, location, topology,
// candidates, and the exactly-once stamp before any write.
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import {
  requireMapAccessForUser,
  tryMapAccessForUser,
} from './lib/mapAccess';
import {
  readOriginConnections,
  requireLiveConnectionOnMap,
} from './lib/mapConnectionLookup';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import { upsertLiveDestination } from './mapAuthoring';
import {
  chainTombstoneState,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  connectionDoorTypes,
  legacyTypeSnapshot,
  storedDoorTypes,
} from '@/data/maps/connection-door-types';

/** Fail-closed bounds for one map's hot tracking and candidate ranges. */
const JUMP_TRACKING_SCAN_CAP = 256;
const JUMP_CONNECTION_SCAN_CAP = 64;

const jumpDecisionValidator = v.union(
  v.object({
    kind: v.literal('resolve'),
    candidateId: v.id('mapConnections'),
    provenance: v.union(v.literal('jump-verified'), v.literal('assumed')),
    candidateIds: v.array(v.id('mapConnections')),
    survivors: v.array(v.id('mapConnections')),
  }),
  v.object({
    kind: v.literal('insert'),
    candidateIds: v.array(v.id('mapConnections')),
    survivors: v.array(v.id('mapConnections')),
  }),
);

interface TrackedLocation {
  readonly tracking: Doc<'mapTracking'>;
  readonly location: Doc<'characterLocation'>;
}

interface EmissionFacts {
  readonly connectionId: Id<'mapConnections'>;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: 'from' | 'to' | null;
  readonly destinationProvenance:
    | Doc<'mapConnections'>['destinationProvenance']
    | null;
  readonly observationKey: string | null;
}

type JumpDecision =
  | {
      readonly kind: 'resolve';
      readonly candidateId: Id<'mapConnections'>;
      readonly provenance: 'jump-verified' | 'assumed';
      readonly candidateIds: readonly Id<'mapConnections'>[];
      readonly survivors: readonly Id<'mapConnections'>[];
    }
  | {
      readonly kind: 'insert';
      readonly candidateIds: readonly Id<'mapConnections'>[];
      readonly survivors: readonly Id<'mapConnections'>[];
    };

interface ResolveJumpInput {
  readonly userId: string;
  readonly mapId: string;
  readonly characterId: number;
  readonly fromSolarSystemId: number;
  readonly toSolarSystemId: number;
  readonly transitionObservedAt: number;
  readonly observedShipMassKg: number | null;
  readonly observationKey: string;
  readonly decision: JumpDecision;
}

type StaleReason =
  | 'same-system'
  | 'transition'
  | 'origin'
  | 'candidates'
  | 'survivors'
  | 'selected-candidate'
  | 'candidate';

interface StaleResult {
  readonly status: 'stale';
  readonly reason: StaleReason;
}

interface TopologyResult {
  readonly outcome: 'authored' | 'converged';
  readonly connection: Doc<'mapConnections'>;
}

function stale(reason: StaleReason): StaleResult {
  return { status: 'stale', reason };
}

/** Reads one bounded tracking row and its row-owned location document. */
async function readTrackedLocation(
  ctx: QueryCtx,
  mapId: string,
  characterId: number,
): Promise<TrackedLocation | null> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(JUMP_TRACKING_SCAN_CAP + 1);
  if (rows.length > JUMP_TRACKING_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the jump-tracking read bound.`,
    });
  }
  const matches = rows.filter((row) => row.characterId === characterId);
  // Only rows that join to a location document participate: `setTracking`
  // accepts any characterId from any viewer, so a forged row naming someone
  // else's character (which joins to nothing under the forger's userId) must
  // not be able to veto the genuine owner's tracking. More than one JOINABLE
  // row is real ambiguity and stays fail-closed.
  const joined: TrackedLocation[] = [];
  for (const tracking of matches) {
    const location = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', tracking.userId).eq('characterId', characterId),
      )
      .unique();
    if (location !== null) joined.push({ tracking, location });
  }
  if (joined.length !== 1) return null;
  // Exactly one joinable row was proved above.
  return joined[0]!;
}

/** Reads one bounded origin-side connection range. */
async function readConnectionsFrom(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  purpose: 'candidate' | 'pair',
): Promise<Doc<'mapConnections'>[]> {
  return await readOriginConnections(ctx, mapId, fromSystemId, {
    limit: JUMP_CONNECTION_SCAN_CAP,
    errorCode: 'MAP_TOO_LARGE',
    errorDetail: `Map ${mapId} exceeds the jump-${purpose} read bound.`,
  });
}

/** Live unresolved candidate rows within an origin-side read. */
function unresolvedCandidatesOf(
  rows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'>[] {
  return rows.filter((row) => row.toSystemId === null && !isTombstoned(row));
}

/** Reads one bounded active unresolved candidate pool for an origin. */
async function readUnresolvedCandidates(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
): Promise<Doc<'mapConnections'>[]> {
  return unresolvedCandidatesOf(
    await readConnectionsFrom(ctx, mapId, fromSystemId, 'candidate'),
  );
}

/**
 * Named types of every live scanned hole on this system's `from` mouth —
 * resolved hallways included, so an already-linked outgoing static still
 * counts. The `from` mouth is where stubs store this system's type; a blank
 * `from` mouth is omitted.
 */
function scannedTypeCodes(rows: readonly Doc<'mapConnections'>[]): string[] {
  return rows.flatMap((row) => {
    if (isTombstoned(row)) return [];
    const originType = storedDoorTypes(row).from;
    return originType === null ? [] : [originType];
  });
}

/** Reads both exact endpoint directions within explicit per-range bounds. */
async function readPairRows(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
): Promise<Doc<'mapConnections'>[]> {
  const forward = await readConnectionsFrom(ctx, mapId, fromSystemId, 'pair');
  const reverse = await readConnectionsFrom(ctx, mapId, toSystemId, 'pair');
  return [
    ...forward.filter((row) => row.toSystemId === toSystemId),
    ...reverse.filter((row) => row.toSystemId === fromSystemId),
  ];
}

function sameIds(
  left: readonly Id<'mapConnections'>[],
  right: readonly Id<'mapConnections'>[],
): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every((id) => rightSet.has(id));
}

function validObservedMass(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError({ code: 'INVALID_OBSERVED_MASS' });
  }
  return value;
}

function emissionFacts(connection: Doc<'mapConnections'>): EmissionFacts {
  const snapshot = legacyTypeSnapshot(
    connectionDoorTypes(connection),
    connection.typedSide ?? undefined,
  );
  return {
    connectionId: connection._id,
    fromSystemId: connection.fromSystemId,
    toSystemId: connection.toSystemId,
    wormholeTypeCode: snapshot.wormholeTypeCode,
    typedSide: snapshot.typedSide ?? null,
    destinationProvenance: connection.destinationProvenance ?? null,
    observationKey: connection.observationKey ?? null,
  };
}

/**
 * One consistent evidence snapshot for the server jump resolver. An absent or
 * insufficient edit claim returns `canEdit: false` and no map facts.
 */
export const jumpEvidence = internalQuery({
  args: {
    userId: v.string(),
    mapId: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, { userId, mapId, characterId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return {
        canEdit: false as const,
        tracked: false as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }

    const tracked = await readTrackedLocation(ctx, mapId, characterId);
    if (tracked === null) {
      return {
        canEdit: true as const,
        tracked: false as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }
    const { location } = tracked;
    if (location.transitionObservedAt === undefined) {
      return {
        canEdit: true as const,
        tracked: true as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }
    const stamp = await ctx.db
      .query('mapJumpBookkeeping')
      .withIndex('by_map_character', (q) =>
        q.eq('mapId', mapId).eq('characterId', characterId),
      )
      .unique();
    const fromSolarSystemId = location.prevSolarSystemId;
    const origin = fromSolarSystemId === null
      ? null
      : await findSystem(ctx, mapId, fromSolarSystemId);
    const originLive = origin !== null && !isTombstoned(origin);
    const originRows = originLive && fromSolarSystemId !== null
      ? await readConnectionsFrom(ctx, mapId, fromSolarSystemId, 'candidate')
      : [];
    const candidates = unresolvedCandidatesOf(originRows);

    return {
      canEdit: true as const,
      tracked: true as const,
      transition: {
        fromSolarSystemId: location.prevSolarSystemId,
        toSolarSystemId: location.solarSystemId,
        shipTypeId: location.shipTypeId,
        prevFresh: location.prevFresh,
        transitionObservedAt: location.transitionObservedAt,
      },
      lastProcessedTransitionAt: stamp?.lastProcessedTransitionAt ?? null,
      originLive,
      scannedTypeCodes: scannedTypeCodes(originRows),
      candidates: candidates.map((candidate) => ({
        id: candidate._id,
        wormholeTypeCode: candidate.wormholeTypeCode,
        destinationHint: candidate.fromDestinationHint,
        sizeClass: candidate.shipSize,
      })),
    };
  },
});

/**
 * Reads one edit-authorized resolved connection for post-mutation observation
 * emission. The client supplies only the id; both live endpoints and all
 * attributable facts are re-read from Convex truth.
 */
export const connectionEvidence = internalQuery({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { userId, mapId, connectionId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return { canEdit: false as const, connection: null };
    }
    const connection = await ctx.db.get(connectionId);
    if (
      connection === null
      || connection.mapId !== mapId
      || connection.toSystemId === null
      || isTombstoned(connection)
    ) {
      return { canEdit: true as const, connection: null };
    }
    const [fromSystem, toSystem] = await Promise.all([
      findSystem(ctx, mapId, connection.fromSystemId),
      findSystem(ctx, mapId, connection.toSystemId),
    ]);
    if (
      fromSystem === null
      || toSystem === null
      || isTombstoned(fromSystem)
      || isTombstoned(toSystem)
    ) {
      return { canEdit: true as const, connection: null };
    }
    return { canEdit: true as const, connection: emissionFacts(connection) };
  },
});

async function stampTransition(
  ctx: MutationCtx,
  mapId: string,
  characterId: number,
  transitionObservedAt: number,
  existing: Doc<'mapJumpBookkeeping'> | null,
): Promise<void> {
  if (existing === null) {
    await ctx.db.insert('mapJumpBookkeeping', {
      mapId,
      characterId,
      lastProcessedTransitionAt: transitionObservedAt,
    });
    return;
  }
  await ctx.db.patch(existing._id, {
    lastProcessedTransitionAt: transitionObservedAt,
  });
}

function connectionBase(
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
  observedMassKg: number | null,
  observationKey: string,
): Omit<Doc<'mapConnections'>, '_id' | '_creationTime'> {
  return {
    mapId,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    fromWormholeTypeCode: null,
    toWormholeTypeCode: null,
    massState: null,
    shipSize: null,
    eolAt: null,
    observedMassKg: observedMassKg ?? undefined,
    observationKey,
    lifeStage: null,
    lifeStageObservedAt: null,
    deletedAt: null,
    purgeAfter: null,
  };
}

interface ValidJumpInput {
  readonly observedShipMassKg: number | null;
}

type CandidateSelection =
  | {
      readonly kind: 'resolve';
      readonly candidate: Doc<'mapConnections'>;
      readonly provenance: 'jump-verified' | 'assumed';
      readonly survivors: readonly Id<'mapConnections'>[];
    }
  | { readonly kind: 'insert' };

function validateJumpInput(args: ResolveJumpInput): ValidJumpInput | StaleResult {
  requireSystemId(args.fromSolarSystemId);
  requireSystemId(args.toSolarSystemId);
  if (args.fromSolarSystemId === args.toSolarSystemId) return stale('same-system');
  if (
    !Number.isFinite(args.transitionObservedAt)
    || args.observationKey.trim() === ''
  ) {
    throw new ConvexError({ code: 'INVALID_JUMP_INPUT' });
  }
  return { observedShipMassKg: validObservedMass(args.observedShipMassKg) };
}

async function readTransitionStamp(
  ctx: QueryCtx,
  args: ResolveJumpInput,
): Promise<Doc<'mapJumpBookkeeping'> | null> {
  return await ctx.db
    .query('mapJumpBookkeeping')
    .withIndex('by_map_character', (q) =>
      q.eq('mapId', args.mapId).eq('characterId', args.characterId),
    )
    .unique();
}

function transitionMatches(
  tracked: TrackedLocation | null,
  args: ResolveJumpInput,
): boolean {
  return tracked !== null
    && tracked.location.prevFresh
    && tracked.location.prevSolarSystemId === args.fromSolarSystemId
    && tracked.location.solarSystemId === args.toSolarSystemId
    && tracked.location.transitionObservedAt === args.transitionObservedAt;
}

async function endpointLapse(
  ctx: QueryCtx,
  args: ResolveJumpInput,
): Promise<StaleResult | null> {
  const origin = await findSystem(ctx, args.mapId, args.fromSolarSystemId);
  if (origin === null || isTombstoned(origin)) return stale('origin');
  return null;
}

function selectExistingPair(
  pairRows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'> | null {
  const livePairs = pairRows.filter((row) => !isTombstoned(row));
  if (livePairs.length > 1) {
    throw new ConvexError({ code: 'DUPLICATE_LIVE_CONNECTION' });
  }
  return livePairs[0] ?? null;
}

function nextObservedMass(
  connection: Doc<'mapConnections'>,
  observedShipMassKg: number | null,
): number | undefined {
  const observedMassKg =
    (connection.observedMassKg ?? 0) + (observedShipMassKg ?? 0);
  return observedMassKg === 0 ? undefined : observedMassKg;
}

async function convergeExistingPair(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'>,
  args: ResolveJumpInput,
  observedShipMassKg: number | null,
): Promise<TopologyResult> {
  const patch = {
    observedMassKg: nextObservedMass(connection, observedShipMassKg),
    observationKey: connection.observationKey ?? args.observationKey,
  };
  await ctx.db.patch(connection._id, patch);
  return { outcome: 'converged', connection: { ...connection, ...patch } };
}

function validateCandidateDecision(
  candidates: readonly Doc<'mapConnections'>[],
  decision: JumpDecision,
): CandidateSelection | StaleResult {
  if (!sameIds(candidates.map((row) => row._id), decision.candidateIds)) {
    return stale('candidates');
  }
  if (decision.survivors.length > JUMP_CONNECTION_SCAN_CAP) {
    throw new ConvexError({ code: 'TOO_MANY_CANDIDATES' });
  }
  const survivorSet = new Set(decision.survivors);
  if (
    survivorSet.size !== decision.survivors.length
    || decision.survivors.some((id) => !decision.candidateIds.includes(id))
  ) {
    return stale('survivors');
  }
  if (decision.kind === 'insert') return { kind: 'insert' };
  if (!survivorSet.has(decision.candidateId)) return stale('selected-candidate');
  const candidate = candidates.find((row) => row._id === decision.candidateId);
  return candidate === undefined
    ? stale('candidate')
    : {
        kind: 'resolve',
        candidate,
        provenance: decision.provenance,
        survivors: decision.survivors,
      };
}

async function resolveCandidateTopology(
  ctx: MutationCtx,
  args: ResolveJumpInput,
  selection: Extract<CandidateSelection, { kind: 'resolve' }>,
  observedShipMassKg: number | null,
): Promise<TopologyResult> {
  const { candidate } = selection;
  const ambiguous =
    selection.provenance === 'assumed' && selection.survivors.length > 1;
  const patch = {
    toSystemId: args.toSolarSystemId,
    destinationProvenance: selection.provenance,
    pendingCandidates: ambiguous ? [...selection.survivors] : undefined,
    pendingResolutionCharacterId: ambiguous ? args.characterId : undefined,
    observedMassKg: nextObservedMass(candidate, observedShipMassKg),
    observationKey: candidate.observationKey ?? args.observationKey,
  } as const;
  await ctx.db.patch(candidate._id, patch);
  return { outcome: 'authored', connection: { ...candidate, ...patch } };
}

async function insertJumpTopology(
  ctx: MutationCtx,
  args: ResolveJumpInput,
  observedShipMassKg: number | null,
): Promise<TopologyResult> {
  const connectionId = await ctx.db.insert(
    'mapConnections',
    connectionBase(
      args.mapId,
      args.fromSolarSystemId,
      args.toSolarSystemId,
      observedShipMassKg,
      args.observationKey,
    ),
  );
  const connection = await ctx.db.get(connectionId);
  if (connection === null) {
    throw new ConvexError({ code: 'INSERTED_CONNECTION_MISSING' });
  }
  return { outcome: 'authored', connection };
}

/**
 * A remapped jump authors a new live pair. The collapsed corpse stays
 * tombstoned (HC-3: jump does not undo the old hole) but its dying window
 * closes so the canvas does not underline the new line with the old undo.
 */
async function supersedeDyingPairConnections(
  ctx: MutationCtx,
  pairRows: readonly Doc<'mapConnections'>[],
  liveId: Id<'mapConnections'>,
  now: number,
): Promise<void> {
  for (const row of pairRows) {
    if (row._id === liveId) continue;
    if (chainTombstoneState(row, now) !== 'dying') continue;
    await ctx.db.patch(row._id, { purgeAfter: now });
  }
}

async function authorNewTopology(
  ctx: MutationCtx,
  args: ResolveJumpInput,
  observedShipMassKg: number | null,
  pairRows: readonly Doc<'mapConnections'>[],
  now: number,
): Promise<TopologyResult | StaleResult> {
  const candidates = await readUnresolvedCandidates(
    ctx,
    args.mapId,
    args.fromSolarSystemId,
  );
  const selection = validateCandidateDecision(candidates, args.decision);
  if ('status' in selection) return selection;

  await upsertLiveDestination(ctx, args.mapId, args.toSolarSystemId);
  const authored = selection.kind === 'resolve'
    ? await resolveCandidateTopology(ctx, args, selection, observedShipMassKg)
    : await insertJumpTopology(ctx, args, observedShipMassKg);
  await supersedeDyingPairConnections(ctx, pairRows, authored.connection._id, now);
  return authored;
}

/**
 * Revalidates and authors one tracked transition atomically. Repeated requests
 * converge through the durable per-(map,character) transition stamp; separate
 * scouts crossing the same pair still add their own observed mass.
 */
export const resolveJumpAuthoring = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    characterId: v.number(),
    fromSolarSystemId: v.number(),
    toSolarSystemId: v.number(),
    transitionObservedAt: v.number(),
    observedShipMassKg: v.union(v.number(), v.null()),
    observationKey: v.string(),
    decision: jumpDecisionValidator,
  },
  handler: async (ctx, args) => {
    await requireMapAccessForUser(ctx, args.mapId, args.userId, 'edit');
    const validated = validateJumpInput(args);
    if ('status' in validated) return validated;
    const stamp = await readTransitionStamp(ctx, args);
    if (
      stamp !== null
      && stamp.lastProcessedTransitionAt >= args.transitionObservedAt
    ) {
      return { status: 'converged' as const, reason: 'processed' as const };
    }

    const tracked = await readTrackedLocation(ctx, args.mapId, args.characterId);
    if (!transitionMatches(tracked, args)) return stale('transition');
    const lapse = await endpointLapse(ctx, args);
    if (lapse !== null) return lapse;

    const pairRows = await readPairRows(
      ctx,
      args.mapId,
      args.fromSolarSystemId,
      args.toSolarSystemId,
    );
    const existingPair = await selectExistingPair(pairRows);
    const now = Date.now();
    const topology = existingPair === null
      ? await authorNewTopology(ctx, args, validated.observedShipMassKg, pairRows, now)
      : await convergeExistingPair(
          ctx,
          existingPair,
          args,
          validated.observedShipMassKg,
        );
    if ('status' in topology) return topology;

    await stampTransition(
      ctx,
      args.mapId,
      args.characterId,
      args.transitionObservedAt,
      stamp,
    );
    return {
      status: topology.outcome,
      emission: emissionFacts(topology.connection),
    };
  },
});

/** Accepts an assumed automatic association and clears its pending prompt. */
export const confirmJumpIdentity = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { userId, mapId, connectionId }) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    const connection = await requireLiveConnectionOnMap(ctx, mapId, connectionId);
    if (connection.toSystemId === null) {
      throw new ConvexError({ code: 'UNRESOLVED_CONNECTION' });
    }
    if (
      connection.destinationProvenance !== 'assumed'
      && connection.destinationProvenance !== 'confirmed'
    ) {
      throw new ConvexError({ code: 'INVALID_CONFIRMATION' });
    }
    if (
      connection.destinationProvenance !== 'confirmed'
      || connection.pendingCandidates !== undefined
      || connection.pendingResolutionCharacterId !== undefined
    ) {
      await ctx.db.patch(connectionId, {
        destinationProvenance: 'confirmed',
        pendingCandidates: undefined,
        pendingResolutionCharacterId: undefined,
      });
    }
    return emissionFacts({
      ...connection,
      destinationProvenance: 'confirmed',
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
  },
});

/**
 * Corrects an automatic association by moving its destination facts to one
 * unresolved candidate. The vacated row remains the same signature identity
 * and becomes an unresolved slot again; a second call can reverse the move.
 */
export const reassociateJumpDestination = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    targetConnectionId: v.id('mapConnections'),
  },
  handler: async (
    ctx,
    { userId, mapId, connectionId, targetConnectionId },
  ) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    if (connectionId === targetConnectionId) {
      throw new ConvexError({ code: 'SAME_CONNECTION' });
    }
    const source = await requireLiveConnectionOnMap(ctx, mapId, connectionId);
    const target = await requireLiveConnectionOnMap(ctx, mapId, targetConnectionId);
    if (source.toSystemId === null || target.toSystemId !== null) {
      throw new ConvexError({ code: 'INVALID_REASSOCIATION' });
    }
    if (source.fromSystemId !== target.fromSystemId) {
      throw new ConvexError({ code: 'DIFFERENT_ORIGIN' });
    }
    if (
      target.observedMassKg !== undefined
      || target.observedMassAtStateKg !== undefined
      || target.observationKey !== undefined
    ) {
      throw new ConvexError({ code: 'TARGET_HAS_JUMP_FACTS' });
    }

    const moved = {
      toSystemId: source.toSystemId,
      toSignatureId: source.toSignatureId,
      toDestinationHint: source.toDestinationHint,
      destinationProvenance: 'human' as const,
      observedMassKg: source.observedMassKg,
      observedMassAtStateKg: source.observedMassAtStateKg,
      observationKey: source.observationKey,
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    };
    await ctx.db.patch(target._id, moved);
    await ctx.db.patch(source._id, {
      toSystemId: null,
      toSignatureId: undefined,
      toDestinationHint: undefined,
      destinationProvenance: undefined,
      observedMassKg: undefined,
      observedMassAtStateKg: undefined,
      observationKey: undefined,
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
    return emissionFacts({ ...target, ...moved });
  },
});
