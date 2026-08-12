import {
  updateMapAccessEndpoint,
  type UpdateMapAccessRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

/** Applies one idempotent grant change through the sole durable access route. */
export function updateMapAccess(input: UpdateMapAccessRequest) {
  return apiFetch(updateMapAccessEndpoint, { body: input, cache: 'no-store' });
}

/** Calm operator-facing copy for a failed map-access update. */
export function mapAccessFailureMessage(
  outcome: Awaited<ReturnType<typeof updateMapAccess>>,
): string {
  if (outcome.ok) return '';
  if (outcome.kind === 'api' && outcome.status === 403) {
    return 'Map admin access is required to change this access list.';
  }
  if (outcome.kind === 'api' && outcome.status === 503) {
    return 'The durable change was saved, but live access has not caught up. Retry the same change.';
  }
  return 'Map access could not be updated. Check your connection and try again.';
}
