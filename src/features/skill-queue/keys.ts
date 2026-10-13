import type { EsiStoreKey } from '@/data/esi-store';
import type { EnumeratedOwner } from '@/platform/owner-sync';
import { canSyncSkillQueue } from './sync-eligibility';

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

/** The stored answers a skills refresh for these characters would check: the eligible ones' only, since the sync reads nothing for the rest. */
export function skillsDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  return owners.filter(canSyncSkillQueue).flatMap((owner) => skillsKeys(owner.characterId));
}
