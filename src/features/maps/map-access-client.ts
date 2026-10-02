import {
  updateMapAccessEndpoint,
  type UpdateMapAccessRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

export function updateMapAccess(input: UpdateMapAccessRequest) {
  return apiFetch(updateMapAccessEndpoint, { body: input, cache: 'no-store' });
}

const CONFLICT_MESSAGES = {
  map_creator_character_required:
    'The map creator must keep at least one of their own characters on the access list.',
  map_block_owner: 'This character belongs to the map owner.',
  map_block_self: "You can't block your own character.",
} as const;

export function mapAccessFailureMessage(
  outcome: Awaited<ReturnType<typeof updateMapAccess>>,
): string {
  if (outcome.ok) return '';
  if (outcome.kind === 'api' && outcome.status === 403) {
    return 'Map admin access is required to change this access list.';
  }
  if (outcome.kind === 'api' && outcome.status === 409) {
    return CONFLICT_MESSAGES[outcome.error.code];
  }
  if (outcome.kind === 'api' && outcome.status === 503) {
    return 'The durable change was saved, but live access has not caught up. Retry the same change.';
  }
  return 'Map access could not be updated. Check your connection and try again.';
}
