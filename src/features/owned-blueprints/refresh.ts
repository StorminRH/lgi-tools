// The on-view owned-blueprints refresh (MIGRATE.0; engine-backed since MIGRATE.D.2).
// PURE orchestration: refreshOwnedBlueprintsForUser builds an OwnerSyncDescriptor
// from the injected port (types.ts) + this slice's pure helpers and hands it to the
// shared per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so
// it stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/owned-blueprints-sync.ts.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh
// owner does zero work — for both owner types), runs the character pass then the corp
// pass in series, and resolves a corp Director among the member characters. That dance
// is unchanged from the hand-written version this replaced; refresh.test.ts pins the
// byte-identical behaviour. Per-owner specifics stay here: the basePath per owner type,
// the eligibility scopes, the Director role, and the blueprint projection.
import { type OwnerSyncDescriptor, planRead, runOwnerSync } from '@/lib/owner-sync';
import { CORP_BLUEPRINTS_REQUIRED_ROLES, canSyncCorpBlueprints } from './corp-sync-eligibility';
import { type OwnedBlueprint, parseBlueprintsBody } from './esi-projection';
import { isBlueprintsStale } from './staleness';
import { canSyncBlueprints } from './sync-eligibility';
import type { OwnedBlueprintsPort, OwnerKey, OwnerSyncState } from './types';

// The save payload the engine carries from fetchAndPlan to save (per-owner replace-all).
interface BlueprintsSave {
  rows: OwnedBlueprint[];
  etags: string[];
}

// Both owner types share the identical row shape + 3600s cache; only the path differs.
function blueprintsBasePath(owner: OwnerKey): string {
  return owner.ownerType === 'character'
    ? `/characters/${owner.ownerId}/blueprints/`
    : `/corporations/${owner.ownerId}/blueprints/`;
}

function makeDescriptor(port: OwnedBlueprintsPort): OwnerSyncDescriptor<OwnerKey, OwnerSyncState, BlueprintsSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listCharacters(userId),
    vendToken: (characterId) => port.vendToken(characterId),
    isStale: (state, now) => isBlueprintsStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => canSyncBlueprints(owner),
      ownerOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    },
    corpAxis: {
      eligible: (owner) => canSyncCorpBlueprints(owner),
      ownerOf: (_userId, corporationId) => ({ ownerType: 'corporation', ownerId: corporationId }),
      requiredRoles: CORP_BLUEPRINTS_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readBlueprints(blueprintsBasePath(owner), accessToken, state?.pageEtags ?? []);
      return planRead(read, (fresh) => {
        const rows = parseBlueprintsBody(fresh.items);
        return rows === null ? null : { rows, etags: fresh.etags };
      });
    },
    save: (owner, payload) => port.saveBlueprints(owner, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner),
  };
}

export async function refreshOwnedBlueprintsForUser(port: OwnedBlueprintsPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}
