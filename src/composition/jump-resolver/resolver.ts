import { randomUUID } from 'node:crypto';
import type { AnyPgDb } from '@/lib/db-types';
import {
  effectiveWormholeClassId,
  FAR_SIDE_WORMHOLE_CODE,
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
import {
  insertWhObservation,
  type WhObservationProvenance,
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
  type ConnectionEmissionFacts,
  type TransitionEvidence,
} from './convex-door';

const CAPSULE_TYPE_ID = 670;

/** Injectable runtime seams for deterministic route/composition proof. */
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
  readonly newObservationKey: () => string;
  readonly now: () => number;
  readonly reportEmissionFailure: (cause: unknown) => void;
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
  newObservationKey: randomUUID,
  now: Date.now,
  reportEmissionFailure: (cause) => {
    console.error('Wormhole observation emission failed after Convex commit', cause);
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
  const classId = facts === null ? null : effectiveWormholeClassId(facts);
  return classId !== null && ((classId >= 1 && classId <= 6) || (classId >= 12 && classId <= 18));
}

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
  provenance: WhObservationProvenance,
  dependencies: JumpResolverDependencies,
): Promise<boolean> {
  const sides = typedSideFacts(emission);
  if (
    sides === null
    || emission.wormholeTypeCode === null
    || emission.wormholeTypeCode === FAR_SIDE_WORMHOLE_CODE
    || emission.observationKey === null
  ) {
    return false;
  }

  const [systems, codex] = await Promise.all([
    dependencies.getSystemDirectory(),
    dependencies.getWormholeCodex(),
  ]);
  const entry = codex.types.find(
    (candidate) => candidate.code === emission.wormholeTypeCode,
  );
  const destination = systemFacts(systems, sides.destinationSystemId);
  if (entry === undefined || entry.farSide || destination === null) return false;
  if (entry.targetClass !== effectiveWormholeClassId(destination)) return false;

  await dependencies.insertWhObservation(database, {
    solarSystemId: sides.typedSystemId,
    whTypeCode: entry.code,
    provenance,
    observedAt: new Date(dependencies.now()),
    dedupeKey: emission.observationKey,
  });
  return true;
}

async function emitAfterCommit(
  database: AnyPgDb,
  emission: ConnectionEmissionFacts,
  provenance: WhObservationProvenance,
  dependencies: JumpResolverDependencies,
): Promise<boolean> {
  try {
    return await emitObservation(database, emission, provenance, dependencies);
  } catch (cause) {
    dependencies.reportEmissionFailure(cause);
    return false;
  }
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

  let systems: SystemDirectoryAsset;
  let adjacency: AdjacencyAsset;
  let codex: WormholeCodexAsset;
  try {
    [systems, adjacency, codex] = await Promise.all([
      dependencies.getSystemDirectory(),
      dependencies.getAdjacencyGraph(),
      dependencies.getWormholeCodex(),
    ]);
  } catch {
    return retry('neon-geography');
  }

  const origin = systemFacts(systems, transition.fromSolarSystemId);
  const destination = systemFacts(systems, transition.toSolarSystemId);
  if (origin === null || destination === null) return retry('neon-geography');
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

  let staticTypeCodes: string[];
  let observedShipMassKg: number | null;
  try {
    [staticTypeCodes, observedShipMassKg] = await Promise.all([
      dependencies.readSystemStaticsForSystem(
        database,
        transition.fromSolarSystemId,
      ),
      transition.shipTypeId === null
        ? Promise.resolve(null)
        : dependencies.readShipMassByType(database, transition.shipTypeId),
    ]);
  } catch {
    return retry('neon-evidence');
  }

  const matched = matchJump({
    origin,
    destination,
    observedShipMassKg,
    candidates: evidence.candidates,
    staticTypeCodes,
    codex: codex.types,
  });
  const candidateIds = evidence.candidates.map((candidate) => candidate.id);
  const decision = { ...matched, candidateIds } satisfies AuthorJumpInput['decision'];

  let resolved;
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
  if (resolved.status === 'stale') return resolved;
  if ('reason' in resolved) {
    return { status: 'processed', outcome: 'converged', emitted: false };
  }
  const emitted = matched.kind === 'resolve' && matched.provenance === 'jump-verified'
    ? await emitAfterCommit(
        database,
        resolved.emission,
        'jump-verified',
        dependencies,
      )
    : false;
  return { status: 'processed', outcome: resolved.status, emitted };
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
  const provenance = input.operation === 'confirm' ? 'confirmed' : 'human';
  const emitted = await emitAfterCommit(database, emission, provenance, dependencies);
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
    return { status: 'processed', outcome: 'typed-hole', emitted };
  } catch (cause) {
    dependencies.reportEmissionFailure(cause);
    return retry('neon-emission');
  }
}

/** Resolves one authenticated jump workflow request without trusting client-supplied facts. */
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
