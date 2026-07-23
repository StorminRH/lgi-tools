// The on-view corp owned-structures refresh (3.7.9; engine-backed). PURE
// orchestration: refreshCorpStructuresForUser builds an OwnerSyncDescriptor from the
// injected port (types.ts) + this slice's pure helpers and hands it to the shared
// per-owner sync engine (src/platform/owner-sync). It imports no auth and no DB, so it
// stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/corp-structures-sync.ts.
//
// The SHARED-PER-CORP descriptor (the first of its kind): the corp axis's `ownerOf`
// IGNORES the userId, so every eligible member's refresh resolves to the SAME
// corp-keyed owner — one shared row set, read by all members. The engine checks the
// shared staleness stamp BEFORE any vend or roles read, so the first member's view
// per window does the ESI work and every other member's view inside the window does
// nothing. The shared corporation descriptor owns that common plumbing. A corp with
// no Station_Manager member resolves to `needs_role`, which — with NO saveGateState
// defined — is a plain skip, so a role-less member never clobbers the shared catalogue.
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { makeCorpDescriptor, planRead, runOwnerSync } from '@/platform/owner-sync';
import { CORP_STRUCTURES_REQUIRED_ROLES, canSyncCorpStructures } from './corp-sync-eligibility';
import { type ParsedCorpStructure, parseCorpStructuresBody } from './esi-projection';
import type { CorpOwner, CorpStructuresPort, CorpStructuresSyncState } from './types';

const STRUCTURES_FRESHNESS = freshnessGate('owned_structures');

// The save payload the engine carries from fetchAndPlan to save (per-corp replace-all).
interface StructuresSave {
  rows: ParsedCorpStructure[];
  etags: string[];
}

function makeDescriptor(port: CorpStructuresPort) {
  return makeCorpDescriptor<CorpOwner, CorpStructuresSyncState, StructuresSave>(port, {
    // userId IGNORED — every eligible member maps to the same shared corp row.
    ownerOf: (_userId, corporationId) => ({ corporationId }),
    eligible: (owner) => canSyncCorpStructures(owner),
    requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,
    // Consent gate, FIRST in the engine — a corp that hasn't opted in is skipped
    // before any staleness check, vend, or roles read (zero ESI, zero rows).
    precondition: (owner) => port.isSharingEnabled(owner.corporationId),
    isStale: STRUCTURES_FRESHNESS.isStale,
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
  });
}

/**
 * Refreshes corporation structures for every eligible linked character and returns the merged
 * stored projection.
 */
export async function refreshCorpStructuresForUser(port: CorpStructuresPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}
