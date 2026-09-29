import { randomUUID } from 'node:crypto';
import type { AnyPgDb } from '@/lib/db-types';
import { systemSecurityClass } from '@/data/eve-data/security';
import {
  effectiveWormholeClassId,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import {
  getAdjacencyGraph,
  getSystemDirectory,
  getWormholeCodex,
  type AdjacencyAsset,
  type SystemDirectoryAsset,
  type WormholeCodexAsset,
} from '@/data/eve-data/universe-assets';
import { readShipMassByType } from '@/data/eve-data/queries';
import { matchJump } from '@/data/maps/hole-matching';
import { classifyMovement } from '@/data/maps/movement-classification';
import { resolveSignatureElimination } from '@/composition/signature-elimination/resolver';
import { observationFor } from '@/data/wh-observations/emission';
import {
  deleteWhObservation,
  insertWhObservation,
} from '@/data/wh-observations/queries';
import { readSystemStaticsForSystem } from '@/data/wh-statics/queries';
import type {
  JumpResolverRequest,
  JumpResolverResponse,
} from '@/data/maps/api-contract';
import {
  answerJump,
  authorJump,
  readConnectionEvidence,
  readTransitionEvidence,
  type AnswerJumpInput,
  type AuthorJumpInput,
  type AuthorJumpResult,
  type ConnectionEmissionFacts,
  type TransitionEvidence,
} from './convex-door';

const CAPSULE_TYPE_ID = 670;

const JUMP_CAPTURE_WINDOW_MS = 10 * 60_000;

export interface JumpResolverDependencies {
  readonly readTransitionEvidence: typeof readTransitionEvidence;
  readonly readConnectionEvidence: typeof readConnectionEvidence;
  readonly authorJump: typeof authorJump;
  readonly answerJump: typeof answerJump;
  readonly getSystemDirectory: () => Promise<SystemDirectoryAsset>;
  readonly getAdjacencyGraph: () => Promise<AdjacencyAsset>;
  readonly getWormholeCodex: () => Promise<WormholeCodexAsset>;
  readonly readSystemStaticsForSystem: typeof readSystemStaticsForSystem;
  readonly readShipMassByType: typeof readShipMassByType;
  readonly insertWhObservation: typeof insertWhObservation;
  readonly deleteWhObservation: typeof deleteWhObservation;
  readonly newObservationKey: () => string;
  readonly now: () => number;
  readonly reportEmissionFailure: (cause: unknown) => void;
  readonly resolveSignatureElimination: typeof resolveSignatureElimination;
  readonly reportEliminationFailure: (cause: unknown) => void;
}

const productionDependencies: JumpResolverDependencies = {
  readTransitionEvidence,
  readConnectionEvidence,
  authorJump,
  answerJump,
  getSystemDirectory,
  getAdjacencyGraph,
  getWormholeCodex,
  readSystemStaticsForSystem,
  readShipMassByType,
  insertWhObservation,
  deleteWhObservation,
  newObservationKey: randomUUID,
  now: Date.now,
  reportEmissionFailure: (cause) => {
    console.error('Wormhole observation emission failed after Convex commit', cause);
  },
  resolveSignatureElimination,
  reportEliminationFailure: (cause) => {
    console.error('Signature elimination failed after Convex commit', cause);
  },
};

function skipped(reason: string): JumpResolverResponse {
  return { status: 'skipped', reason };
}

function retry(reason: string): JumpResolverResponse {
  return { status: 'retry', reason };
}

type ReadyTransitionEvidence = TransitionEvidence & {
  readonly transition: NonNullable<TransitionEvidence['transition']> & {
    readonly fromSolarSystemId: number;
  };
};

async function readReadyTransition(
  userId: string,
  request: Extract<JumpResolverRequest, { kind: 'doorbell' }>,
  dependencies: JumpResolverDependencies,
): Promise<ReadyTransitionEvidence | JumpResolverResponse> {
  let evidence: TransitionEvidence;
  try {
    evidence = await dependencies.readTransitionEvidence(
      userId,
      request.mapId,
      request.characterId,
    );
  } catch {
    return retry('convex-evidence');
  }
  if (!evidence.canEdit) return skipped('edit-access');
  if (!evidence.tracked) return skipped('not-tracked');
  if (evidence.transition === null) return skipped('re-anchor');
  if (
    evidence.lastProcessedTransitionAt !== null
    && evidence.lastProcessedTransitionAt >= evidence.transition.transitionObservedAt
  ) {
    return { status: 'processed', outcome: 'converged', emitted: false };
  }
  if (evidence.transition.fromSolarSystemId === null || !evidence.transition.prevFresh) {
    return skipped('re-anchor');
  }
  if (
    dependencies.now() - evidence.transition.transitionObservedAt
    > JUMP_CAPTURE_WINDOW_MS
  ) {
    return skipped('capture-window');
  }
  if (!evidence.originLive) return { status: 'stale', reason: 'origin' };
  return {
    ...evidence,
    transition: {
      ...evidence.transition,
      fromSolarSystemId: evidence.transition.fromSolarSystemId,
    },
  };
}

function systemFacts(
  systems: SystemDirectoryAsset,
  systemId: number,
) {
  const row = systems.systems.find((system) => system.id === systemId);
  return row === undefined
    ? null
    : { wormholeClassId: row.whClassId, securityStatus: row.security };
}

function gateLinked(
  adjacency: AdjacencyAsset,
  fromSystemId: number,
  toSystemId: number,
): boolean {
  const neighbours = adjacency.adjacency.find(([id]) => id === fromSystemId)?.[1];
  return neighbours?.includes(toSystemId) ?? false;
}

function isWormholeSpace(
  systems: SystemDirectoryAsset,
  systemId: number,
): boolean {
  const facts = systemFacts(systems, systemId);
  return (
    facts !== null
    && systemSecurityClass(facts.securityStatus, facts.wormholeClassId) === 'wormhole'
  );
}

const RETRYABLE_STALE_REASONS: ReadonlySet<string> = new Set([
  'candidates',
  'survivors',
  'selected-candidate',
  'candidate',
]);

function typedSideFacts(
  emission: ConnectionEmissionFacts,
): { typedSystemId: number; destinationSystemId: number } | null {
  if (emission.toSystemId === null || emission.typedSide === null) return null;
  return emission.typedSide === 'from'
    ? {
        typedSystemId: emission.fromSystemId,
        destinationSystemId: emission.toSystemId,
      }
    : {
        typedSystemId: emission.toSystemId,
        destinationSystemId: emission.fromSystemId,
      };
}

async function emitObservation(
  database: AnyPgDb,
  emission: ConnectionEmissionFacts,
  provenance: ConnectionProvenance,
  dependencies: JumpResolverDependencies,
): Promise<boolean> {
  const sides = typedSideFacts(emission);
  if (sides === null) return false;

  const [systems, codex] = await Promise.all([
    dependencies.getSystemDirectory(),
    dependencies.getWormholeCodex(),
  ]);
  const destination = systemFacts(systems, sides.destinationSystemId);
  if (destination === null) return false;
  const observation = observationFor(
    {
      typedSystemId: sides.typedSystemId,
      whTypeCode: emission.wormholeTypeCode,
      provenance,
      dedupeKey: emission.observationKey,
      destinationClassId: effectiveWormholeClassId(destination),
    },
    codex.types,
  );
  if (observation === null) return false;

  await dependencies.insertWhObservation(database, {
    ...observation,
    observedAt: new Date(dependencies.now()),
  });
  return true;
}

async function emitAfterCommit(
  database: AnyPgDb,
  emission: ConnectionEmissionFacts,
  provenance: ConnectionProvenance,
  dependencies: JumpResolverDependencies,
): Promise<boolean> {
  try {
    return await emitObservation(database, emission, provenance, dependencies);
  } catch (cause) {
    dependencies.reportEmissionFailure(cause);
    return false;
  }
}

async function eliminateAfterCommit(
  database: AnyPgDb,
  userId: string,
  mapId: string,
  emission: ConnectionEmissionFacts,
  dependencies: JumpResolverDependencies,
): Promise<void> {
  const systemIds = [
    ...new Set([
      emission.fromSystemId,
      ...(emission.toSystemId === null ? [] : [emission.toSystemId]),
    ]),
  ];
  try {
    await dependencies.resolveSignatureElimination(
      database,
      userId,
      { mapId, systemIds },
    );
  } catch (cause) {
    dependencies.reportEliminationFailure(cause);
  }
}

interface DoorbellGeography {
  readonly systems: SystemDirectoryAsset;
  readonly adjacency: AdjacencyAsset;
  readonly codex: WormholeCodexAsset;
}

async function loadDoorbellGeography(
  dependencies: JumpResolverDependencies,
): Promise<DoorbellGeography | null> {
  try {
    const [systems, adjacency, codex] = await Promise.all([
      dependencies.getSystemDirectory(),
      dependencies.getAdjacencyGraph(),
      dependencies.getWormholeCodex(),
    ]);
    return { systems, adjacency, codex };
  } catch {
    return null;
  }
}

function holeCrossingSkip(
  { systems, adjacency }: DoorbellGeography,
  transition: ReadyTransitionEvidence['transition'],
): JumpResolverResponse | null {
  const verdict = classifyMovement(
    {
      fromSolarSystemId: transition.fromSolarSystemId,
      toSolarSystemId: transition.toSolarSystemId,
      prevFresh: transition.prevFresh,
      shipBecameCapsule: transition.shipTypeId === CAPSULE_TYPE_ID,
      sameSystemStateChange: false,
    },
    {
      gateLinked: (from, to) => gateLinked(adjacency, from, to),
      isWormholeSpace: (systemId) => isWormholeSpace(systems, systemId),
    },
  );
  if (verdict !== 'hole-crossing') return skipped(verdict);
  if (
    !isWormholeSpace(systems, transition.fromSolarSystemId)
    && !isWormholeSpace(systems, transition.toSolarSystemId)
  ) {
    return skipped('known-space-crossing');
  }
  return null;
}

async function readJumpShipEvidence(
  database: AnyPgDb,
  transition: ReadyTransitionEvidence['transition'],
  dependencies: JumpResolverDependencies,
): Promise<{ staticTypeCodes: string[]; observedShipMassKg: number | null } | null> {
  try {
    const [staticTypeCodes, observedShipMassKg] = await Promise.all([
      dependencies.readSystemStaticsForSystem(
        database,
        transition.fromSolarSystemId,
      ),
      transition.shipTypeId === null
        ? Promise.resolve(null)
        : dependencies.readShipMassByType(database, transition.shipTypeId),
    ]);
    return { staticTypeCodes, observedShipMassKg };
  } catch {
    return null;
  }
}

async function settleAuthoredJump(
  database: AnyPgDb,
  userId: string,
  mapId: string,
  resolved: AuthorJumpResult,
  dependencies: JumpResolverDependencies,
): Promise<JumpResolverResponse> {
  if (resolved.status === 'stale') {
    return RETRYABLE_STALE_REASONS.has(resolved.reason)
      ? retry(resolved.reason)
      : resolved;
  }
  if ('reason' in resolved) {
    return { status: 'processed', outcome: 'converged', emitted: false };
  }
  if (resolved.emission.toSystemId === null) {
    return { status: 'processed', outcome: resolved.status, emitted: false };
  }
  await eliminateAfterCommit(
    database,
    userId,
    mapId,
    resolved.emission,
    dependencies,
  );
  const tier = resolved.emission.destinationProvenance;
  const emitted = tier === null
    ? false
    : await emitAfterCommit(database, resolved.emission, tier, dependencies);
  return { status: 'processed', outcome: resolved.status, emitted };
}

async function resolveDoorbell(
  database: AnyPgDb,
  userId: string,
  request: Extract<JumpResolverRequest, { kind: 'doorbell' }>,
  dependencies: JumpResolverDependencies,
): Promise<JumpResolverResponse> {
  const ready = await readReadyTransition(userId, request, dependencies);
  if ('status' in ready) return ready;
  const evidence = ready;
  const transition = evidence.transition;

  const geography = await loadDoorbellGeography(dependencies);
  if (geography === null) return retry('neon-geography');
  const origin = systemFacts(geography.systems, transition.fromSolarSystemId);
  const destination = systemFacts(geography.systems, transition.toSolarSystemId);
  if (origin === null || destination === null) return retry('neon-geography');
  const skip = holeCrossingSkip(geography, transition);
  if (skip !== null) return skip;

  const shipEvidence = await readJumpShipEvidence(database, transition, dependencies);
  if (shipEvidence === null) return retry('neon-evidence');
  const { staticTypeCodes, observedShipMassKg } = shipEvidence;

  const matched = matchJump({
    origin,
    destination,
    observedShipMassKg,
    candidates: evidence.candidates,
    scannedTypeCodes: evidence.scannedTypeCodes,
    staticTypeCodes,
    codex: geography.codex.types,
  });
  const candidateIds = evidence.candidates.map((candidate) => candidate.id);
  const decision = { ...matched, candidateIds } satisfies AuthorJumpInput['decision'];

  let resolved: AuthorJumpResult;
  try {
    resolved = await dependencies.authorJump({
      userId,
      mapId: request.mapId,
      characterId: request.characterId,
      fromSolarSystemId: transition.fromSolarSystemId,
      toSolarSystemId: transition.toSolarSystemId,
      transitionObservedAt: transition.transitionObservedAt,
      observedShipMassKg,
      observationKey: dependencies.newObservationKey(),
      decision,
    });
  } catch {
    return retry('convex-resolve');
  }
  return settleAuthoredJump(database, userId, request.mapId, resolved, dependencies);
}

async function resolveConfirmation(
  database: AnyPgDb,
  userId: string,
  request: Extract<JumpResolverRequest, { kind: 'confirm' }>,
  dependencies: JumpResolverDependencies,
): Promise<JumpResolverResponse> {
  const input: AnswerJumpInput = request.targetConnectionId === null
    ? {
        operation: 'confirm',
        userId,
        mapId: request.mapId,
        connectionId: request.connectionId,
      }
    : {
        operation: 'reassociate',
        userId,
        mapId: request.mapId,
        connectionId: request.connectionId,
        targetConnectionId: request.targetConnectionId,
      };
  let emission: ConnectionEmissionFacts;
  try {
    emission = await dependencies.answerJump(input);
  } catch {
    return retry('convex-resolve');
  }
  await eliminateAfterCommit(
    database,
    userId,
    request.mapId,
    emission,
    dependencies,
  );
  const provenance = input.operation === 'confirm' ? 'confirmed' : 'human';
  let emitted = false;
  try {
    emitted = await emitObservation(database, emission, provenance, dependencies);
    if (!emitted && emission.observationKey !== null) {
      await dependencies.deleteWhObservation(database, emission.observationKey);
    }
  } catch (cause) {
    dependencies.reportEmissionFailure(cause);
  }
  return {
    status: 'processed',
    outcome: input.operation === 'confirm' ? 'confirmed' : 'reassociated',
    emitted,
  };
}

async function resolveTypedHole(
  database: AnyPgDb,
  userId: string,
  request: Extract<JumpResolverRequest, { kind: 'typed-hole' }>,
  dependencies: JumpResolverDependencies,
): Promise<JumpResolverResponse> {
  let evidence;
  try {
    evidence = await dependencies.readConnectionEvidence(
      userId,
      request.mapId,
      request.connectionId,
    );
  } catch {
    return retry('convex-evidence');
  }
  if (!evidence.canEdit) return skipped('edit-access');
  if (evidence.connection === null) return { status: 'stale', reason: 'connection' };
  try {
    const emitted = await emitObservation(
      database,
      evidence.connection,
      'human',
      dependencies,
    );
    if (!emitted && evidence.connection.observationKey !== null) {
      await dependencies.deleteWhObservation(
        database,
        evidence.connection.observationKey,
      );
    }
    return { status: 'processed', outcome: 'typed-hole', emitted };
  } catch (cause) {
    dependencies.reportEmissionFailure(cause);
    return retry('neon-emission');
  }
}

export function resolveJumpRequest(
  database: AnyPgDb,
  userId: string,
  request: JumpResolverRequest,
  dependencies: JumpResolverDependencies = productionDependencies,
): Promise<JumpResolverResponse> {
  if (request.kind === 'doorbell') {
    return resolveDoorbell(database, userId, request, dependencies);
  }
  if (request.kind === 'confirm') {
    return resolveConfirmation(database, userId, request, dependencies);
  }
  return resolveTypedHole(database, userId, request, dependencies);
}
