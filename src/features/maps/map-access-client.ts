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
    'The map creator needs at least one of their characters on the access list.',
  map_block_owner: "You can't block the map creator.",
  map_block_self: "You can't block your own character.",
} as const;

export function mapAccessFailureMessage(
  outcome: Awaited<ReturnType<typeof updateMapAccess>>,
): string {
  if (outcome.ok) return '';
  if (outcome.kind === 'api' && outcome.status === 403) {
    return 'Only map admins can change access.';
  }
  if (outcome.kind === 'api' && outcome.status === 409) {
    return CONFLICT_MESSAGES[outcome.error.code];
  }
  if (outcome.kind === 'api' && outcome.status === 503) {
    return "Saved, but live access hasn't updated yet. Try the change again.";
  }
  return 'Map access could not be updated. Check your connection and try again.';
}
