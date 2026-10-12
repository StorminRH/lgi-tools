import type { EsiStoreKey } from '@/data/esi-store';
import { corporationsOf, type EnumeratedOwner } from '@/platform/owner-sync';
import { canSyncCorpIndustryJobs } from './corp-sync-eligibility';
import { canSyncIndustryJobs } from './sync-eligibility';

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

/** The stored answers a jobs refresh for these characters would check: the eligible ones' only. */
export function jobsDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  return owners.filter(canSyncIndustryJobs).map((owner) => characterJobsKey(owner.characterId));
}

/** The stored answers a corp jobs refresh would check: one per corporation an eligible member belongs to. */
export function corpJobsDueKeys(userId: string, owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  return [...corporationsOf(owners, canSyncCorpIndustryJobs).keys()].map((corporationId) => corpJobsKey(userId, corporationId));
}
