import type { EsiStoreKey } from '@/data/esi-store';

/** The stored answer behind one character's jobs row. */
export function characterJobsKey(characterId: number): EsiStoreKey {
  return { route: '/characters/{character_id}/industry/jobs/', holder: { kind: 'character', id: characterId } };
}

/** The stored answer behind one user's view of a corporation's jobs: held per user, so one member's refresh never marks another's rows fresh. */
export function corpJobsKey(userId: string, corporationId: number): EsiStoreKey {
  return {
    route: '/corporations/{corporation_id}/industry/jobs/',
    holder: { kind: 'user-corporation', id: corporationId, userId },
  };
}
