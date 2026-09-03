import {
  jumpResolverEndpoint,
  type JumpResolverRequest,
  type JumpResolverResponse,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

const JUMP_REQUEST_TIMEOUT_MS = 15_000;

export async function postJumpRequest(
  body: JumpResolverRequest,
): Promise<JumpResolverResponse | null> {
  const outcome = await apiFetch(jumpResolverEndpoint, {
    body,
    signal: AbortSignal.timeout(JUMP_REQUEST_TIMEOUT_MS),
  });
  return outcome.ok ? outcome.data : null;
}
