// The on-view owned-assets refresh (3.7.7.1; engine-backed since MIGRATE.D.2). PURE
// orchestration: refreshOwnedAssetsForUser builds an OwnerSyncDescriptor from the
// injected port (types.ts) + this slice's pure helpers and hands it to the shared
// per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so it
// stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/owned-assets-sync.ts. A direct mirror of owned-blueprints.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh
// owner does zero work — for both owner types), runs the character pass then the corp
// pass, and resolves a corp Director among the member characters. The aggregate-at-
// write summing is the only owned-assets specific — it lives in parseAssetsBody, not
// here; refresh.test.ts pins the byte-identical behaviour.
import { type OwnerSyncDescriptor, planRead, runOwnerSync } from '@/lib/owner-sync';
import { CORP_ASSETS_REQUIRED_ROLES, canSyncCorpAssets } from './corp-sync-eligibility';
import { type OwnedAsset, parseAssetsBody } from './esi-projection';
import { isAssetsStale } from './staleness';
import { canSyncAssets } from './sync-eligibility';
import type { OwnedAssetsPort, OwnerKey, OwnerSyncState } from './types';

// The save payload the engine carries from fetchAndPlan to save (per-owner replace-all).
interface AssetsSave {
  rows: OwnedAsset[];
  etags: string[];
}

function assetsBasePath(owner: OwnerKey): string {
  return owner.ownerType === 'character'
    ? `/characters/${owner.ownerId}/assets/`
    : `/corporations/${owner.ownerId}/assets/`;
}

function makeDescriptor(port: OwnedAssetsPort): OwnerSyncDescriptor<OwnerKey, OwnerSyncState, AssetsSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listCharacters(userId),
    vendToken: (characterId) => port.vendToken(characterId),
    isStale: (state, now) => isAssetsStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => canSyncAssets(owner),
      ownerOf: (characterId) => ({ ownerType: 'character', ownerId: characterId }),
    },
    corpAxis: {
      eligible: (owner) => canSyncCorpAssets(owner),
      ownerOf: (_userId, corporationId) => ({ ownerType: 'corporation', ownerId: corporationId }),
      requiredRoles: CORP_ASSETS_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner),
    fetchAndPlan: async (owner, accessToken, state) => {
      const read = await port.readAssets(assetsBasePath(owner), accessToken, state?.pageEtags ?? []);
      return planRead(read, (fresh) => {
        const rows = parseAssetsBody(fresh.items);
        return rows === null ? null : { rows, etags: fresh.etags };
      });
    },
    save: (owner, payload) => port.saveAssets(owner, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner),
  };
}

export async function refreshOwnedAssetsForUser(port: OwnedAssetsPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}
