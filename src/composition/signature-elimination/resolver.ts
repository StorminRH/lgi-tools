import type { AnyPgDb } from '@/lib/db-types';
import type { ConnectionProvenance } from '@/data/eve-data/wormhole-contract';
import {
  getWormholeCodex,
  type WormholeCodexEntry,
} from '@/data/eve-data/universe-assets';
import {
  eliminateSignatures,
  type EliminationDeduction,
} from '@/data/maps/signature-eliminator';
import type {
  SignatureEliminationRequest,
  SignatureEliminationResponse,
} from '@/data/maps/api-contract';
import { observationFor } from '@/data/wh-observations/emission';
import {
  reconcileWhObservations,
  type WhObservationInput,
} from '@/data/wh-observations/queries';
import { readSystemStaticsForSystem } from '@/data/wh-statics/queries';
import {
  applyEliminationDeductions,
  readEliminationEvidence,
  type EliminationEvidence,
  type EliminationWriteOutcome,
} from './convex-door';

/** Injectable cross-store seams for deterministic elimination proof. */
export interface SignatureEliminationDependencies {
  readonly readEliminationEvidence: typeof readEliminationEvidence;
  readonly applyEliminationDeductions: typeof applyEliminationDeductions;
  readonly readSystemStaticsForSystem: typeof readSystemStaticsForSystem;
  readonly getWormholeCodex: typeof getWormholeCodex;
  readonly eliminateSignatures: typeof eliminateSignatures;
  readonly reconcileWhObservations: typeof reconcileWhObservations;
  readonly now: () => number;
  readonly reportEmissionFailure: (cause: unknown) => void;
}

const productionDependencies: SignatureEliminationDependencies = {
  readEliminationEvidence,
  applyEliminationDeductions,
  readSystemStaticsForSystem,
  getWormholeCodex,
  eliminateSignatures,
  reconcileWhObservations,
  now: Date.now,
  reportEmissionFailure: (cause) => {
    console.error('Wormhole observation logging failed after elimination', cause);
  },
};

async function readCodex(
  dependencies: SignatureEliminationDependencies,
): Promise<readonly WormholeCodexEntry[] | null> {
  try {
    return (await dependencies.getWormholeCodex()).types;
  } catch {
    return null;
  }
}

async function readStaticTypeCodes(
  database: AnyPgDb,
  systemId: number,
  dependencies: SignatureEliminationDependencies,
): Promise<readonly string[] | null> {
  try {
    const staticTypeCodes = await dependencies.readSystemStaticsForSystem(
      database,
      systemId,
    );
    return staticTypeCodes.length === 0 ? null : staticTypeCodes;
  } catch {
    return null;
  }
}

function quiet(): SignatureEliminationResponse {
  return { status: 'quiet' };
}

/** How one scanned row's identity stands once this pass has settled. */
interface SettledIdentity {
  readonly whTypeCode: string | null;
  readonly provenance: ConnectionProvenance | null;
  readonly observationKey: string | null;
  /** The row was linked into a resolved connection, which now owns its identity. */
  readonly migrated: boolean;
}

function settleIdentity(
  signature: EliminationEvidence['signatures'][number],
  deduction: EliminationDeduction | undefined,
  outcome: EliminationWriteOutcome | undefined,
): SettledIdentity {
  // Only an applied write may introduce a key the evidence snapshot did not
  // show. Every other outcome — `unchanged`, `protected`, and `stale` alike —
  // logs exactly what this pass read: a lost race then cannot delete the
  // winner's freshly logged row, and a row that vanished mid-pass keeps the
  // identity it was observed with, which a later removal never falsifies.
  const applied = outcome?.outcome === 'applied' ? deduction : undefined;
  if (applied === undefined) {
    return {
      whTypeCode: signature.wormholeTypeCode,
      provenance: signature.typeProvenance,
      observationKey: signature.observationKey,
      migrated: false,
    };
  }
  const observationKey = outcome?.observationKey ?? signature.observationKey;
  return 'connectionId' in applied
    ? { whTypeCode: null, provenance: null, observationKey, migrated: true }
    : { whTypeCode: applied.typeCode, provenance: 'assumed', observationKey, migrated: false };
}

/**
 * Logs the identity every live scanned row of this system now carries, at its
 * own stored tier (ruling D-B). Deduced fills log as `assumed`, a person's
 * later correction rewrites the same per-hole key, and an identity that has
 * been vacated — cleared, retyped to K162, or migrated onto a resolved
 * connection that owns its own key — removes the row it left behind.
 */
async function logIdentifications(
  database: AnyPgDb,
  systemId: number,
  settled: readonly SettledIdentity[],
  codex: readonly WormholeCodexEntry[],
  dependencies: SignatureEliminationDependencies,
): Promise<void> {
  const observedAt = new Date(dependencies.now());
  const upserts: WhObservationInput[] = [];
  const deleteKeys: string[] = [];
  for (const identity of settled) {
    const observation = identity.migrated
      ? null
      : observationFor(
          {
            typedSystemId: systemId,
            whTypeCode: identity.whTypeCode,
            provenance: identity.provenance,
            dedupeKey: identity.observationKey,
            destinationClassId: null,
          },
          codex,
        );
    if (observation !== null) {
      upserts.push({ ...observation, observedAt });
    } else if (identity.observationKey !== null) {
      deleteKeys.push(identity.observationKey);
    }
  }
  await dependencies.reconcileWhObservations(database, { upserts, deleteKeys });
}

/** Runs one authenticated cross-store elimination pass and logs what it settles. */
export async function resolveSignatureElimination(
  database: AnyPgDb,
  userId: string,
  request: SignatureEliminationRequest,
  dependencies: SignatureEliminationDependencies = productionDependencies,
): Promise<SignatureEliminationResponse> {
  const evidence = await dependencies.readEliminationEvidence(
    userId,
    request.mapId,
    request.systemId,
  );
  if (!evidence.canEdit) return quiet();

  const [codex, staticTypeCodes] = await Promise.all([
    readCodex(dependencies),
    readStaticTypeCodes(database, request.systemId, dependencies),
  ]);

  const deductions = staticTypeCodes === null || codex === null
    ? []
    : (() => {
        const result = dependencies.eliminateSignatures({
          staticTypeCodes,
          codex,
          signatures: evidence.signatures,
          connections: evidence.connections,
        });
        return result.quiet ? [] : result.deductions;
      })();

  const outcomes = deductions.length === 0
    ? []
    : await dependencies.applyEliminationDeductions({
        userId,
        mapId: request.mapId,
        systemId: request.systemId,
        deductions,
      });

  // Observation logging is independent of statics availability (ruling D-B):
  // a person's typed identity must still enter the corpus when inference is off.
  if (codex !== null) {
    const byDeduction = new Map(deductions.map((entry) => [entry.signatureId, entry]));
    const byOutcome = new Map(outcomes.map((entry) => [entry.signatureId, entry]));
    try {
      await logIdentifications(
        database,
        request.systemId,
        evidence.signatures.map((signature) =>
          settleIdentity(
            signature,
            byDeduction.get(signature.signatureId),
            byOutcome.get(signature.signatureId),
          ),
        ),
        codex,
        dependencies,
      );
    } catch (cause) {
      // The map facts already landed; the corpus is a convergent follow-up that
      // must never turn an applied deduction into a failed pass.
      dependencies.reportEmissionFailure(cause);
    }
  }

  if (staticTypeCodes === null || codex === null) {
    return { status: 'statics-unavailable' };
  }

  const signatureIds = outcomes
    .filter((outcome) => outcome.outcome === 'applied')
    .map((outcome) => outcome.signatureId);
  return signatureIds.length === 0
    ? quiet()
    : { status: 'applied', signatureIds };
}
