'use client';

import { toast } from '@/components/ui/toast';
import {
  signatureEliminationEndpoint,
  type SignatureEliminationRequest,
  type SignatureEliminationResponse,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

const ELIMINATION_REQUEST_TIMEOUT_MS = 15_000;

function signatureIdList(signatureIds: readonly string[]): string {
  if (signatureIds.length === 1) return signatureIds[0]!;
  if (signatureIds.length === 2) return `${signatureIds[0]} and ${signatureIds[1]}`;
  return `${signatureIds.slice(0, -1).join(', ')}, and ${signatureIds.at(-1)}`;
}

export async function eliminateSignaturesAndAnnounce(
  body: SignatureEliminationRequest,
): Promise<SignatureEliminationResponse | null> {
  const outcome = await apiFetch(signatureEliminationEndpoint, {
    body,
    signal: AbortSignal.timeout(ELIMINATION_REQUEST_TIMEOUT_MS),
  });
  if (!outcome.ok) return null;
  if (outcome.data.status === 'applied') {
    const { signatureIds } = outcome.data;
    const verb = signatureIds.length === 1 ? 'has' : 'have';
    toast.success(
      `${signatureIdList(signatureIds)} ${verb} been identified.`,
      { id: `signature-elimination:${body.mapId}:${body.systemId}` },
    );
  }
  return outcome.data;
}
