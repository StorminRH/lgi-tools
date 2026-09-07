'use client';

import { toast } from '@/components/ui/toast';
import {
  signatureEliminationEndpoint,
  type SignatureEliminationRequest,
  type SignatureEliminationResponse,
} from '@/data/maps/api-contract';
import {
  eliminationFollowUpNeeded,
  type SemanticWrite,
} from '@/data/maps/semantic-write';
import { apiFetch } from '@/transport/api-client';

const ELIMINATION_REQUEST_TIMEOUT_MS = 15_000;

const lastSuccessBySystem = new Map<string, string>();

function systemKey(mapId: string, systemId: number): string {
  return `${mapId}:${systemId}`;
}

function lastEliminationDigest(mapId: string, systemId: number): string | undefined {
  return lastSuccessBySystem.get(systemKey(mapId, systemId));
}

function recordEliminationOutcome(
  mapId: string,
  systemId: number,
  digest: string,
  outcome: SignatureEliminationResponse | null,
): void {
  const key = systemKey(mapId, systemId);
  const result = outcome?.results.find((entry) => entry.systemId === systemId);
  if (result?.status === 'applied' || result?.status === 'quiet') {
    lastSuccessBySystem.set(key, digest);
    return;
  }
  lastSuccessBySystem.delete(key);
}

function signatureIdList(signatureIds: readonly string[]): string {
  if (signatureIds.length === 1) return signatureIds[0]!;
  if (signatureIds.length === 2) return `${signatureIds[0]} and ${signatureIds[1]}`;
  return `${signatureIds.slice(0, -1).join(', ')}, and ${signatureIds.at(-1)}`;
}

function announceApplied(mapId: string, result: Extract<
  SignatureEliminationResponse['results'][number],
  { status: 'applied' }
>): void {
  const { signatureIds, systemId } = result;
  const verb = signatureIds.length === 1 ? 'has' : 'have';
  toast.success(
    `${signatureIdList(signatureIds)} ${verb} been identified.`,
    { id: `signature-elimination:${mapId}:${systemId}` },
  );
}

export async function eliminateSignaturesAndAnnounce(
  body: SignatureEliminationRequest,
): Promise<SignatureEliminationResponse | null> {
  const outcome = await apiFetch(signatureEliminationEndpoint, {
    body,
    signal: AbortSignal.timeout(ELIMINATION_REQUEST_TIMEOUT_MS),
  });
  if (!outcome.ok) return null;
  for (const result of outcome.data.results) {
    if (result.status === 'applied') announceApplied(body.mapId, result);
  }
  return outcome.data;
}

export async function followUpElimination(input: {
  readonly mapId: string;
  readonly systemId: number;
  readonly write: SemanticWrite;
  readonly digest: string;
}): Promise<SignatureEliminationResponse | null> {
  if (!eliminationFollowUpNeeded(
    input.write,
    lastEliminationDigest(input.mapId, input.systemId),
    input.digest,
  )) {
    return null;
  }
  const outcome = await eliminateSignaturesAndAnnounce({
    mapId: input.mapId,
    systemIds: [input.systemId],
  });
  recordEliminationOutcome(input.mapId, input.systemId, input.digest, outcome);
  return outcome;
}
