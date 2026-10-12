import type { EsiStoreKey } from '@/data/esi-store';

const corporation = (id: number): EsiStoreKey['holder'] => ({ kind: 'corporation', id });

/** The three stored answers the Director context pass is built from; the pass is due once any has expired. */
export function corpContextKeys(corporationId: number): EsiStoreKey[] {
  return [
    { route: '/corporations/{corporation_id}/', holder: corporation(corporationId) },
    { route: '/corporations/{corporation_id}/divisions/', holder: corporation(corporationId) },
    { route: '/corporations/{corporation_id}/membertracking/', holder: corporation(corporationId) },
  ];
}

export function corporationKey(corporationId: number): EsiStoreKey {
  return corpContextKeys(corporationId)[0]!;
}

export function divisionsKey(corporationId: number): EsiStoreKey {
  return corpContextKeys(corporationId)[1]!;
}

export function memberTrackingKey(corporationId: number): EsiStoreKey {
  return corpContextKeys(corporationId)[2]!;
}
