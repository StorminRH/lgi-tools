// The on-view owned-assets refresh (3.7.7.1; engine-backed since MIGRATE.D.2, descriptor
// via the shared builder since 3.7.30.1). PURE orchestration: refreshOwnedAssetsForUser
// builds a paged-owned OwnerSyncDescriptor from the injected port (types.ts) + this
// slice's per-dataset knobs and hands it to the shared per-owner sync engine
// (src/platform/owner-sync). It imports no auth and no DB, so it stays inside the feature
// boundary and is unit-tested with a fake port. The real port is wired in
// src/db/owned-assets-sync.ts. A direct mirror of owned-blueprints.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh owner
// does zero work — for both owner types), runs the character pass then the corp pass,
// and resolves a corp Director among the member characters. The aggregate-at-write
// summing is the only owned-assets specific — it lives in parseAssetsBody, not here;
// refresh.test.ts pins the byte-identical behaviour.
import {
  makeOwnedDescriptor,
  runOwnerSync,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
} from '@/platform/owner-sync';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { CORP_ASSETS_REQUIRED_ROLES, canSyncCorpAssets } from './corp-sync-eligibility';
import { parseAssetsBody } from './esi-projection';
import { canSyncAssets } from './sync-eligibility';
import type { OwnedAssetsPort } from './types';

const ASSETS_FRESHNESS = freshnessGate('owned_assets');

/**
 * Refreshes every eligible personal and corporation asset owner visible to one user and returns
 * the merged stored projection.
 */
export function refreshOwnedAssetsForUser(
  port: OwnedAssetsPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(
    makeOwnedDescriptor(port, {
      resource: 'assets',
      isStale: ASSETS_FRESHNESS.isStale,
      eligibleCharacter: canSyncAssets,
      eligibleCorp: canSyncCorpAssets,
      requiredRoles: CORP_ASSETS_REQUIRED_ROLES,
      parse: parseAssetsBody,
    }),
    userId,
    options,
  );
}
