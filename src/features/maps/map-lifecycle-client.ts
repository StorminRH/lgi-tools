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

const DELETE_FAILED = "This map couldn't be deleted. Try again.";
const RESTORE_FAILED = "The selected maps couldn't be restored. Try again.";
const PURGE_FAILED = "The selected maps couldn't be permanently deleted. Try again.";

const LIFECYCLE_FAILURE_COPY = {
  delete: {
    fallback: DELETE_FAILED,
    network: DELETE_FAILED,
  } satisfies FailureCopy<FailedOutcome<typeof deleteMapEndpoint>>,
  restore: {
    fallback: RESTORE_FAILED,
    network: RESTORE_FAILED,
  } satisfies FailureCopy<FailedOutcome<typeof restoreMapEndpoint>>,
  purge: {
    fallback: PURGE_FAILED,
    network: PURGE_FAILED,
  } satisfies FailureCopy<FailedOutcome<typeof purgeMapNowEndpoint>>,
};

/**
 * Why a delete, restore or purge failed. An ended session or a rate limit
 * says so; any other failure, an access refusal or a lost connection
 * included, takes the action's plain retry copy. The route folds every
 * refusal (not yours, window ended, missing, already queued) into one 403
 * code, so the copy never names a single cause.
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
