// The mapper's one client seam onto the jump-resolver route. The body carries
// only identifiers — the server re-reads every movement and identity fact from
// Convex truth — so callers here can stay fire-and-observe.
import {
  jumpResolverEndpoint,
  type JumpResolverRequest,
  type JumpResolverResponse,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

/**
 * Posts one jump-resolver request and returns its workflow response, or null on
 * any transport or protocol failure so observers treat it as an unprocessed
 * attempt rather than an error state.
 */
export async function postJumpRequest(
  body: JumpResolverRequest,
): Promise<JumpResolverResponse | null> {
  const outcome = await apiFetch(jumpResolverEndpoint, { body });
  return outcome.ok ? outcome.data : null;
}
