'use client';

import { toast } from '@/components/ui/toast';
import {
  signatureEliminationEndpoint,
  type SignatureEliminationRequest,
  type SignatureEliminationResponse,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

const ELIMINATION_REQUEST_TIMEOUT_MS = 15_000;

/** Posts one acting-user elimination pass and announces only applied deductions. */
export async function eliminateSignaturesAndAnnounce(
  body: SignatureEliminationRequest,
): Promise<SignatureEliminationResponse | null> {
  const outcome = await apiFetch(signatureEliminationEndpoint, {
    body,
    signal: AbortSignal.timeout(ELIMINATION_REQUEST_TIMEOUT_MS),
  });
  if (!outcome.ok) return null;
  if (outcome.data.status === 'applied' && outcome.data.deduced > 0) {
    const suffix = outcome.data.deduced === 1 ? '' : 's';
    toast.success(
      `${outcome.data.deduced} signature${suffix} identified by elimination.`,
      { id: `signature-elimination:${body.mapId}:${body.systemId}` },
    );
  }
  return outcome.data;
}
