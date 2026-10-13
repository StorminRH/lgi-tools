import type { EsiStoreKey } from '@/data/esi-store';
import { eveTag } from '@/lib/esi-datasets/routes';
import { THE_FORGE_REGION_ID } from '@/data/eve-data/constants';

export const MARKET_HISTORY_TAG = eveTag('market_history');

/** One type's Forge daily history: the key its stored series expires under. */
export function historyKey(typeId: number): EsiStoreKey {
  return { route: '/markets/{region_id}/history/', holder: { kind: 'global' }, params: { region_id: THE_FORGE_REGION_ID, type_id: typeId } };
}
