import {
  updateMapAccessEndpoint,
  type UpdateMapAccessRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';
import { failureMessage, type FailedOutcome, type FailureCopy } from '@/transport/failure-copy';

export function updateMapAccess(input: UpdateMapAccessRequest) {
  return apiFetch(updateMapAccessEndpoint, { body: input, cache: 'no-store' });
}

const MAP_ACCESS_FAILURE_COPY = {
  fallback: "Couldn't update map access. Try again.",
  network: "Couldn't update map access. Check your connection and try again.",
  codes: {
    map_admin_required: 'Only map admins can change access.',
    map_creator_character_required:
      'The map creator needs at least one of their characters on the access list.',
    map_block_owner: "You can't block the map creator.",
    map_block_self: "You can't block your own character.",
    map_projection_unavailable: "Saved, but live access hasn't updated yet. Try the change again.",
  },
} satisfies FailureCopy<FailedOutcome<typeof updateMapAccessEndpoint>>;

export function mapAccessFailureMessage(failure: FailedOutcome<typeof updateMapAccessEndpoint>): string {
  return failureMessage(failure, MAP_ACCESS_FAILURE_COPY);
}
