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
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { requireMapAccessForUser } from './lib/mapAccess';
import { readOriginConnections } from './lib/mapConnectionLookup';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import { upsertLiveDestination } from './mapAuthoringHome';
import { chainTombstoneState, isTombstoned } from '@/data/maps/chain-contract';
import {
  emissionFacts,
  JUMP_CONNECTION_SCAN_CAP,
  readTrackedLocation,
  type TrackedLocation,
  unresolvedCandidatesOf,
} from './mapJumpReads';

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

async function readUnresolvedCandidates(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
): Promise<Doc<'mapConnections'>[]> {
  return unresolvedCandidatesOf(
    await readConnectionsFrom(ctx, mapId, fromSystemId, 'candidate'),
  );
}

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
    const existingPair = selectExistingPair(pairRows);
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
