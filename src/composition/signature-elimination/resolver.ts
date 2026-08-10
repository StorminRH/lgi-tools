import type { AnyPgDb } from '@/lib/db-types';
import { getWormholeCodex } from '@/data/eve-data/universe-assets';
import {
  eliminateSignatures,
  type EliminationResult,
} from '@/data/maps/signature-eliminator';
import type {
  SignatureEliminationRequest,
  SignatureEliminationResponse,
} from '@/data/maps/api-contract';
import { readSystemStaticsForSystem } from '@/data/wh-statics/queries';
import {
  applyEliminationDeductions,
  readEliminationEvidence,
} from './convex-door';

/** Injectable cross-store seams for deterministic elimination proof. */
export interface SignatureEliminationDependencies {
  readonly readEliminationEvidence: typeof readEliminationEvidence;
  readonly applyEliminationDeductions: typeof applyEliminationDeductions;
  readonly readSystemStaticsForSystem: typeof readSystemStaticsForSystem;
  readonly getWormholeCodex: typeof getWormholeCodex;
  readonly eliminateSignatures: typeof eliminateSignatures;
}

const productionDependencies: SignatureEliminationDependencies = {
  readEliminationEvidence,
  applyEliminationDeductions,
  readSystemStaticsForSystem,
  getWormholeCodex,
  eliminateSignatures,
};

async function readAnswerKey(
  database: AnyPgDb,
  systemId: number,
  dependencies: SignatureEliminationDependencies,
) {
  try {
    const [staticTypeCodes, codex] = await Promise.all([
      dependencies.readSystemStaticsForSystem(database, systemId),
      dependencies.getWormholeCodex(),
    ]);
    return staticTypeCodes.length === 0
      ? null
      : { staticTypeCodes, codex: codex.types };
  } catch {
    return null;
  }
}

function quiet(): SignatureEliminationResponse {
  return { status: 'quiet' };
}

/** Runs one authenticated cross-store elimination pass without emitting observations. */
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

  const answerKey = await readAnswerKey(database, request.systemId, dependencies);
  if (answerKey === null) return { status: 'statics-unavailable' };

  const result: EliminationResult = dependencies.eliminateSignatures({
    ...answerKey,
    signatures: evidence.signatures,
    connections: evidence.connections,
  });
  if (result.quiet || result.deductions.length === 0) return quiet();

  const outcomes = await dependencies.applyEliminationDeductions({
    userId,
    mapId: request.mapId,
    systemId: request.systemId,
    deductions: result.deductions,
  });
  const deduced = outcomes.filter((outcome) => outcome.outcome === 'applied').length;
  return deduced === 0 ? quiet() : { status: 'applied', deduced };
}
