import type { EsiReadSession } from '@/data/esi-store/session';
import { makeCorpDescriptor, type PagedOwnerSyncState, planRead, runOwnerSync } from '@/platform/owner-sync';
import { CORP_STRUCTURES_REQUIRED_ROLES, canSyncCorpStructures } from './corp-sync-eligibility';
import { type ParsedCorpStructure, parseCorpStructuresBody } from './esi-projection';
import type { CorpOwner, CorpStructuresPort } from './types';

interface StructuresSave {
  rows: ParsedCorpStructure[];
  etags: string[];
}

function makeDescriptor(port: CorpStructuresPort) {
  return makeCorpDescriptor<CorpOwner, PagedOwnerSyncState, StructuresSave, EsiReadSession>(port, {
    ownerOf: (_userId, corporationId) => ({ corporationId }),
    eligible: canSyncCorpStructures,
    requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,
    isDue: (owner) => port.isDue(owner.corporationId),
    readState: (owner) => port.readSyncState(owner.corporationId),
    fetchAndPlan: async (owner, accessToken, _state, session) => {
      const read = await port.readStructures(session, owner.corporationId, accessToken);
      return planRead(read, (fresh) => {
        const rows = parseCorpStructuresBody(fresh.items);
        return rows === null ? null : { rows, etags: fresh.etags };
      });
    },
    save: (owner, payload) => port.saveStructures(owner.corporationId, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner.corporationId),
  });
}

export async function refreshCorpStructuresForUser(port: CorpStructuresPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}
