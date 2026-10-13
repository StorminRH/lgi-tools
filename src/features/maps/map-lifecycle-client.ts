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
    return "The selected maps couldn't be restored. Try again.";
  }
  if (action === 'purge') {
    return "The selected maps couldn't be permanently deleted. Try again.";
  }
  return "This map couldn't be deleted. Try again.";
}
