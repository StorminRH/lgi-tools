import {
  applyEliminationDoor,
  eliminationEvidenceDoor,
} from '@/data/maps/convex-doors';
import type { EliminationDeduction } from '@/data/maps/signature-eliminator';
import type { ConvexDoorResponse } from '@/lib/convex-door-contract';
import {
  ConvexDoorError,
  postConvexHttpDoor,
  type ConvexDoorOptions,
} from '@/lib/convex-http-door';

export type EliminationEvidence = ConvexDoorResponse<typeof eliminationEvidenceDoor>;

export type EliminationWriteOutcome = ConvexDoorResponse<typeof applyEliminationDoor>[number];

export class EliminationConvexUnavailableError extends ConvexDoorError {
  override readonly name = 'EliminationConvexUnavailableError';
}

const ELIMINATION_DOOR_OPTIONS: ConvexDoorOptions = {
  error: EliminationConvexUnavailableError,
  label: 'Signature elimination unavailable',
};

export function readEliminationEvidence(
  userId: string,
  mapId: string,
  systemId: number,
): Promise<EliminationEvidence> {
  return postConvexHttpDoor(
    eliminationEvidenceDoor,
    { operation: 'evidence', userId, mapId, systemId },
    ELIMINATION_DOOR_OPTIONS,
  );
}

export function applyEliminationDeductions(input: {
  readonly userId: string;
  readonly mapId: string;
  readonly systemId: number;
  readonly deductions: readonly EliminationDeduction[];
}): Promise<EliminationWriteOutcome[]> {
  return postConvexHttpDoor(
    applyEliminationDoor,
    { operation: 'apply', ...input, deductions: [...input.deductions] },
    ELIMINATION_DOOR_OPTIONS,
  );
}
