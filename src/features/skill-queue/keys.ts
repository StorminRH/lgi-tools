import type { EsiStoreKey } from '@/data/esi-store';

const character = (id: number): EsiStoreKey['holder'] => ({ kind: 'character', id });

/** The two stored answers behind one character's skills row. */
export function skillQueueKey(characterId: number): EsiStoreKey {
  return { route: '/characters/{character_id}/skillqueue/', holder: character(characterId) };
}

export function skillsKey(characterId: number): EsiStoreKey {
  return { route: '/characters/{character_id}/skills/', holder: character(characterId) };
}

export function skillsKeys(characterId: number): EsiStoreKey[] {
  return [skillQueueKey(characterId), skillsKey(characterId)];
}
