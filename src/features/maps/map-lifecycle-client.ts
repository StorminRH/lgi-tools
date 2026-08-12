import {
  deleteMapEndpoint,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
  type MapLifecycleRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

/** Begins the reversible delete lifecycle for one admin-authorized map. */
export function deleteMap(input: MapLifecycleRequest) {
  return apiFetch(deleteMapEndpoint, { body: input, cache: 'no-store' });
}

/** Restores one admin-authorized map while its grace window remains open. */
export function restoreMap(input: MapLifecycleRequest) {
  return apiFetch(restoreMapEndpoint, { body: input, cache: 'no-store' });
}

/** Creator-only request to fast-forward one archived map into the next sweep. */
export function requestMapPurge(input: MapLifecycleRequest) {
  return apiFetch(purgeMapNowEndpoint, { body: input, cache: 'no-store' });
}

/** Calm shared copy for lifecycle transport and authorization failures. */
export function mapLifecycleFailureMessage(action: 'delete' | 'restore' | 'purge'): string {
  if (action === 'restore') {
    return 'This map could not be restored. Its undo window may have ended.';
  }
  if (action === 'purge') {
    return 'Only the map creator can permanently delete the selected maps.';
  }
  return 'This map could not be deleted. Map admin access is required.';
}
