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
  type ConnectionEmissionFacts,
  type TransitionEvidence,
} from './convex-door';

const CAPSULE_TYPE_ID = 670;

/**
 * Oldest transition the doorbell may still author. Long enough for the
 * observer's bounded retries across transient Neon/Convex failures; short
 * enough that a location document frozen while no edit-capable client was
 * open (laptop shut, map closed for days) lapses to re-anchor semantics
 * instead of authoring a long-dead crossing as current map fact.
 */
export const JUMP_CAPTURE_WINDOW_MS = 10 * 60_000;

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
  // The J-space boundary has one owner: the shared row-based band classifier.
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
  const systemIds = new Set([
    emission.fromSystemId,
    ...(emission.toSystemId === null ? [] : [emission.toSystemId]),
  ]);
  for (const systemId of systemIds) {
    try {
      await dependencies.resolveSignatureElimination(
        database,
        userId,
        { mapId, systemId },
      );
    } catch (cause) {
      // The topology commit already landed; elimination is a convergent
      // follow-up and must not turn a real jump into a retryable movement.
      dependencies.reportEliminationFailure(cause);
    }
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
    scannedTypeCodes: evidence.scannedTypeCodes,
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
  if (resolved.status === 'stale') {
    // Candidate-set races (a concurrent author, correction, or scan changed
    // the pool between the evidence read and the mutation) are re-derivable:
    // a fresh read succeeds, so the client must not settle the transition.
    return RETRYABLE_STALE_REASONS.has(resolved.reason)
      ? retry(resolved.reason)
      : resolved;
  }
  if ('reason' in resolved) {
    return { status: 'processed', outcome: 'converged', emitted: false };
  }
  await eliminateAfterCommit(
    database,
    userId,
    request.mapId,
    resolved.emission,
    dependencies,
  );
  // Emission follows what the mutation actually stamped, never the matcher's
  // pre-transaction verdict: on a convergence the touched row is a different
  // document whose stored provenance governs (HC-3 — a human tier must not be
  // overwritten by a jump-verified refresh). Every tier now emits under its own
  // tag, `assumed` included (operator ruling D-B): the corpus records how each
  // identity was learned rather than discarding the weaker evidence.
  const tier = resolved.emission.destinationProvenance;
  const emitted = tier === null
    ? false
    : await emitAfterCommit(database, resolved.emission, tier, dependencies);
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
      // The identity event landed on facts the emission guard rejects
      // (untyped target, K162, class contradiction). Any previously emitted
      // row under this key now asserts a vacated identity — remove it rather
      // than leaving unrepairable corpus pollution. Absent row: no-op.
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
      // Retyping to K162, an unidentified code, or a class-contradicted type
      // makes any previously emitted row assert a superseded identity — the
      // same repair as the answer path removes it. Absent row: no-op.
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
