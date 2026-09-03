import {
  deleteMapEndpoint,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
  type MapLifecycleRequest,
} from '@/data/maps/api-contract';
import { apiFetch } from '@/transport/api-client';

export function deleteMap(input: MapLifecycleRequest) {
  return apiFetch(deleteMapEndpoint, { body: input, cache: 'no-store' });
}

export function restoreMap(input: MapLifecycleRequest) {
  return apiFetch(restoreMapEndpoint, { body: input, cache: 'no-store' });
}

export function requestMapPurge(input: MapLifecycleRequest) {
  return apiFetch(purgeMapNowEndpoint, { body: input, cache: 'no-store' });
}

export function mapLifecycleFailureMessage(action: 'delete' | 'restore' | 'purge'): string {
  if (action === 'restore') {
    return 'This map could not be restored. Its undo window may have ended.';
  }
  if (action === 'purge') {
    return 'Only the map creator can permanently delete the selected maps.';
  }
  return 'This map could not be deleted. Map admin access is required.';
}
