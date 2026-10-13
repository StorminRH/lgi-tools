import type { EsiStoreKey } from '@/data/esi-store';
import { corporationsOf, type EnumeratedOwner } from '@/platform/owner-sync';
import { canSyncCorpStructures } from './corp-sync-eligibility';

/** The stored paged answer behind one corporation's structure rows. */
export function corpStructuresKey(corporationId: number): EsiStoreKey {
  return { route: '/corporations/{corporation_id}/structures/', holder: { kind: 'corporation', id: corporationId } };
}

/** The stored answers a corp structures refresh would check: one per corporation an eligible member belongs to. */
export function corpStructuresDueKeys(owners: readonly EnumeratedOwner[]): EsiStoreKey[] {
  return [...corporationsOf(owners, canSyncCorpStructures).keys()].map(corpStructuresKey);
}
