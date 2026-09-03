// per window does the ESI work and every other member's view inside the window does

import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { makeCorpDescriptor, planRead, runOwnerSync } from '@/platform/owner-sync';
import { CORP_STRUCTURES_REQUIRED_ROLES, canSyncCorpStructures } from './corp-sync-eligibility';
import { type ParsedCorpStructure, parseCorpStructuresBody } from './esi-projection';
import type { CorpOwner, CorpStructuresPort, CorpStructuresSyncState } from './types';

const STRUCTURES_FRESHNESS = freshnessGate('owned_structures');

interface StructuresSave {
  rows: ParsedCorpStructure[];
  etags: string[];
}

function makeDescriptor(port: CorpStructuresPort) {
  return makeCorpDescriptor<CorpOwner, CorpStructuresSyncState, StructuresSave>(port, {

    ownerOf: (_userId, corporationId) => ({ corporationId }),
    eligible: (owner) => canSyncCorpStructures(owner),
    requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,

    precondition: (owner) => port.isSharingEnabled(owner.corporationId),
    isStale: STRUCTURES_FRESHNESS.isStale,
    readState: (owner) => port.readSyncState(owner.corporationId),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readStructures(owner.corporationId, accessToken, state?.pageEtags ?? []);

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
