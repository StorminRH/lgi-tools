import type { EsiStoreKey } from '@/data/esi-store';

/** The stored paged answer behind one corporation's structure rows. */
export function corpStructuresKey(corporationId: number): EsiStoreKey {
  return { route: '/corporations/{corporation_id}/structures/', holder: { kind: 'corporation', id: corporationId } };
}
