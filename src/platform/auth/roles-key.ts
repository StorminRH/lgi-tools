import type { EsiStoreKey } from '@/data/esi-store';

export const CHARACTER_ROLES_ROUTE = '/characters/{character_id}/roles/';

/** The stored answer behind one character's corp_member_roles row. */
export function characterRolesKey(characterId: number): EsiStoreKey {
  return { route: CHARACTER_ROLES_ROUTE, holder: { kind: 'character', id: characterId } };
}
