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
  fallback: 'Map access could not be updated.',
  codes: {
    map_admin_required: 'Map admin access is required to change this access list.',
    map_creator_character_required:
      'The map creator must keep at least one of their own characters on the access list.',
    map_block_owner: 'This character belongs to the map owner.',
    map_block_self: "You can't block your own character.",
    map_projection_unavailable:
      'The durable change was saved, but live access has not caught up. Retry the same change.',
  },
} satisfies FailureCopy<FailedOutcome<typeof updateMapAccessEndpoint>>;

export function mapAccessFailureMessage(failure: FailedOutcome<typeof updateMapAccessEndpoint>): string {
  return failureMessage(failure, MAP_ACCESS_FAILURE_COPY);
}
