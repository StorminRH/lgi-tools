import type { EsiStoreKey } from '@/data/esi-store';

export const AFFILIATION_ROUTE = '/characters/affiliation/';

/** The stored answer behind one character's affiliation: the batch POST's expiry, fanned out per character. */
export function affiliationKey(characterId: number): EsiStoreKey {
  return { route: AFFILIATION_ROUTE, holder: { kind: 'character', id: characterId } };
}
