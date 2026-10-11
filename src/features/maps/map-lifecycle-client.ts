import {
  deleteMapEndpoint,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
  type MapLifecycleRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';
import type { EndpointContract } from '@/transport/endpoint';
import { failureMessage, type FailedOutcome, type FailureCopy } from '@/transport/failure-copy';

export function deleteMap(input: MapLifecycleRequest) {
  return apiFetch(deleteMapEndpoint, { body: input, cache: 'no-store' });
}

export function restoreMap(input: MapLifecycleRequest) {
  return apiFetch(restoreMapEndpoint, { body: input, cache: 'no-store' });
}

export function requestMapPurge(input: MapLifecycleRequest) {
  return apiFetch(purgeMapNowEndpoint, { body: input, cache: 'no-store' });
}

const LIFECYCLE_FAILURE_COPY = {
  delete: {
    fallback: 'This map could not be deleted.',
    codes: { map_admin_required: 'This map could not be deleted. Map admin access is required.' },
  } satisfies FailureCopy<FailedOutcome<typeof deleteMapEndpoint>>,
  restore: {
    fallback: 'This map could not be restored.',
    codes: { map_restore_unavailable: 'This map could not be restored. Its undo window may have ended.' },
  } satisfies FailureCopy<FailedOutcome<typeof restoreMapEndpoint>>,
  purge: {
    fallback: 'The selected maps could not be permanently deleted.',
    codes: { map_creator_required: 'Only the map creator can permanently delete the selected maps.' },
  } satisfies FailureCopy<FailedOutcome<typeof purgeMapNowEndpoint>>,
};

/**
 * Why a delete, restore or purge failed, by the server's refusal code. A
 * network failure, an ended session or any other refusal says so instead of
 * blaming map access.
 */
export function mapLifecycleFailureMessage(
  action: 'delete',
  failure: FailedOutcome<typeof deleteMapEndpoint>,
): string;
export function mapLifecycleFailureMessage(
  action: 'restore',
  failure: FailedOutcome<typeof restoreMapEndpoint>,
): string;
export function mapLifecycleFailureMessage(
  action: 'purge',
  failure: FailedOutcome<typeof purgeMapNowEndpoint>,
): string;
export function mapLifecycleFailureMessage(
  action: keyof typeof LIFECYCLE_FAILURE_COPY,
  failure: FailedOutcome<EndpointContract>,
): string {
  return failureMessage(failure, LIFECYCLE_FAILURE_COPY[action]);
}
