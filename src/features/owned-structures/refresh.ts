// The on-view corp owned-structures refresh (3.7.9; engine-backed). PURE
// orchestration: refreshCorpStructuresForUser builds an OwnerSyncDescriptor from the
// injected port (types.ts) + this slice's pure helpers and hands it to the shared
// per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so it
// stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/corp-structures-sync.ts.
//
// The SHARED-PER-CORP descriptor (the first of its kind): the corp axis's `ownerOf`
// IGNORES the userId, so every eligible member's refresh resolves to the SAME
// corp-keyed owner — one shared row set, read by all members. The engine checks the
// shared staleness stamp BEFORE any vend or roles read, so the first member's view
// per window does the ESI work and every other member's view inside the window does
// nothing. A corp with no Station_Manager member resolves to `needs_role`, which —
// with NO saveGateState defined — is a plain skip: a role-less member's refresh never
// clobbers the shared catalogue a Station_Manager populated.
import { type OwnerSyncDescriptor, planRead, runOwnerSync } from '@/lib/owner-sync';
import { CORP_STRUCTURES_REQUIRED_ROLES, canSyncCorpStructures } from './corp-sync-eligibility';
import { type ParsedCorpStructure, parseCorpStructuresBody } from './esi-projection';
import { isStructuresStale } from './staleness';
import type { CorpOwner, CorpStructuresPort, CorpStructuresSyncState } from './types';

// The save payload the engine carries from fetchAndPlan to save (per-corp replace-all).
interface StructuresSave {
  rows: ParsedCorpStructure[];
  etags: string[];
}

function makeDescriptor(
  port: CorpStructuresPort,
): OwnerSyncDescriptor<CorpOwner, CorpStructuresSyncState, StructuresSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listMembers(userId),
    identityOf: (owner) => ({ ownerType: 'corporation', ownerId: owner.corporationId }),
    vendToken: (characterId) => port.vendToken(characterId),
    // Consent gate, FIRST in the engine — a corp that hasn't opted in is skipped
    // before any staleness check, vend, or roles read (zero ESI, zero rows).
    precondition: (owner) => port.isSharingEnabled(owner.corporationId),
    isStale: (state, now) => isStructuresStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpStructures(owner),
      // userId IGNORED — the owner key is the corp alone, so every eligible member's
      // refresh maps to the same shared row (the per-corp shared store).
      ownerOf: (_userId, corporationId) => ({ corporationId }),
      requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner.corporationId),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readStructures(owner.corporationId, accessToken, state?.pageEtags ?? []);
      // No mapError: an error (incl. a mid-run 403) is a skip — keep the stored
      // catalogue and retry next view, never a destructive drop of the shared board.
      return planRead(read, (fresh) => {
        const rows = parseCorpStructuresBody(fresh.items);
        return rows === null ? null : { rows, etags: fresh.etags };
      });
    },
    save: (owner, payload) => port.saveStructures(owner.corporationId, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner.corporationId),
    // NO saveGateState — see the header: a role-less member's needs_role is a skip.
  };
}

export async function refreshCorpStructuresForUser(port: CorpStructuresPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}
